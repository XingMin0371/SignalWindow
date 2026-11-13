import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip, brotliCompress, constants as zlibConstants } from "node:zlib";
import { promisify } from "node:util";
import { WebSocketServer, WebSocket } from "ws";
import { OneBotClient } from "./onebot.mjs";
import { store, MEDIA_DIR } from "./store.mjs";
import { sanitizeParts } from "./message.mjs";
import { loadProfiles, normalizeProfile, saveProfiles } from "./upstreams.mjs";
import { importAvailable, importPrivateHistory, listPrivateSessions } from "./astrbot-import.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../../apps/web/dist");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const TOKEN = process.env.GATEWAY_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const TRUSTED_PROXY_IPS = new Set(String(process.env.TRUSTED_PROXY_IPS || "").split(",").map((value) => value.trim()).filter(Boolean));
const SESSION_COOKIE = "slw_session";
const SESSION_COOKIE_SECURE = "__Host-slw_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 100);
const MAX_CLIENTS_PER_IP = Number(process.env.MAX_CLIENTS_PER_IP || 20);

let profiles = await loadProfiles();
const profileMap = new Map();
const onebots = new Map();
const clients = new Set();
const recentSendIds = new Map();
const staticCache = new Map();
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

function publicProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    selfId: profile.selfId,
    privateUserId: profile.privateUserId,
    privateUserIds: profile.privateUserIds,
    groupId: profile.groupId,
    groupIds: profile.groupIds,
  };
}
function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount > 4 * 1024 * 1024) {
      console.warn("[broadcast] slow client terminated", { buffered: ws.bufferedAmount });
      ws.terminate();
      continue;
    }
    if (ws.bufferedAmount > 1024 * 1024) {
      if (!ws.gapSent) {
        ws.gapSent = true;
        ws.send(JSON.stringify({ type: "gap" }));
      }
      continue;
    }
    ws.gapSent = false;
    ws.send(data);
  }
}
function broadcastProfiles() {
  broadcast({
    type: "profiles",
    profiles: [...profileMap.values()].map(publicProfile),
    onebots: Object.fromEntries([...onebots].map(([id, client]) => [id, client.connected])),
  });
}
function startClient(profile) {
  onebots.get(profile.id)?.stop();
  const client = new OneBotClient({
    ...profile,
    onReply: async ({ profile: profileId, conversation, targetId, parts }) => {
      const message = await store.add({
        profile: profileId,
        conversation,
        targetId,
        role: "assistant",
        parts,
        source: "onebot",
      });
      broadcast({ type: "message", message });
      return message;
    },
  });
  client.on("status", (status) => broadcast({
    type: "status",
    profile: profile.id,
    label: profile.label,
    onebot: status,
  }));
  onebots.set(profile.id, client);
  client.start();
}
function addProfile(raw) {
  const existing = profileMap.get(String(raw?.id || ""));
  const sameEndpoint = existing && String(raw.wsUrl || "") === String(existing.wsUrl || "");
  const input = existing && sameEndpoint && !raw.accessToken ? { ...raw, accessToken: existing.accessToken } : raw;
  const profile = normalizeProfile(input, profileMap.size);
  profileMap.set(profile.id, profile);
  profiles = [...profileMap.values()];
  startClient(profile);
  return profile;
}
async function replaceProfiles(rawProfiles) {
  if (!Array.isArray(rawProfiles)) throw new Error("profiles 必须是数组");
  const ids = new Set();
  const next = rawProfiles.map((raw, index) => {
    const existing = profileMap.get(String(raw?.id || ""));
    const sameEndpoint = existing && String(raw?.wsUrl || "") === String(existing.wsUrl || "");
    const input = existing && sameEndpoint && !raw.accessToken ? { ...raw, accessToken: existing.accessToken } : raw;
    const profile = normalizeProfile(input, index);
    if (ids.has(profile.id)) throw new Error(`重复的 profile id: ${profile.id}`);
    ids.add(profile.id);
    return profile;
  });
  await saveProfiles(next);
  for (const client of onebots.values()) client.stop();
  onebots.clear();
  profileMap.clear();
  for (const profile of next) {
    profileMap.set(profile.id, profile);
    startClient(profile);
  }
  profiles = [...next];
  broadcastProfiles();
  return profiles;
}

