@echo off
setlocal enabledelayedexpansion

REM Determine script directory
set SCRIPT_DIR=%~dp0
cd /d %SCRIPT_DIR%

echo == Repo Browser Dev Helper ==

REM Optionally run install if node_modules missing
IF NOT EXIST node_modules ( goto installDeps )
IF NOT EXIST server\node_modules ( goto installDeps )
IF NOT EXIST client\node_modules ( goto installDeps )
GOTO runDev

:installDeps
echo Installing workspace dependencies...
call npm run install:all || goto :eof
IF NOT EXIST node_modules\concurrently* (
  echo Ensuring root dev dependencies...
  call npm install || goto :eof
)

:runDev
echo Starting dev (server + client)...
call npm run dev
