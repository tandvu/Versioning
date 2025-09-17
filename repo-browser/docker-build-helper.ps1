# Docker Build Helper Script
# This script waits for Docker to be ready, then builds the repo-browser image

Write-Host "Waiting for Docker Desktop to be ready..." -ForegroundColor Yellow

$maxAttempts = 30
$attempt = 0
$dockerReady = $false

while ((-not $dockerReady) -and ($attempt -lt $maxAttempts)) {
    $attempt++
    Write-Host "Attempt $attempt/$maxAttempts - Checking Docker daemon..." -ForegroundColor Cyan
    
    try {
        # Try to run a simple docker command
        $result = docker version --format "{{.Server.Version}}" 2>$null
        if ($result) {
            Write-Host "Docker is ready! Server version: $result" -ForegroundColor Green
            $dockerReady = $true
        } else {
            Write-Host "Docker daemon not ready yet, waiting 5 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    } catch {
        Write-Host "Docker daemon not ready yet, waiting 5 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}

if (-not $dockerReady) {
    Write-Host "Docker Desktop failed to start within $($maxAttempts * 5) seconds." -ForegroundColor Red
    Write-Host "Please check Docker Desktop manually and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Docker build..." -ForegroundColor Green
Write-Host "Building repo-browser image..." -ForegroundColor Cyan

try {
    docker build -t repo-browser .
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Docker build completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Test the container: npm run docker:run" -ForegroundColor White
        Write-Host "  2. Or use docker directly: docker run -p 3001:3001 repo-browser" -ForegroundColor White
        Write-Host "  3. Access the app at: http://localhost:3001" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "Docker build failed!" -ForegroundColor Red
        Write-Host "Check the build output above for errors." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Docker build failed with exception: $_" -ForegroundColor Red
    exit 1
}
