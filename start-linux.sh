#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[Signal Window] Node.js 24+ is required."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "[Signal Window] Node.js 24+ is required; found $(node -v)."
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[Signal Window] pnpm is required. Run: corepack enable"
  exit 1
fi

if [ ! -f .env ]; then
  echo "[Signal Window] First run: creating .env and config/upstreams.json"
  node scripts/setup.mjs
fi

if [ ! -f apps/web/dist/index.html ]; then
  echo "[Signal Window] Building web client..."
  (cd apps/web && pnpm install && pnpm run build)
fi

pnpm install
exec pnpm start
