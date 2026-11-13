@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Signal Window] Node.js 24+ is required.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 24) process.exit(1)"
if errorlevel 1 (
  echo [Signal Window] Node.js 24+ is required. Found:
  node -v
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [Signal Window] pnpm is required. Enable Corepack or install pnpm:
  echo   corepack enable
  echo   corepack prepare pnpm@latest --activate
  pause
  exit /b 1
)

if not exist ".env" (
  echo [Signal Window] First run: creating .env and config\upstreams.json
  call node scripts\setup.mjs
  if errorlevel 1 exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo [Signal Window] Building web client...
  pushd apps\web
  call pnpm install
  if errorlevel 1 (popd & exit /b 1)
  call pnpm run build
  if errorlevel 1 (popd & exit /b 1)
  popd
)

call pnpm install
if errorlevel 1 exit /b 1

start "" http://127.0.0.1:8787
call pnpm start
endlocal
