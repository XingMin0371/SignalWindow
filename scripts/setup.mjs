import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import crypto from "node:crypto";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const NON_INTERACTIVE = process.argv.includes("--yes") || process.env.NON_INTERACTIVE === "1" || !process.stdin.isTTY;
const ask = async (question, fallback = "", envKey = "") => {
  const preset = envKey ? process.env[envKey] : "";
  if (preset) return preset;
  if (NON_INTERACTIVE) return fallback;
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback;
};

console.log("Signal Window setup");
console.log("配置你自己的 AstrBot；不需要安装任何业务插件，只要有 aiocqhttp/OneBot v11。\n");

const label = await ask("显示名称", "AstrBot");
const wsUrl = await ask("AstrBot OneBot WS 地址", "ws://127.0.0.1:6199/ws", "ONEBOT_WS");
try {
  const parsed = new URL(wsUrl);
  if (!["ws:", "wss:"].includes(parsed.protocol)) throw new Error("bad protocol");
} catch {
  console.error("OneBot WS 地址必须是 ws:// 或 wss:// 开头");
  process.exit(1);
}
const accessToken = await ask("OneBot accessToken（没有就留空）", "");
const selfId = await ask("Bot QQ / self_id", "");
const privateUserId = await ask("主人 QQ / private user_id", "");
const groupId = await ask("群号（不需要群聊就留空）", "");
const port = await ask("窗口端口", "8787", "PORT");
const host = await ask("监听地址（本机使用 127.0.0.1）", "127.0.0.1", "HOST");
const gatewayToken = await ask("窗口登录 Token（回车自动生成）", crypto.randomBytes(24).toString("hex"), "GATEWAY_TOKEN");
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("窗口端口必须是 1..65535 的整数，收到 " + JSON.stringify(port));
  process.exit(1);
}
if (!/^[A-Za-z0-9.:_-]+$/.test(host)) {
  console.error("监听地址格式不正确");
  process.exit(1);
}
if (/[\r\n#="'\s]/.test(gatewayToken)) {
  console.error("窗口登录 Token 不能包含空格、引号、换行或 #");
  process.exit(1);
}

if (!/^\d{5,12}$/.test(selfId) || !/^\d{5,12}$/.test(privateUserId)) {
  console.error("self_id 和 private user_id 必须是 5-12 位数字");
  process.exit(1);
}
if (groupId && !/^\d{5,12}$/.test(groupId)) {
  console.error("群号必须是 5-12 位数字，或留空");
  process.exit(1);
}

const env = `UPSTREAMS_FILE=./config/upstreams.json
GATEWAY_TOKEN=${gatewayToken}
HOST=${host}
PORT=${port}
DATA_DIR=./data
`;
const profiles = {
  profiles: [{
    id: "main",
    label,
    wsUrl,
    accessToken,
    selfId,
    privateUserId,
    groupId,
  }],
};

await fs.mkdir("config", { recursive: true });
if (await fs.access(".env").then(() => true).catch(() => false)) {
  await fs.copyFile(".env", ".env.bak");
  await fs.chmod(".env.bak", 0o600).catch(() => {});
}
if (await fs.access("config/upstreams.json").then(() => true).catch(() => false)) {
  await fs.copyFile("config/upstreams.json", "config/upstreams.json.bak");
  await fs.chmod("config/upstreams.json.bak", 0o600).catch(() => {});
}
await fs.writeFile(".env", env, { encoding: "utf8", mode: 0o600 });
await fs.writeFile("config/upstreams.json", JSON.stringify(profiles, null, 2), { encoding: "utf8", mode: 0o600 });
await fs.chmod(".env", 0o600).catch(() => {});
await fs.chmod("config/upstreams.json", 0o600).catch(() => {});
rl.close();
console.log("\n已写入 .env 和 config/upstreams.json");
console.log(`启动：pnpm install && pnpm start`);
console.log(`打开：http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
console.log(`窗口 Token：${gatewayToken}`);