function targetsFor(profile, conversation) {
  return conversation === "group" ? profile.groupIds || [] : profile.privateUserIds || [];
}
function resolveTarget(profile, conversation, requested) {
  const allowed = targetsFor(profile, conversation);
  const target = String(requested || allowed[0] || "");
  return allowed.includes(target) ? target : "";
}
for (const profile of profiles) {
  profileMap.set(profile.id, profile);
  startClient(profile);
}

function normalizeIp(raw) {
  let value = String(raw || "").trim().toLowerCase();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value.replace(/^\[|\]$/g, "");
}

function ipv4Number(value) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipMatches(remote, pattern) {
  const normalized = normalizeIp(pattern);
  if (!normalized.includes("/")) return normalizeIp(remote) === normalized;
  const [network, bitsRaw] = normalized.split("/");
  const bits = Number(bitsRaw);
  const remoteNumber = ipv4Number(normalizeIp(remote));
  const networkNumber = ipv4Number(network);
  if (remoteNumber === null || networkNumber === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (remoteNumber & mask) === (networkNumber & mask);
}

function trustedProxy(req) {
  if (!TRUST_PROXY || !TRUSTED_PROXY_IPS.size) return false;
  const remote = req.socket.remoteAddress || "";
  return [...TRUSTED_PROXY_IPS].some((pattern) => ipMatches(remote, pattern));
}

function clientIp(req) {
  if (trustedProxy(req)) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return normalizeIp(forwarded);
  }
  return normalizeIp(req.socket.remoteAddress || "unknown");
}

const authFailures = new Map();
const apiRates = new Map();

