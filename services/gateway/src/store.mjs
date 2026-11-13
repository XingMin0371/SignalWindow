import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import crypto from "node:crypto";
import { resolveFromRoot } from "./env.mjs";
import { partsToText } from "./message.mjs";

const DATA_DIR = resolveFromRoot(process.env.DATA_DIR, "data");
const FILE = path.join(DATA_DIR, "messages.ndjson");
const LEGACY_FILE = path.join(DATA_DIR, "messages.json");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
function envInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`[config] ${name} 必须是 ${min}..${max} 的整数，收到 ${JSON.stringify(raw)}`);
    process.exit(2);
  }
  return value;
}
const MAX_MESSAGES = envInt("MAX_MESSAGES", 4000, 1, 10_000_000);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_BYTES = Number(process.env.MAX_MESSAGE_BYTES || 256 * 1024);
const MAX_RAW_MESSAGE_BYTES = Number(process.env.MAX_RAW_MESSAGE_BYTES || 12 * 1024 * 1024);
const MAX_MEDIA_TOTAL_BYTES = envInt("MAX_MEDIA_TOTAL_BYTES", 512 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER);
const MAX_MEDIA_FILES = envInt("MAX_MEDIA_FILES", 5000, 1, 10_000_000);
const COMPACT_EVERY_TRIMS = envInt("COMPACT_EVERY_TRIMS", 500, 1, 10_000_000);
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_FILE = path.join(DATA_DIR, "gateway.lock");

const mediaState = { bytes: 0, files: 0, checkedAt: 0 };
async function refreshMediaStats(force = false) {
  if (!force && Date.now() - mediaState.checkedAt < 30_000) return mediaState;
  let bytes = 0;
  let files = 0;
  try {
    const names = await fs.readdir(MEDIA_DIR);
    // Bound concurrency while avoiding 5000 serial stat calls.
    for (let index = 0; index < names.length; index += 64) {
      const batch = names.slice(index, index + 64);
      const stats = await Promise.all(batch.map(async (name) => {
        try { return await fs.stat(path.join(MEDIA_DIR, name)); } catch { return null; }
      }));
      for (const stat of stats) {
        if (!stat?.isFile()) continue;
        bytes += stat.size;
        files += 1;
      }
    }
  } catch {}
  mediaState.bytes = bytes;
  mediaState.files = files;
  mediaState.checkedAt = Date.now();
  return mediaState;
}

function keyOf(profile, conversation, targetId) {
  return `${profile}\0${conversation}\0${targetId}`;
}

function extensionFor(mime, fallback = "") {
  const match = /^[a-z0-9.+-]+\/([a-z0-9.+-]+)$/i.exec(String(mime || ""));
  const sub = match?.[1]?.toLowerCase() || "";
  const map = {
    jpeg: "jpg", jpg: "jpg", png: "png", gif: "gif", webp: "webp", bmp: "bmp",
    mpeg: "mp3", mp3: "mp3", wav: "wav", ogg: "ogg", mp4: "mp4", webm: "webm",
    quicktime: "mov", pdf: "pdf", json: "json", plain: "txt", zip: "zip",
  };
  if (map[sub]) return map[sub];
  const named = /\.([a-z0-9]{1,8})$/i.exec(String(fallback || ""));
  return named ? named[1].toLowerCase() : "bin";
}

function dataUrlBuffer(url) {
  const match = /^data:([^;,]+)?(?:;base64)?,/i.exec(String(url || ""));
  if (!match) return null;
  const comma = url.indexOf(",");
  const header = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  try {
    const data = /;base64/i.test(header)
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return { mime: match[1] || "application/octet-stream", data };
  } catch {
    return null;
  }
}

async function materializeDataUrl(url, nameHint = "") {
  if (!String(url || "").startsWith("data:")) return url;
  const decoded = dataUrlBuffer(url);
  if (!decoded || decoded.data.length > MAX_MEDIA_BYTES) return url;
  const stats = await refreshMediaStats();
  if (stats.bytes + decoded.data.length > MAX_MEDIA_TOTAL_BYTES || stats.files >= MAX_MEDIA_FILES) {
    throw new Error("media storage quota exceeded");
  }
  const ext = extensionFor(decoded.mime, nameHint);
  const hash = crypto.createHash("sha256").update(decoded.data).digest("hex").slice(0, 40);
  const filename = `${hash}.${ext}`;
  const target = path.join(MEDIA_DIR, filename);
  let created = false;
  try {
    await fs.writeFile(target, decoded.data, { mode: 0o600, flag: "wx" });
    created = true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  if (created) {
    mediaState.bytes += decoded.data.length;
    mediaState.files += 1;
  }
  return `/api/media/${filename}`;
}

async function materializeParts(parts) {
  const out = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    if (!part || typeof part !== "object") continue;
    const copy = { ...part };
    if (["image", "audio", "video", "file"].includes(copy.type) && typeof copy.url === "string") {
      copy.url = await materializeDataUrl(copy.url, copy.name || "");
    }
    out.push(copy);
  }
  return out;
}

