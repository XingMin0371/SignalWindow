#!/bin/sh
# Signal Window 统一启动器：POSIX sh，兼容 BusyBox / Alpine / Android Termux（无需 bash）。
# 具体逻辑在 scripts/start.mjs，用 Node 实现，避免 shell 方言与 CRLF shebang 问题。
set -eu
cd "$(dirname "$0")"
exec "${NODE_BIN:-node}" scripts/start.mjs "$@"