function apiRateLimited(req, limit = 120, windowMs = 10_000, bucket = "api") {
  const ip = clientIp(req);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (apiRates.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) { apiRates.set(key, recent); return true; }
  recent.push(now);
  apiRates.set(key, recent);
  return false;
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function rateLimited(req) {
  const key = clientIp(req);
  const now = Date.now();
  const recent = (authFailures.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 10) { authFailures.set(key, recent); return true; }
  authFailures.set(key, recent);
  return false;
}
function noteAuthFailure(req) {
  const key = clientIp(req);
  const now = Date.now();
  const recent = (authFailures.get(key) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  authFailures.set(key, recent);
}
function cookieValue(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return "";
}
function secureRequest(req) {
  return trustedProxy(req) && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}
function sessionCookieName(secure) {
  return secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE;
}
function createSession(req, res) {
  const secure = secureRequest(req);
  const name = sessionCookieName(secure);
  const previous = cookieValue(req, name) || cookieValue(req, SESSION_COOKIE);
  if (previous) sessions.delete(previous);
  const id = crypto.randomBytes(32).toString("base64url");
  sessions.set(id, Date.now() + SESSION_TTL_MS);
  res.setHeader("Set-Cookie", `${name}=${id}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`);
}
function clearSession(req, res) {
  const id = cookieValue(req, SESSION_COOKIE_SECURE) || cookieValue(req, SESSION_COOKIE);
  if (id) sessions.delete(id);
  const expired = "Path=/; SameSite=Strict; Max-Age=0; HttpOnly";
  res.setHeader("Set-Cookie", [`${SESSION_COOKIE}=; ${expired}`, `${SESSION_COOKIE_SECURE}=; ${expired}; Secure`]);
}
function sessionValid(req) {
  const id = cookieValue(req, SESSION_COOKIE_SECURE) || cookieValue(req, SESSION_COOKIE);
  if (!id) return false;
  const expires = sessions.get(id);
  if (!expires || expires < Date.now()) { sessions.delete(id); return false; }
  return true;
}
function authorized(req) {
  if (!TOKEN) return true;
  if (sessionValid(req)) return true;
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  return safeEqual(supplied, TOKEN);
}
function originAllowed(req) {
  const origin = String(req.headers.origin || "");
  // Non-browser clients do not send Origin. Keep them working unless the
  // deployment explicitly opts into browser-only enforcement.
  if (!origin) return process.env.REQUIRE_ORIGIN !== "1";
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin);
  try { return new URL(origin).host === String(req.headers.host || ""); } catch { return false; }
}
setInterval(() => {
  const now = Date.now();
  for (const [id, expires] of sessions) if (expires < now) sessions.delete(id);
  for (const [key, times] of authFailures) if (!times.some((time) => now - time < 60_000)) authFailures.delete(key);
  for (const [key, times] of apiRates) if (!times.some((time) => now - time < 10_000)) apiRates.delete(key);
  for (const [clientId, at] of recentSendIds) if (now - at > 10 * 60_000) recentSendIds.delete(clientId);
}, 10 * 60_000).unref();
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/media/") && apiRateLimited(req)) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "too many requests" }));
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: https: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (trustedProxy(req) && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (req.method === "POST" && url.pathname === "/api/session") {
    try {
      const body = await readJson(req);
      if (TOKEN && !safeEqual(String(body.token || ""), TOKEN)) {
        if (rateLimited(req)) {
          res.writeHead(429, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "too many attempts" }));
          return;
        }
        noteAuthFailure(req);
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      createSession(req, res);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname === "/api/session") {
    if (authorized(req) && url.searchParams.get("all") === "1") {
      sessions.clear();
    }
    clearSession(req, res);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/profiles/test") {
    if (apiRateLimited(req, 10, 60_000, "profile-test")) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "too many profile tests" }));
      return;
    }
    try {
      const body = await readJson(req);
      const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") || body.token || "";
      if (TOKEN && !authorized(req) && !safeEqual(supplied, TOKEN)) {
        if (rateLimited(req)) {
          res.writeHead(429, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "too many attempts" }));
          return;
        }
        noteAuthFailure(req);
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      // A connection test must never reuse an existing profile token for a
      // caller-supplied URL. Only an explicitly supplied token is used.
      const profile = normalizeProfile(body.profile || body, 0);
      const result = await new Promise((resolve) => {
        const socket = new WebSocket(profile.wsUrl, {
          headers: {
            "X-Self-ID": profile.selfId,
            "X-Client-Role": "Universal",
            ...(profile.accessToken ? { Authorization: `Bearer ${profile.accessToken}` } : {}),
          },
        });
        const timer = setTimeout(() => {
          socket.close();
          resolve({ ok: false, detail: "unreachable" });
        }, 6000);
        socket.on("open", () => {
          clearTimeout(timer);
          socket.close();
          resolve({ ok: true, detail: "connected" });
        });
        socket.on("error", (error) => {
          clearTimeout(timer);
          console.error("[profile-test]", error.message);
          resolve({ ok: false, detail: "unreachable" });
        });
      });
      // Reduce the open/closed-port timing oracle without making the UI feel
      // slow; both outcomes wait at least the same short floor.
      await new Promise((resolve) => setTimeout(resolve, 350));
      res.writeHead(result.ok ? 200 : 502, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error("[profile-test]", error.message);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, detail: "invalid profile" }));
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/profiles") {
    try {
      const body = await readJson(req);
      const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") || body.token || "";
      if (TOKEN && !authorized(req) && !safeEqual(supplied, TOKEN)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const next = await replaceProfiles(body.profiles);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, profiles: next.map(publicProfile) }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/profiles") {
    try {
      const body = await readJson(req);
      const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") || body.token || "";
      if (TOKEN && !authorized(req) && !safeEqual(supplied, TOKEN)) {
        if (rateLimited(req)) {
          res.writeHead(429, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "too many attempts" }));
          return;
        }
        noteAuthFailure(req);
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const profile = addProfile(body.profile || body);
      await saveProfiles([...profileMap.values()]);
      broadcastProfiles();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, profile: publicProfile(profile) }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/profiles/")) {
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const id = decodeURIComponent(url.pathname.slice("/api/profiles/".length));
    const profile = profileMap.get(id);
    if (!profile) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ...publicProfile(profile), wsUrl: profile.wsUrl, accessToken: "" }));
    return;
  }

  if (url.pathname === "/api/health") {
    const visible = !TOKEN || authorized(req);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      onebot: visible && [...onebots.values()].some((client) => client.connected),
      onebots: visible ? Object.fromEntries([...onebots].map(([id, client]) => [id, client.connected])) : {},
      service: "signal-window",
    }));
    return;
  }
  if (url.pathname === "/api/config") {
    const authenticated = !TOKEN || authorized(req);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      profiles: authenticated ? [...profileMap.values()].map(publicProfile) : [],
      setupRequired: authenticated && profiles.length === 0,
      authRequired: Boolean(TOKEN),
      authenticated,
    }));
    return;
  }
  if (url.pathname === "/api/import/sessions" && (req.method === "GET" || req.method === "POST")) {
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (!importAvailable()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "AstrBot 数据库未挂载" }));
      return;
    }
    const allowed = [...new Set(profiles.flatMap((profile) => profile.privateUserIds || []))];
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ sessions: listPrivateSessions(allowed) }));
      return;
    }
    try {
      const body = await readJson(req);
      const requested = Array.isArray(body.targets) ? body.targets.map(String) : [];
      const selected = requested.filter((targetId) => allowed.includes(targetId));
      let imported = 0;
      for (const targetId of selected) {
        const profile = profiles.find((item) => (item.privateUserIds || []).includes(targetId));
        if (profile) imported += await importPrivateHistory({ store, profile, targetId });
      }
      broadcast({ type: "history-imported", count: imported, targets: selected });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, imported, targets: selected }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (url.pathname === "/api/messages") {
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const requested = url.searchParams.get("profile");
    const profile = profileMap.has(requested) ? profileMap.get(requested) : profiles[0];
    const conversation = url.searchParams.get("conversation") === "group" ? "group" : "private";
    const targetId = profile ? resolveTarget(profile, conversation, url.searchParams.get("targetId")) : "";
    res.writeHead(200, { "content-type": "application/json" });
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 40));
    const beforeId = url.searchParams.get("beforeId") || "";
    res.end(JSON.stringify(profile && targetId ? store.list(profile.id, conversation, targetId, targetsFor(profile, conversation)[0], limit, beforeId) : []));
    return;
  }

  if (url.pathname.startsWith("/api/media/")) {
    if (apiRateLimited(req, 600, 10_000, "media")) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "too many requests" }));
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const name = decodeURIComponent(url.pathname.slice("/api/media/".length));
    if (!/^[a-f0-9]{40}\.[a-z0-9]{1,8}$/i.test(name)) {
      res.writeHead(404); res.end("not found"); return;
    }
    try {
      const mediaPath = path.join(MEDIA_DIR, name);
      const stat = await fs.stat(mediaPath);
      if (!stat.isFile()) throw new Error("not a file");
      const ext = path.extname(name).slice(1).toLowerCase();
      const types = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", bmp: "image/bmp", mp3: "audio/mpeg", wav: "audio/wav",
        ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
        pdf: "application/pdf", txt: "text/plain; charset=utf-8", json: "application/json; charset=utf-8",
      };
      let start = 0;
      let end = stat.size - 1;
      let status = 200;
      const range = String(req.headers.range || "");
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        if (match[1] === "" && match[2] !== "") {
          start = Math.max(0, stat.size - Number(match[2]));
        } else {
          start = Number(match[1] || 0);
          if (match[2] !== "") end = Math.min(end, Number(match[2]));
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
          res.writeHead(416, { "content-range": `bytes */${stat.size}` }); res.end(); return;
        }
        status = 206;
      }
      const headers = {
        "content-type": types[ext] || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        "accept-ranges": "bytes",
        "content-length": end - start + 1,
      };
      if (status === 206) headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
      res.writeHead(status, headers);
      const stream = createReadStream(mediaPath, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      res.writeHead(404); res.end("not found");
    }
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.resolve(PUBLIC_DIR, `.${filePath}`);
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403); res.end(); return;
  }
  try {
    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
    const headers = {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    };
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.writeHead(404); res.end("not found"); return;
    }
    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    headers.etag = etag;
    headers.vary = "Accept-Encoding";
    if (String(req.headers["if-none-match"] || "") === etag) {
      res.writeHead(304, headers); res.end(); return;
    }
    const accepted = String(req.headers["accept-encoding"] || "");
    const encoding = [".html", ".js", ".css", ".json", ".svg", ".webmanifest"].includes(ext) && stat.size >= 1024
      ? (/(^|,)\s*br\b/i.test(accepted) ? "br" : /(^|,)\s*gzip\b/i.test(accepted) ? "gzip" : "")
      : "";
    const cacheKey = `${filePath}:${encoding}`;
    const cached = staticCache.get(cacheKey);
    let body;
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      body = cached.body;
    } else {
      body = await fs.readFile(filePath);
      if (encoding === "br") {
        body = await brotliAsync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
      } else if (encoding === "gzip") {
        body = await gzipAsync(body, { level: 6 });
      }
      if (staticCache.size > 128) staticCache.clear();
      staticCache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, body });
    }
    if (encoding) headers["content-encoding"] = encoding;
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
server.on("connection", (socket) => socket.setNoDelay(true));
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.on("clientError", (error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  else socket.destroy();
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 10 * 1024 * 1024,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
  handleProtocols: (protocols) => { const list = protocols instanceof Set ? [...protocols] : protocols; return list.includes("signal-window") ? "signal-window" : false; } });
