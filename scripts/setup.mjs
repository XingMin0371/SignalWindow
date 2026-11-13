import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import crypto from "node:crypto";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question, fallback = "") => {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback;
};

console.log("Signal Window setup");
console.log("配置你自己的 AstrBot；不需要安装任何业务插件，只要有 aiocqhttp/OneBot v11。\n");

const label = await ask("显示名称", "AstrBot");
const wsUrl = await ask("AstrBot OneBot WS 地址", "ws://127.0.0.1:6199/ws");
const accessToken = await ask("OneBot accessToken（没有就留空）", "");
const selfId = await ask("Bot QQ / self_id", "");
const privateUserId = await ask("主人 QQ / private user_id", "");
const groupId = await ask("群号（不需要群聊就留空）", "");
const port = await ask("窗口端口", "8787");
const host = await ask("监听地址（本机使用 127.0.0.1）", "127.0.0.1");
const gatewayToken = await ask("窗口登录 Token（回车自动生成）", crypto.randomBytes(24).toString("hex"));

if (!selfId || !privateUserId) {
  console.error("self_id 和 private user_id 必须填写");
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
