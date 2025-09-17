# Simple PowerShell script to clean up node_modules folders
Write-Host "Cleaning up problematic node_modules folders..." -ForegroundColor Yellow

$foldersToRemove = @(
    "C:\AMPT\opt-orders\node_modules",
    "C:\AMPT_DEV\TRMC_MODULE\node_modules"
)

$filesToRemove = @(
    "C:\AMPT\opt-orders\package-lock.json",
    "C:\AMPT_DEV\TRMC_MODULE\package-lock.json"
)

# Remove node_modules folders
foreach ($folder in $foldersToRemove) {
    if (Test-Path $folder) {
        Write-Host "Removing: $folder" -ForegroundColor Cyan
        try {
            Remove-Item -Path $folder -Recurse -Force
            Write-Host "✓ Removed: $folder" -ForegroundColor Green
        } catch {
            Write-Host "Failed with PowerShell, trying cmd..." -ForegroundColor Yellow
            cmd /c "rmdir /s /q `"$folder`""
            if (-not (Test-Path $folder)) {
                Write-Host "✓ Removed with cmd: $folder" -ForegroundColor Green
            } else {
                Write-Host "✗ Failed to remove: $folder" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "Not found: $folder" -ForegroundColor DarkGray
    }
}

# Remove package-lock.json files
foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Write-Host "Removing: $file" -ForegroundColor Cyan
        try {
            Remove-Item -Path $file -Force
            Write-Host "✓ Removed: $file" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to remove: $file" -ForegroundColor Red
        }
    } else {
        Write-Host "Not found: $file" -ForegroundColor DarkGray
    }
}

Write-Host "`n✓ Cleanup completed!" -ForegroundColor Green
