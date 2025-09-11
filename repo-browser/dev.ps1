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
        $prevErrPref = $ErrorActionPreference
        $prevLogLevel = $env:NPM_CONFIG_LOGLEVEL
        try {
            # Reduce noisy deprecation notices to warnings and avoid PS error records from stderr
            $ErrorActionPreference = 'Continue'
            $env:NPM_CONFIG_LOGLEVEL = 'warn'
            $env:NPM_CONFIG_AUDIT = 'false'
            $env:NPM_CONFIG_FUND = 'false'
            $env:NO_UPDATE_NOTIFIER = '1'
            npm run install:all
            if (-not (Get-Command concurrently -ErrorAction SilentlyContinue)) {
                Write-Host "Installing root dev dependencies (concurrently)..." -ForegroundColor Yellow
                npm install
            }
        } finally {
            $ErrorActionPreference = $prevErrPref
            if ($null -ne $prevLogLevel -and $prevLogLevel -ne '') { $env:NPM_CONFIG_LOGLEVEL = $prevLogLevel } else { Remove-Item Env:NPM_CONFIG_LOGLEVEL -ErrorAction SilentlyContinue }
            Remove-Item Env:NPM_CONFIG_AUDIT,Env:NPM_CONFIG_FUND,Env:NO_UPDATE_NOTIFIER -ErrorAction SilentlyContinue
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
