import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { resolveFromRoot } from "./env.mjs";

function normalizedHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function privateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function privateIp(address) {
  const host = normalizedHost(address);
  const version = net.isIP(host);
  if (version === 4) return privateIpv4(host);
  if (version === 6) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") ||
      host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") ||
      host.startsWith("ff") || host.startsWith("2001:db8")) return true;
    if (host.startsWith("::ffff:")) return privateIpv4(host.slice(7));
  }
  return false;
}

function validateUpstreamHost(hostname) {
  const host = normalizedHost(hostname);
  const allowedHosts = String(process.env.UPSTREAM_HOST_ALLOWLIST || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(host)) {
    throw new Error("OneBot WS 主机不在 UPSTREAM_HOST_ALLOWLIST 中");
  }
  // An allowlist entry must not turn a literal metadata/private IP into a
  // permitted destination.
  if (net.isIP(host)) {
    if (privateIp(host) && host !== "127.0.0.1" && host !== "::1") {
      throw new Error("OneBot WS 不允许连接私有/保留地址");
    }
    return;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;
  if (allowedHosts.length) return;
  throw new Error("OneBot WS 主机需要加入 UPSTREAM_HOST_ALLOWLIST");
}

function normalizeDigits(raw) {
  return String(raw ?? "")
    .replace(/[\uFF10-\uFF19]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10))
    .replace(/[\s_]/g, "")
    .trim();
}

export function normalizeProfile(raw, index = 0) {
  const id = String(raw.id || `upstream-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const wsUrl = String(raw.wsUrl || raw.onebotWs || "").trim();
  const selfId = normalizeDigits(raw.selfId || raw.botId || "");
  const privateUserIdsRaw = Array.isArray(raw.privateUserIds) ? raw.privateUserIds : [raw.privateUserId || raw.ownerId || ""];
  const groupIdsRaw = Array.isArray(raw.groupIds) ? raw.groupIds : [raw.groupId || ""];
  const privateUserIds = [...new Set(privateUserIdsRaw.map(normalizeDigits).filter(Boolean))];
  const groupIds = [...new Set(groupIdsRaw.map(normalizeDigits).filter(Boolean))];
  const privateUserId = privateUserIds[0] || "";
  if (!wsUrl) throw new Error("OneBot WS 地址不能为空");
  let parsed;
  try { parsed = new URL(wsUrl); } catch { throw new Error("OneBot WS 地址格式不正确"); }
  if (!["ws:", "wss:"].includes(parsed.protocol)) throw new Error("OneBot WS 地址必须是 ws:// 或 wss://");
  if (wsUrl.length > 2048 || parsed.username || parsed.password) throw new Error("OneBot WS 地址不合法");
  validateUpstreamHost(parsed.hostname);
  const gatewayPort = Number(process.env.PORT || 8787);
  const targetPort = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
  if (["127.0.0.1", "::1", "localhost"].includes(normalizedHost(parsed.hostname)) && targetPort === gatewayPort) {
    throw new Error("OneBot WS 不允许连接网关自身");
  }
  if (!/^\d{5,12}$/.test(selfId)) throw new Error("Bot QQ / self_id 必须是 5-12 位数字");
  if (!privateUserId || !privateUserIds.every((value) => /^\d{5,12}$/.test(value))) throw new Error("至少一个私聊对象，QQ 必须是 5-12 位数字");
  if (!groupIds.every((value) => /^\d{5,12}$/.test(value))) throw new Error("群号必须是 5-12 位数字");
  const label = String(raw.label || id).trim().slice(0, 40);
  if (!label) throw new Error("显示名称不能为空");
  return {
    id,
    label,
    wsUrl,
    accessToken: String(raw.accessToken || "").slice(0, 2048),
    selfId,
    privateUserId,
    privateUserIds,
    groupId: groupIds[0] || "",
    groupIds,
  };
}

export function configPath() {
  return resolveFromRoot(process.env.UPSTREAMS_FILE, "config/upstreams.json");
}

export async function loadProfiles() {
  const file = configPath();
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    raw = null;
  }
  if (raw) {
    const list = Array.isArray(raw) ? raw : raw.profiles;
    if (!Array.isArray(list) || !list.length) return [];
    return list.map((item, index) => normalizeProfile(item, index));
  }
  const required = ["ONEBOT_WS", "SELF_ID", "PRIVATE_USER_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) return [];
  return [normalizeProfile({
    id: "main",
    label: process.env.PROFILE_LABEL || "AstrBot",
    wsUrl: process.env.ONEBOT_WS,
    accessToken: process.env.ONEBOT_TOKEN || "",
    selfId: process.env.SELF_ID,
    privateUserId: process.env.PRIVATE_USER_ID,
    privateUserIds: [process.env.PRIVATE_USER_ID],
    groupId: process.env.GROUP_ID || "",
    groupIds: process.env.GROUP_ID ? [process.env.GROUP_ID] : [],
  })];
}

export async function saveProfiles(profiles) {
  const file = configPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ profiles }, null, 2), { encoding: "utf8", mode: 0o600 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await fs.rename(temporary, file); break; }
    catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  await fs.chmod(file, 0o600).catch(() => {});
}
