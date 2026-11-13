/**
 * 统一跨平台启动器（Windows / Linux / macOS / Android Termux 通用）。
 * 之所以用 Node 而不是两份 shell 脚本：Termux 无 bash、BusyBox 无 pipefail、
 * Windows CMD 的 CRLF 与 git autocrlf 组合会破坏 shebang。
 *
 *   node scripts/start.mjs              # 安装依赖 -> 构建前端 -> 启动 -> 打开浏览器
 *   node scripts/start.mjs --no-open    # 服务器/无头环境不打开浏览器
 *   NODE_BIN=/path/to/node ...          # 可指定 Node
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, loadEnv } from "../services/gateway/src/env.mjs";

loadEnv();
const noOpen = process.argv.includes("--no-open") || process.env.NO_BROWSER === "1";
const nodeBin = process.env.NODE_BIN || process.execPath;
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error("[Signal Window] 需要 Node.js 18.18+（推荐 20/22 LTS）；当前 " + process.version);
  process.exit(2);
}

// pnpm 优先，缺失时回退到 Node 自带的 npm，避免「开箱即用」被包管理器卡住。
const useShell = process.platform === "win32";
const hasPnpm = spawnSync("pnpm", ["--version"], { stdio: "ignore", shell: useShell }).status === 0;
const PM = hasPnpm ? "pnpm" : "npm";
const run = (args, cwd) => spawnSync(PM, args, { cwd, stdio: "inherit", shell: useShell });
const pmInstall = (cwd) => run(hasPnpm ? ["install"] : ["install", "--no-audit", "--no-fund"], cwd);
const pmRun = (cwd, script) => run(["run", script], cwd);

function needWeb() { return !fs.existsSync(path.join(REPO_ROOT, "apps/web/dist/index.html")); }
function needRootDeps() { return !fs.existsSync(path.join(REPO_ROOT, "node_modules/ws")); }

// 首次运行不调用交互式 setup：无头/CI/Docker/Termux 环境没有 TTY。
// 只生成最小安全 .env；AstrBot 实例交给网页里的设置向导配置。
const envPath = path.join(REPO_ROOT, ".env");
if (!fs.existsSync(envPath) && !process.env.GATEWAY_TOKEN) {
  const token = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(envPath,
    "GATEWAY_TOKEN=" + token + "\nHOST=127.0.0.1\nPORT=8787\nDATA_DIR=./data\nUPSTREAMS_FILE=./config/upstreams.json\n",
    { encoding: "utf8", mode: 0o600 });
  console.log("[Signal Window] 首次运行已生成 .env；登录 Token: " + token);
  loadEnv();
}

if (needWeb()) {
  console.log("[Signal Window] 构建前端…");
  if (pmInstall(path.join(REPO_ROOT, "apps/web")).status !== 0) process.exit(1);
  if (pmRun(path.join(REPO_ROOT, "apps/web"), "build").status !== 0) process.exit(1);
}
if (needRootDeps()) {
  console.log("[Signal Window] 安装网关依赖…");
  if (pmInstall(REPO_ROOT).status !== 0) process.exit(1);
}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const probeHost = ["0.0.0.0", "::", "::1"].includes(HOST) ? "127.0.0.1" : HOST;
const url = "http://" + probeHost + ":" + PORT;

const child = spawn(nodeBin, [path.join(REPO_ROOT, "services/gateway/src/index.mjs")], {
  cwd: REPO_ROOT, env: process.env, stdio: "inherit",
});
let closed = false;
child.on("error", (error) => {
  closed = true;
  console.error("[Signal Window] 启动网关失败：" + error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  closed = true;
  process.exitCode = signal ? 1 : (code ?? 1);
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { if (!closed) child.kill(sig); });
}

// 等健康检查通过再打开浏览器，避免用户看到「无法访问此网站」。
const deadline = Date.now() + 30000;
let ready = false;
while (!closed && Date.now() < deadline) {
  try {
    const r = await fetch(url + "/api/health", { signal: AbortSignal.timeout(1500) });
    if (r.ok) { ready = true; break; }
  } catch {}
  if (closed) break;
  await new Promise((r) => setTimeout(r, 200));
}
if (ready) {
  console.log("[Signal Window] 已就绪：" + url);
  if (!noOpen) {
    const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const argv = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const opener = spawn(cmd, argv, { stdio: "ignore", detached: true });
    opener.on("error", () => {});
    opener.unref();
  }
} else if (!closed) {
  console.error("[Signal Window] 30 秒内未就绪，请查看上方网关日志");
}