class Store {
  constructor() {
    this.messages = [];
    this.index = new Map();
    this.positions = new Map();
    this.writeChain = Promise.resolve();
    this.seq = 0;
    this.trimmed = 0;
    this.compacting = false;
    this.fileHandle = null;
    this.lockHandle = null;
    this.pendingLines = [];
    this.pendingFlush = null;
    this.appendError = null;
  }

  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await this._acquireLock();
    // 心跳刷新锁的 mtime；另一实例据此区分「存活」与「崩溃后 PID 被复用的陈旧锁」。
    this.lockHeartbeat = setInterval(() => {
      fs.utimes(LOCK_FILE, new Date(), new Date()).catch(() => {});
    }, 30_000);
    this.lockHeartbeat.unref();
    await fs.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
    await fs.chmod(DATA_DIR, 0o700).catch(() => {});
    await fs.chmod(MEDIA_DIR, 0o700).catch(() => {});
    this.messages = await this._load();
    this._rebuildIndex();
    // Older builds stored the entire history in one pretty-printed JSON file.
    // Migrate once, keep the old file as a non-runtime backup.
    if (this.messages.length) {
      let migrated = false;
      for (const message of this.messages) {
        const before = message.parts;
        message.parts = await materializeParts(before);
        if (JSON.stringify(before) !== JSON.stringify(message.parts)) migrated = true;
        if (!message.profile) message.profile = "main";
      }
      if (migrated || !(await exists(FILE))) await this._writeSnapshot();
      await fs.rename(LEGACY_FILE, `${LEGACY_FILE}.migrated`).catch(() => {});
    } else if (!(await exists(FILE))) {
      await fs.writeFile(FILE, "", "utf8");
    }
    this._rebuildIndex();
    await this._openHandle();
    // Do not prune on startup: the NDJSON file may still contain older
    // messages outside the loaded window. Prune only after a compact snapshot.
    await refreshMediaStats(true);
  }

  async _openHandle() {
    if (!this.fileHandle) this.fileHandle = await fs.open(FILE, "a", 0o600);
    return this.fileHandle;
  }

  /**
   * 组提交：add() 只把行放进内存队列立即返回（广播因此不再等磁盘），
   * setImmediate 之后同批合并成一次 write。
   * - 顺序保证：pendingFlush 在 splice 之后才置 null，同批 Promise 不会漏行；
   * - 崩溃语义：append 路径本来就不 fsync（OS 页缓存兜底），这里只把
   *   「未落盘」窗口从 write 返回前的 0ms 放宽到 setImmediate 的 <1ms，
   *   没有扩大实际丢失等级；
   * - 磁盘错误不丢：写入失败记录到 appendError，下一次 add/flush 立即抛出，
   *   不会变成无人处理的 rejection。
   */
  _scheduleFlush() {
    if (this.pendingFlush) return this.pendingFlush;
    this.pendingFlush = new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          // Keep one write in flight at a time. New lines that arrive while
          // the write is pending are picked up by this loop, so they cannot
          // be left stranded without a future flush.
          while (this.pendingLines.length) {
            const batch = this.pendingLines.splice(0);
            const lines = batch.join("");
            const handle = await this._openHandle();
            await handle.write(lines);
          }
          this.pendingFlush = null;
          resolve();
        } catch (error) {
          this.pendingFlush = null;
          reject(error);
        }
      });
    });
    return this.pendingFlush;
  }

  _enqueueLine(line) {
    this.pendingLines.push(line);
    const flush = this._scheduleFlush();
    flush.catch((error) => {
      this.appendError = this.appendError || error;
      console.error("[store:append]", error);
    });
    return flush;
  }

  async _drainPending() {
    while (this.pendingLines.length || this.pendingFlush) {
      if (this.appendError) {
        const error = this.appendError;
        this.appendError = null;
        throw error;
      }
      this._scheduleFlush();
      await this.pendingFlush;
    }
    if (this.appendError) {
      const error = this.appendError;
      this.appendError = null;
      throw error;
    }
  }

  async _pruneMedia() {
    const referenced = new Set();
    for (const message of this.messages) {
      for (const part of message.parts || []) {
        if (typeof part?.url === "string" && part.url.startsWith("/api/media/")) {
          referenced.add(path.basename(part.url));
        }
      }
    }
    try {
      for (const name of await fs.readdir(MEDIA_DIR)) {
        if (referenced.has(name)) continue;
        await fs.unlink(path.join(MEDIA_DIR, name)).catch(() => {});
      }
    } catch {}
    await refreshMediaStats(true);
  }

  async _acquireLock() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(LOCK_FILE, "wx", 0o600);
        await handle.writeFile(`${process.pid}\n`);
        this.lockHandle = handle;
        return;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        // 陈旧锁优先按时间判定，避免 Windows 上 PID 复用导致永久无法启动。
        const stat = await fs.stat(LOCK_FILE).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.unlink(LOCK_FILE).catch(() => {});
          continue;
        }
        let owner = 0;
        try { owner = Number((await fs.readFile(LOCK_FILE, "utf8")).trim()); } catch {}
        let alive = false;
        if (owner > 0 && owner !== process.pid) {
          try { process.kill(owner, 0); alive = true; } catch (probe) { alive = probe.code === "EPERM"; }
        }
        if (alive) throw new Error("another gateway instance is using DATA_DIR");
        await fs.unlink(LOCK_FILE).catch(() => {});
      }
    }
    throw new Error("could not acquire DATA_DIR lock");
  }

  async _releaseLock() {
    if (this.lockHeartbeat) { clearInterval(this.lockHeartbeat); this.lockHeartbeat = null; }
    if (!this.lockHandle) return;
    try { await this.lockHandle.close(); } catch {}
    this.lockHandle = null;
    await fs.unlink(LOCK_FILE).catch(() => {});
  }

  async _load() {
    if (await exists(FILE)) {
      const out = [];
      const input = createReadStream(FILE, { encoding: "utf8" });
      const lines = readline.createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message && typeof message === "object") out.push(message);
            if (out.length > MAX_MESSAGES * 2) out.splice(0, out.length - MAX_MESSAGES);
          } catch {
            // Ignore a partially-written final line after an unclean shutdown.
          }
        }
      } finally {
        lines.close();
        input.destroy();
      }
      return out.slice(-MAX_MESSAGES);
    }
    try {
      const legacy = JSON.parse(await fs.readFile(LEGACY_FILE, "utf8"));
      return Array.isArray(legacy) ? legacy.slice(-MAX_MESSAGES) : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      return [];
    }
  }

  _rebuildIndex() {
    this.index = new Map();
    this.positions.clear();
    for (const message of this.messages) this._index(message);
  }

  _index(message) {
    const key = keyOf(message.profile || "main", message.conversation, message.targetId || "");
    const list = this.index.get(key) || [];
    list.push(message);
    this.index.set(key, list);
    const positions = this.positions.get(key);
    if (positions) positions.set(message.id, list.length - 1);
  }

  _trim() {
    if (this.messages.length <= MAX_MESSAGES) return;
    const remove = this.messages.length - MAX_MESSAGES;
    const removed = this.messages.splice(0, remove);
    this.trimmed += removed.length;
    // Remove only evicted messages. Rebuilding the whole index here made every
    // message O(n) after the history cap was reached.
    for (const message of removed) {
      const key = keyOf(message.profile || "main", message.conversation, message.targetId || "");
      const list = this.index.get(key);
      if (!list) continue;
      if (list[0]?.id === message.id) list.shift();
      else {
        const at = list.findIndex((item) => item.id === message.id);
        if (at >= 0) list.splice(at, 1);
      }
      // Indexes after the removal shift; invalidate lazily instead of
      // rebuilding every id position on the trim path.
      this.positions.delete(key);
      if (!list.length) this.index.delete(key);
    }
  }

  list(profile, conversation, targetId, defaultTargetId, limit = 200, beforeId = "") {
    let rows;
    if (targetId) {
      const direct = this.index.get(keyOf(profile, conversation, targetId)) || [];
      // 遗留数据修复：旧版本消息可能没有 targetId，被归入 "" 桶。
      // 只要查的是默认对象，就必须把无 targetId 的旧消息并入结果，
      // 否则一旦直连桶非空，旧历史会整段消失。
      const legacyRows = targetId === defaultTargetId
        ? (this.index.get(keyOf(profile, conversation, "")) || []).filter((message) => !message.targetId)
        : [];
      rows = legacyRows.length ? [...legacyRows, ...direct] : direct;
      if (!rows.length && !legacyRows.length && targetId !== defaultTargetId) {
        // 保留旧语义：显式 targetId 查询在直连桶为空时也尝试遗留桶的显式匹配。
        const explicit = this.index.get(keyOf(profile, conversation, "")) || [];
        rows = explicit.filter((message) => message.targetId === targetId);
      }
    } else {
      rows = this.messages.filter((message) =>
        message.profile === profile && message.conversation === conversation);
    }
    if (beforeId) {
      let at = -1;
      const directKey = targetId ? keyOf(profile, conversation, targetId) : "";
      if (directKey && this.index.get(directKey) === rows) {
        let positions = this.positions.get(directKey);
        if (!positions) {
          positions = new Map();
          for (let position = 0; position < rows.length; position += 1) {
            positions.set(rows[position].id, position);
          }
          this.positions.set(directKey, positions);
        }
        at = positions.get(beforeId) ?? -1;
        if (at < 0) at = rows.findIndex((message) => message.id === beforeId);
      } else {
        at = rows.findIndex((message) => message.id === beforeId);
      }
      if (at >= 0) {
        // Return only the page immediately before the anchor, not a copy of
        // the complete older history.
        return rows.slice(Math.max(0, at - limit), at);
      }
    }
    return rows.slice(-limit);
  }

  async add({ profile = "main", conversation, targetId = "", role, parts, source = "web" }) {
    // Keep materialization, memory mutation, append and compaction on one
    // serialized chain. This prevents a snapshot from being followed by an
    // older append of the same message.
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        if (this.appendError) {
          const error = this.appendError;
          this.appendError = null;
          throw error;
        }
        const rawSize = Buffer.byteLength(JSON.stringify({ profile, conversation, targetId, role, parts, source }), "utf8");
        if (rawSize > MAX_RAW_MESSAGE_BYTES) throw new Error("message too large");
        const durableParts = await materializeParts(parts);
        const message = {
          id: `${Date.now()}-${++this.seq}`,
          profile,
          conversation,
          targetId,
          role,
          parts: durableParts,
          text: partsToText(durableParts),
          source,
          time: new Date().toISOString(),
        };
        const line = `${JSON.stringify(message)}\n`;
        if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
          throw new Error("message too large");
        }
        this.messages.push(message);
        this._index(message);
        this._trim();
        // 不 await：广播不等磁盘；失败延迟到下一次操作抛出（见 _enqueueLine）。
        this._enqueueLine(line);
        if (this.trimmed >= COMPACT_EVERY_TRIMS && !this.compacting) {
          this.compacting = true;
          try {
            await this._drainPending();
            await this._writeSnapshot();
            await this._pruneMedia();
            this.trimmed = 0;
          } finally {
            this.compacting = false;
          }
        }
        return message;
      });
    return this.writeChain;
  }

  async importHistorical(records, targetId) {
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        const target = String(targetId || "");
        const existing = this.messages.filter((message) =>
          !(message.source === "astrbot-import" && String(message.targetId) === target));
        const existingKeys = new Set(existing
          .filter((message) => message.conversation === "private" && String(message.targetId) === target)
          .map((message) => `${message.role}\u0000${message.text || ""}`));
        const fresh = records.filter((record) =>
          !existingKeys.has(`${record.role}\u0000${record.text || ""}`));
        this.messages = [...fresh, ...existing];
        this._rebuildIndex();
        this._trim();
        await this._writeSnapshot();
        return fresh.length;
      });
    return this.writeChain;
  }

  async _writeSnapshot() {
    await this._drainPending();
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
    const snapshot = this.messages.map((message) => JSON.stringify(message)).join("\n") + "\n";
    const temporary = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
    const syncHandle = await fs.open(temporary, "r+");
    try { await syncHandle.sync(); } finally { await syncHandle.close(); }
    await renameWithRetry(temporary, FILE);
    await this._openHandle();
  }

  async flush() {
    await this.writeChain;
    await this._drainPending();
    return this.writeChain;
  }

  async close() {
    await this.flush();
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
    await this._releaseLock();
  }
}

async function renameWithRetry(from, to) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await fs.rename(from, to); return; } catch (error) {
      lastError = error;
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export const store = new Store();
