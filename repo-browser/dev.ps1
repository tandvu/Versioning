Param(
    [switch]$Install,
    [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (directory containing this script)
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OrigPath = Get-Location

Write-Host "== Repo Browser Dev Helper ==" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot" -ForegroundColor Cyan
Write-Host "Original cwd: $OrigPath" -ForegroundColor DarkGray
Write-Host "(Directory will be restored after script finishes)" -ForegroundColor DarkGray

Push-Location $RepoRoot

function Ensure-Deps {
    if ($NoInstall) { return }
    if ($Install -or -not (Test-Path "$RepoRoot/node_modules") -or -not (Test-Path "$RepoRoot/server/node_modules") -or -not (Test-Path "$RepoRoot/client/node_modules")) {
        Write-Host "Installing workspace dependencies..." -ForegroundColor Yellow
        npm run install:all 2>&1 | Write-Host
        if (-not (Get-Command concurrently -ErrorAction SilentlyContinue)) {
            Write-Host "Installing root dev dependencies (concurrently)..." -ForegroundColor Yellow
            npm install 2>&1 | Write-Host
        }
    } else {
        Write-Host "Dependencies already present. (Use -Install to force)" -ForegroundColor DarkGreen
    }
}

Ensure-Deps

Write-Host "Starting dev (server + client)..." -ForegroundColor Cyan
npm run dev

Pop-Location
Write-Host "Restored cwd: $(Get-Location)" -ForegroundColor DarkGray
