import { existsSync } from "node:fs";

// node:sqlite 只在 Node 22.5+ 存在。历史导入是可选功能，不能让它阻断网关启动。
let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { DatabaseSync = null; }

const DB_PATH = process.env.ASTRBOT_DB || "";
const PLATFORM = process.env.ASTRBOT_PLATFORM || "snowluma";
const REMINDER = /<system_reminder>[\s\S]*?<\/system_reminder>/g;
const DATETIME_HINT = /Current datetime:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/;

function openDatabase() {
  if (!DatabaseSync || !DB_PATH || !existsSync(DB_PATH)) return null;
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  db.exec("PRAGMA query_only = ON");
  return db;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "think" || part.type === "tool" || part.type === "tool_call" || part.type === "tool_result") continue;
    if (part.type === "image") { parts.push("[图片]"); continue; }
    if (part.type === "file" || part.type === "audio" || part.type === "video") { parts.push("[文件]"); continue; }
    if (typeof part.text === "string") parts.push(part.text);
    else if (typeof part.content === "string") parts.push(part.content);
  }
  return parts.join("\n").replace(REMINDER, "").trim();
}

function parseTime(raw, fallback) {
  const match = DATETIME_HINT.exec(raw);
  if (!match) return fallback;
  const parsed = new Date(`${match[1]}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function readScore(row) {
  try { return JSON.parse(row.content); } catch { return []; }
}

export function importAvailable() {
  return Boolean(DatabaseSync && DB_PATH && existsSync(DB_PATH));
}

export function listPrivateSessions(allowedTargets) {
  const db = openDatabase();
  if (!db) return [];
  try {
    const allowed = new Set((allowedTargets || []).map(String));
    const rows = db.prepare(
      "SELECT user_id, created_at, updated_at FROM conversations WHERE platform_id = ? AND user_id LIKE ? ORDER BY updated_at DESC",
    ).all(PLATFORM, `${PLATFORM}:FriendMessage:%`);
    return rows
      .map((row) => {
        const targetId = String(row.user_id).split(":").pop();
        return {
          targetId,
          label: `私聊 · ${targetId}`,
          lastAt: row.updated_at,
          messageCount: 0,
        };
      })
      .filter((row) => !allowed.size || allowed.has(row.targetId));
  } finally {
    db.close();
  }
}

export async function importPrivateHistory({ store, profile, targetId }) {
  const db = openDatabase();
  if (!db) throw new Error("AstrBot 数据库未挂载或不存在");
  try {
    const row = db.prepare(
      "SELECT content, created_at, updated_at FROM conversations WHERE platform_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1",
    ).get(PLATFORM, `${PLATFORM}:FriendMessage:${targetId}`);
    if (!row) return 0;
    const data = readScore(row);
    if (!Array.isArray(data)) return 0;

    let currentTime = new Date(`${String(row.created_at).replace(" ", "T")}+08:00`);
    if (Number.isNaN(currentTime.getTime())) currentTime = new Date();
    const records = [];
    let previous = "";
    for (const item of data) {
      if (!item || (item.role !== "user" && item.role !== "assistant")) continue;
      const raw = Array.isArray(item.content)
        ? item.content.filter((part) => part && typeof part.text === "string").map((part) => part.text).join("\n")
        : typeof item.content === "string" ? item.content : "";
      const hinted = parseTime(raw, null);
      if (hinted) currentTime = hinted;
      const text = textFromContent(item.content);
      if (!text || text.startsWith("【历史摘要】")) continue;
      const key = `${item.role}\u0000${text}`;
      if (key === previous) continue;
      previous = key;
      records.push({
        id: `astrbot-private-${targetId}-${records.length}`,
        profile: profile.id,
        conversation: "private",
        targetId: String(targetId),
        role: item.role,
        parts: [{ type: "text", text }],
        text,
        source: "astrbot-import",
        time: new Date(currentTime.getTime() + records.length * 1000).toISOString(),
      });
    }
    return await store.importHistorical(records, String(targetId));
  } finally {
    db.close();
  }
}
