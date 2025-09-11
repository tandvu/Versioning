Param(
  [string]$OutDir = "dist-package"
)

$ErrorActionPreference = "Stop"

# Paths
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $Root "server"
$Client = Join-Path $Root "client"
$Stage = Join-Path $Root $OutDir
$Runtime = Join-Path $Stage "runtime"

# Clean stage
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

# 1) Build client and server using workspace scripts (assumes deps already installed)
Write-Host "Building server and client via workspace scripts..."
pushd $Root
npm run build --workspace server
npm run build --workspace client -- --sourcemap false
popd

# 2) Stage runtime: server/dist + prod node_modules, client/dist
Write-Host "Staging runtime..."
$ServerOut = Join-Path $Runtime "server"
$ClientOut = Join-Path $Runtime "client"
New-Item -ItemType Directory -Force -Path $ServerOut,$ClientOut | Out-Null

# Copy server dist
Copy-Item -Recurse -Force (Join-Path $Server "dist") $ServerOut
# Copy server package.json and existing node_modules (avoid reinstall issues)
Copy-Item -Recurse -Force (Join-Path $Server "package.json") $ServerOut
if (Test-Path (Join-Path $Server "node_modules")) {
  Write-Host "Copying server node_modules..."
  Copy-Item -Recurse -Force (Join-Path $Server "node_modules") (Join-Path $ServerOut "node_modules")
}
elseif (Test-Path (Join-Path $Root "node_modules")) {
  Write-Host "Copying workspace root node_modules for server runtime..."
  Copy-Item -Recurse -Force (Join-Path $Root "node_modules") (Join-Path $ServerOut "node_modules")
}

# Prune dev/extraneous deps inside staged server node_modules to shrink size
if (Test-Path (Join-Path $ServerOut "node_modules")) {
  Write-Host "Pruning dev and extraneous packages in staged server node_modules..."
  pushd $ServerOut
  try {
    $npmVer = (& npm -v)
    $npmMajor = [int]($npmVer.Split('.')[0])
    if ($npmMajor -ge 7) {
      & npm prune --omit=dev
    } else {
      & npm prune --production
    }
  }
  catch {
    Write-Warning "npm prune failed in staged server: $_"
  }
  finally {
    popd
  }
}

# Copy client dist
Copy-Item -Recurse -Force (Join-Path $Client "dist") $ClientOut

# 3) Create Start script and README
$StartBat = @"
@echo off
setlocal
set SERVE_CLIENT=1
set NODE_ENV=production
set PORT=5055
pushd "%~dp0runtime\server"
node dist\index.js
popd
endlocal
"@
$Readme = @"
Repo Browser (Local Runtime)
===========================

How to run
- Ensure Node.js is installed.
- Double-click Start-App.bat (or run it in a terminal).
- The server starts on http://localhost:5055 and serves the UI.

What’s included
- Compiled server (server/dist) + production node_modules
- Compiled client (client/dist) served statically by the server (SERVE_CLIENT=1)

Notes
- No source maps included.
- You can change PORT in Start-App.bat.
"@
Set-Content -Path (Join-Path $Stage "Start-App.bat") -Value $StartBat -NoNewline
Set-Content -Path (Join-Path $Stage "README.txt") -Value $Readme -NoNewline

# 4) Zip it
$ZipPath = Join-Path $Root ("repo-browser-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($Stage, $ZipPath)

Write-Host "Created package: $ZipPath"
