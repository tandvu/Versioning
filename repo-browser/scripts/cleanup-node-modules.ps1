# PowerShell script to forcefully clean up node_modules subfolders that may be locked or cause EPERM errors
# Usage: Run from repo root or target repo folder

param(
    [string]$TargetDir = "node_modules"
)

Write-Host "[cleanup] Scanning $TargetDir for locked or problematic subfolders..."

if (-Not (Test-Path $TargetDir)) {
    Write-Host "[cleanup] $TargetDir does not exist."
    exit 0
}

$errors = @()
Get-ChildItem -Path $TargetDir -Recurse -Directory | ForEach-Object {
    $folder = $_.FullName
    try {
        Remove-Item -Path $folder -Recurse -Force -ErrorAction Stop
        Write-Host "[cleanup] Removed: $folder"
    } catch {
        $msg = "[cleanup] Failed to remove: $folder - $_"
        Write-Host $msg
        $errors += $msg
    }
}

if ($errors.Count -eq 0) {
    Write-Host "[cleanup] All subfolders removed successfully."
} else {
    Write-Host "[cleanup] Some folders could not be removed. See above for details."
}
