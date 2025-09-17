<#!
.SYNOPSIS
  Tail Repo Browser backend logs from the Docker container.

.DESCRIPTION
  Convenience wrapper around `docker logs` with timestamps, follow mode,
  and optional client-side filtering of lines.

.EXAMPLE
  .\Tail-Backend-Logs.ps1

.EXAMPLE
  .\Tail-Backend-Logs.ps1 -Since 30m -Follow -Filter "error|warn"

.PARAMETER Container
  Container name or ID. Default: repo-browser

.PARAMETER Since
  Duration for logs since (e.g., 10m, 1h). Default: 15m

.PARAMETER Tail
  Number of lines to show from the end. Default: 200

.PARAMETER Follow
  Follow logs (stream output).

.PARAMETER Filter
  Regex to filter log lines (client-side). Example: "error|warn"
#>

param(
  [string]$Container = "repo-browser",
  [string]$Since = "15m",
  [int]$Tail = 200,
  [switch]$Follow,
  [string]$Filter = ""
)

function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

try {
  $null = & docker version --format '{{.Server.Version}}' 2>$null
} catch {
  Write-Err "Docker does not appear to be available. Please install/start Docker Desktop."
  exit 1
}

$args = @('logs','--timestamps','--since', $Since, '--tail', "$Tail")
if ($Follow) { $args += '-f' }
$args += $Container

if ($Filter -and $Filter.Trim() -ne '') {
  & docker @args | Select-String -Pattern $Filter
} else {
  & docker @args
}