function sendHistory(ws, profile, conversation, targetId, beforeId = "", limit = 40, requestId = "") {
  const current = profileMap.get(profile);
  if (!current) return;
  const target = resolveTarget(current, conversation, targetId);
  if (!target) return;
  const pageLimit = Math.max(1, Math.min(100, Number(limit) || 40));
  const messages = store.list(profile, conversation, target, targetsFor(current, conversation)[0], pageLimit, String(beforeId || ""));
  ws.send(JSON.stringify({
    type: "history",
    profile,
    conversation,
    targetId: target,
    prepend: Boolean(beforeId),
    hasMore: messages.length >= pageLimit,
    requestId,
    messages,
  }));
}
const wsHeartbeat = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30_000);
wsHeartbeat.unref();

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  const ip = clientIp(req);
  const ipCount = [...clients].filter((client) => client.remoteAddress === ip).length;
  if (clients.size >= MAX_CLIENTS || ipCount >= MAX_CLIENTS_PER_IP || !originAllowed(req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map((v) => v.trim());
  const protocolToken = process.env.ALLOW_PROTOCOL_TOKEN === "1"
    ? protocols.find((value) => value.startsWith("auth."))?.slice(5) || ""
    : "";
  let decodedProtocolToken = "";
  try { decodedProtocolToken = protocolToken ? Buffer.from(protocolToken, "base64url").toString("utf8") : ""; } catch {}
  const supplied = decodedProtocolToken || (process.env.ALLOW_QUERY_TOKEN === "1" ? url.searchParams.get("token") || "" : "");
  if (url.pathname !== "/ws" || (TOKEN && !authorized(req) && !safeEqual(supplied, TOKEN))) {
    if (TOKEN) noteAuthFailure(req);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.remoteAddress = ip;
    ws.isAlive = true;
    ws.messageWindow = [];
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("close", () => clients.delete(ws));
    ws.on("message", async (raw) => {
      const now = Date.now();
      ws.messageWindow = ws.messageWindow.filter((time) => now - time < 10_000);
      if (ws.messageWindow.length >= 60) {
        ws.close(1008, "rate limit");
        return;
      }
      ws.messageWindow.push(now);
      let payload;
      try { payload = JSON.parse(raw.toString()); } catch { return; }
      if (payload.type === "history") {
        const profile = profileMap.has(payload.profile) ? payload.profile : profiles[0]?.id;
        if (profile) sendHistory(
          ws,
          profile,
          payload.conversation === "group" ? "group" : "private",
          payload.targetId,
          payload.beforeId,
          payload.limit,
          payload.requestId,
        );
        return;
      }
      if (payload.type !== "send") return;
      const clientId = String(payload.clientId || "");
      if (clientId && !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) {
        ws.send(JSON.stringify({ type: "error", clientId: "", detail: "invalid clientId" }));
        return;
      }
      if (clientId && recentSendIds.has(clientId)) {
        ws.send(JSON.stringify({ type: "ack", clientId }));
        return;
      }
      const profileId = profileMap.has(payload.profile) ? payload.profile : profiles[0]?.id;
      if (!profileId) {
        ws.send(JSON.stringify({ type: "error", clientId, detail: "尚未配置 AstrBot" }));
        return;
      }
      const parts = sanitizeParts(
        Array.isArray(payload.parts)
          ? payload.parts
          : [{ type: "text", text: String(payload.text ?? "") }],
      );
      if (!parts.length) {
        ws.send(JSON.stringify({ type: "error", clientId, profile: profileId, detail: "empty message" }));
        return;
      }
      const conversation = payload.conversation === "group" ? "group" : "private";
      const current = profileMap.get(profileId);
      const targetId = resolveTarget(current, conversation, payload.targetId);
      if (!targetId) {
        ws.send(JSON.stringify({ type: "error", clientId, profile: profileId, detail: "会话对象未配置" }));
        return;
      }
      let message;
      try {
        message = await store.add({ profile: profileId, conversation, targetId, role: "user", parts, source: "web" });
      } catch (error) {
        ws.send(JSON.stringify({ type: "error", clientId, profile: profileId, detail: error.message }));
        return;
      }
      broadcast({ type: "message", message });
      try {
        await onebots.get(profileId).send({ conversation, targetId, parts });
      } catch (error) {
        ws.send(JSON.stringify({ type: "error", clientId, profile: profileId, detail: error.message }));
        return;
      }
      if (clientId) recentSendIds.set(clientId, Date.now());
      ws.send(JSON.stringify({ type: "ack", clientId }));
    });
    ws.send(JSON.stringify({
      type: "hello",
      profiles: [...profileMap.values()].map(publicProfile),
      onebots: Object.fromEntries([...onebots].map(([id, client]) => [id, client.connected])),
    }));
    // History is loaded lazily by the browser for the selected conversation only.
  });
});

