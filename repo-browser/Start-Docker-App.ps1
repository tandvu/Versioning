<#!
.SYNOPSIS
  Start the Repo Browser Docker container with common options (Windows PowerShell).

.DESCRIPTION
  Wraps `docker run` with convenience parameters for port mapping, volume mounts,
  environment variables (BASE_PATHS, DEPLOYMENT_PATH), and optional root user.

.EXAMPLE
  .\Start-Docker-App.ps1 -Port 3001 -Mount @("C:\AMPT:/app/AMPT","C:\AMPT_DEV\TRMC_MODULE:/app/TRMC_MODULE") `
    -BasePaths @("/app/AMPT","/app/TRMC_MODULE") -UseRoot -Follow

.PARAMETER Image
  Docker image to run. Default: repo-browser:latest

.PARAMETER HostPort
  Host port to map to container port 5055. Default: 3001 (use -Port for shorthand)

.PARAMETER Mount
  One or more volume mappings in the form HOST_PATH:CONTAINER_PATH
  Example: "C:\AMPT:/app/AMPT"

.PARAMETER BasePaths
  Container paths (comma-joined) where repos live. Exported as BASE_PATHS env var.

.PARAMETER DeploymentPath
  Container path for built WAR files. Exported as DEPLOYMENT_PATH. Default: /app/deployments

.PARAMETER UseRoot
  Run the container as root (helps with Windows volume permissions).

.PARAMETER ContainerName
  Name for the container. Default: repo-browser

.PARAMETER RemoveExisting
  If a container with the same name exists, remove it first.

.PARAMETER Follow
  After starting, stream container logs.
#>

param(
  [string]$Image = "repo-browser:latest",
  [Alias('Port')][int]$HostPort = 3001,
  [string[]]$Mount = @(),
  [string[]]$BasePaths = @(),
  [string]$DeploymentPath = "/app/deployments",
  [switch]$UseRoot,
  [string]$ContainerName = "repo-browser",
  [switch]$RemoveExisting,
  [switch]$Follow
)

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host $msg -ForegroundColor Red }

# Ensure Docker is available
try {
  $null = & docker version --format '{{.Server.Version}}' 2>$null
} catch {
  Write-Err "Docker does not appear to be available. Please install/start Docker Desktop."
  exit 1
}

# Handle existing container by name
$existing = (& docker ps -a --filter "name=^/$ContainerName$" -q) 2>$null
if ($existing) {
  if ($RemoveExisting) {
    Write-Info "Removing existing container '$ContainerName'..."
    & docker rm -f $existing | Out-Null
  } else {
    Write-Warn "A container named '$ContainerName' already exists. Use -RemoveExisting to replace it."
    exit 1
  }
}

# Build docker run args
$args = @('run','-d')

# Port mapping
if (-not $HostPort -or $HostPort -le 0) { $HostPort = 3001 }
$portMap = "{0}:5055" -f $HostPort
$args += @('-p', $portMap)

if ($ContainerName) {
  $args += @('--name',$ContainerName)
}

foreach ($m in $Mount) {
  if (-not $m.Contains(':')) {
    Write-Warn "Mount value '$m' should be in the form HOST_PATH:CONTAINER_PATH. Skipping."
    continue
  }
  $normalized = $m -replace '\\','/'
  $args += @('-v', $normalized)
}

if ($BasePaths.Count -gt 0) {
  $bp = ($BasePaths -join ',')
  $args += @('-e', "BASE_PATHS=$bp")
}

if ($DeploymentPath -and $DeploymentPath.Trim() -ne '') {
  $args += @('-e', "DEPLOYMENT_PATH=$DeploymentPath")
}

if ($UseRoot) {
  $args += @('--user','root')
}

$args += $Image

Write-Info "Running: docker $($args -join ' ')"
$containerId = & docker @args
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  Write-Err "Failed to start container. See Docker output above."
  exit 1
}

$containerId = $containerId.Trim()
Write-Host "Container started: $containerId" -ForegroundColor Green
Write-Host "Open http://localhost:$HostPort" -ForegroundColor Green

if ($Follow) {
  Write-Info "Tailing logs (Ctrl+C to stop)..."
  & docker logs --tail 200 -f $containerId
}
