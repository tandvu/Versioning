@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0
cd /d %ROOT%

if /i "%1"=="--skip-build" goto start

echo Building workspaces...
call npm run build || goto :eof

:start
echo Starting production server (includes static client)...
set SERVE_CLIENT=1
node server\dist\index.js
