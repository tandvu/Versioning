@echo off
set PORT=5055
set SERVE_CLIENT=1

REM If node is installed and server\dist\index.js exists, run it. Otherwise fall back to bundled exe.
if exist "%~dp0server\dist\index.js" (
	where node >nul 2>&1
	if %ERRORLEVEL%==0 (
		start "RepoBrowser Server" /B cmd /c "cd /d "%~dp0" && node server\dist\index.js"
	) else (
		start "RepoBrowser Server" /B "%~dp0repo-server.exe"
	)
) else (
	start "RepoBrowser Server" /B "%~dp0repo-server.exe"
)

timeout /t 1 >nul
start "" http://localhost:%PORT%
