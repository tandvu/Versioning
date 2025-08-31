# Build and start production (serves API + static client)
Param(
  [switch]$SkipBuild
)
$ErrorActionPreference='Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
if(-not $SkipBuild){
  Write-Host 'Building workspaces...' -ForegroundColor Cyan
  npm run build | Write-Host
}
Write-Host 'Starting production server (includes static client)...' -ForegroundColor Cyan
$env:SERVE_CLIENT='1'
node server/dist/index.js
