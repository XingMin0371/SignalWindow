@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [Signal Window] Need Node.js 18.18+ : https://nodejs.org/
  pause
  exit /b 1
)
node scripts\start.mjs %*
endlocal
