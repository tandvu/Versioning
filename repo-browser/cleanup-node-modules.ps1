# PowerShell script to clean up problematic node_modules folders
# This script removes node_modules folders that cause ENOTEMPTY errors during Docker builds

Write-Host "Cleaning up problematic node_modules folders..." -ForegroundColor Yellow

# Define paths to clean up
$pathsToClean = @(
    "C:\AMPT\opt-orders\node_modules",
    "C:\AMPT_DEV\TRMC_MODULE\node_modules"
)

# Also search for any other node_modules in these base directories
$basePaths = @(
    "C:\AMPT",
    "C:\AMPT_DEV"
)

foreach ($basePath in $pathsToClean) {
    if (Test-Path $basePath) {
        Write-Host "Removing: $basePath" -ForegroundColor Cyan
        try {
            Remove-Item -Path $basePath -Recurse -Force -ErrorAction Stop
            Write-Host "✓ Removed: $basePath" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to remove: $basePath - $($_.Exception.Message)" -ForegroundColor Red
            
            # Try alternative cleanup methods for stubborn directories
            Write-Host "Trying cmd rmdir..." -ForegroundColor Yellow
            try {
                cmd /c "rmdir /s /q `"$basePath`""
                if (-not (Test-Path $basePath)) {
                    Write-Host "✓ Removed with cmd rmdir: $basePath" -ForegroundColor Green
                } else {
                    Write-Host "✗ cmd rmdir also failed" -ForegroundColor Red
                }
            } catch {
                Write-Host "✗ cmd rmdir error: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "Path not found: $basePath" -ForegroundColor DarkGray
    }
}

# Search for additional node_modules folders
foreach ($baseDir in $basePaths) {
    if (Test-Path $baseDir) {
        Write-Host "Searching for node_modules in $baseDir..." -ForegroundColor Cyan
        try {
            $nodeModulesDirs = Get-ChildItem -Path $baseDir -Recurse -Directory -Name "node_modules" -ErrorAction SilentlyContinue
            foreach ($dir in $nodeModulesDirs) {
                $fullPath = Join-Path $baseDir $dir
                Write-Host "Found: $fullPath" -ForegroundColor Gray
                try {
                    Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
                    Write-Host "✓ Removed: $fullPath" -ForegroundColor Green
                } catch {
                    Write-Host "✗ Failed to remove: $fullPath - $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        } catch {
            Write-Host "Error searching in $baseDir : $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "Base path not found: $baseDir" -ForegroundColor DarkGray
    }
}

# Also clean up any package-lock.json files that might cause issues
Write-Host "`nCleaning up package-lock.json files..." -ForegroundColor Yellow
$lockFilePaths = @(
    "C:\AMPT\opt-orders\package-lock.json",
    "C:\AMPT_DEV\TRMC_MODULE\package-lock.json"
)

foreach ($lockFile in $lockFilePaths) {
    if (Test-Path $lockFile) {
        try {
            Remove-Item -Path $lockFile -Force -ErrorAction Stop
            Write-Host "✓ Removed: $lockFile" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to remove: $lockFile - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "Lock file not found: $lockFile" -ForegroundColor DarkGray
    }
}

Write-Host "`n✓ Cleanup completed!" -ForegroundColor Green
Write-Host "You can now rebuild and run your Docker container." -ForegroundColor Cyan
