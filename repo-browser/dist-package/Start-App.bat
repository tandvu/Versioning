@echo off
setlocal
set SERVE_CLIENT=1
set PORT=5055
pushd "%~dp0runtime\server"
node dist\index.js
popd
endlocal