@echo off
echo Checking if Docker is ready...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not ready yet. Please:
    echo 1. Make sure Docker Desktop is running ^(check system tray^)
    echo 2. Wait for the Docker whale icon to show "Docker Desktop is running"
    echo 3. Run this script again
    pause
    exit /b 1
)

echo Docker is ready! Building repo-browser image...
docker build -t repo-browser .

if %errorlevel% equ 0 (
    echo.
    echo Build completed successfully!
    echo.
    echo Next steps:
    echo   Test: docker run -p 3001:3001 repo-browser
    echo   Or:   npm run docker:run
    echo   URL:  http://localhost:3001
) else (
    echo Build failed! Check the output above.
)

pause
