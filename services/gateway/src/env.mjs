/**
 * 轻量 .env 载入器：替代 Node 22.9+ 专属的 --env-file-if-exists。
 * - 不覆盖已存在的环境变量（容器/系统变量优先）
 * - 兼容 LF / CRLF、BOM、注释、单双引号
 * - 路径相对仓库根，而不是当前工作目录
 * 让 Node 18.18+ 也能直接 `node services/gateway/src/index.mjs`。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");

export function resolveFromRoot(value, fallback) {
  const raw = value || fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

export function loadEnv() {
  const file = resolveFromRoot(process.env.ENV_FILE, ".env");
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();