if (TRUST_PROXY && !TRUSTED_PROXY_IPS.size) {
  console.warn("[config] TRUST_PROXY=1 但 TRUSTED_PROXY_IPS 为空，XFF 与 Secure Cookie 将被忽略");
}
const loopbackHost = ["127.0.0.1", "::1", "localhost"].includes(HOST);
if (!TOKEN && !loopbackHost) {
  console.error("GATEWAY_TOKEN is required when HOST is not loopback");
  process.exit(1);
}
const softFatalTimes = [];
function fatal(error, source = "runtime") {
  console.error(`[fatal:${source}]`, error);
  const message = String(error?.message || error || "");
  if (/EACCES|EIO|ENOSPC|SQLITE_CORRUPT|store|writeChain|fileHandle|out of memory/i.test(message)) {
    process.exit(1);
  }
  const now = Date.now();
  while (softFatalTimes.length && now - softFatalTimes[0] > 60_000) softFatalTimes.shift();
  softFatalTimes.push(now);
  if (softFatalTimes.length > 3) process.exit(1);
}
process.on("unhandledRejection", (error) => fatal(error, "unhandledRejection"));
process.on("uncaughtException", (error) => fatal(error, "uncaughtException"));

await store.init();
server.listen(PORT, HOST, () => {
  console.log(`signal-window gateway http://${HOST}:${PORT}`);
  console.log(`profiles ${profiles.map((p) => p.id).join(", ") || "none; waiting for setup"}`);
  if (process.env.ALLOW_QUERY_TOKEN === "1") {
    console.warn("SECURITY WARNING: ALLOW_QUERY_TOKEN=1 puts the gateway token in URLs and proxy logs; use the HttpOnly session cookie or Authorization header instead.");
  }
  if (process.env.ALLOW_PROTOCOL_TOKEN === "1") {
    console.warn("SECURITY WARNING: ALLOW_PROTOCOL_TOKEN=1 enables the legacy auth subprotocol token; prefer the HttpOnly session cookie.");
  }
});

async function shutdown() {
  for (const client of onebots.values()) client.stop();
  await store.close().catch((error) => console.error("store flush failed", error));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
