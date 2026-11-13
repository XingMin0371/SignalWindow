import fs from "node:fs/promises";
import path from "node:path";

export function normalizeProfile(raw, index = 0) {
  const id = String(raw.id || `upstream-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const wsUrl = String(raw.wsUrl || raw.onebotWs || "");
  const selfId = String(raw.selfId || raw.botId || "");
  const privateUserIdsRaw = Array.isArray(raw.privateUserIds) ? raw.privateUserIds : [raw.privateUserId || raw.ownerId || ""];
  const groupIdsRaw = Array.isArray(raw.groupIds) ? raw.groupIds : [raw.groupId || ""];
  const privateUserIds = [...new Set(privateUserIdsRaw.map((value) => String(value || "").trim()).filter(Boolean))];
  const groupIds = [...new Set(groupIdsRaw.map((value) => String(value || "").trim()).filter(Boolean))];
  const privateUserId = privateUserIds[0] || "";
  if (!wsUrl) throw new Error("OneBot WS 地址不能为空");
  let parsed;
  try { parsed = new URL(wsUrl); } catch { throw new Error("OneBot WS 地址格式不正确"); }
  if (!["ws:", "wss:"].includes(parsed.protocol)) throw new Error("OneBot WS 地址必须是 ws:// 或 wss://");
  if (wsUrl.length > 2048 || parsed.username || parsed.password) throw new Error("OneBot WS 地址不合法");
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = String(process.env.UPSTREAM_HOST_ALLOWLIST || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(host)) {
    throw new Error("OneBot WS 主机不在 UPSTREAM_HOST_ALLOWLIST 中");
  }
  if (host === "169.254.169.254" || host === "metadata.google.internal" || host === "metadata.azure.internal" || host === "0.0.0.0" || host.startsWith("169.254.") || host === "fd00:ec2::254") {
    throw new Error("不允许连接云元数据地址");
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
  return path.resolve(process.env.UPSTREAMS_FILE || "config/upstreams.json");
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
  await fs.rename(temporary, file);
  await fs.chmod(file, 0o600).catch(() => {});
}
