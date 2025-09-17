<#!
.SYNOPSIS
  Build the Repo Browser Docker image and save it to a .tar file (optionally create a checksum).

.DESCRIPTION
  Runs `docker build` to produce an image and tags it with today's date (yyyy.MM.dd) and `latest` by default.
  Then saves it to a timestamped .tar file, including both tags. Optionally computes a SHA256 checksum when -GenerateChecksum is used.

.EXAMPLE
  .\Build-And-Save-Image.ps1

.EXAMPLE
  .\Build-And-Save-Image.ps1 -Tag 1.2.3 -OutputDir .\dist-image

.EXAMPLE
  .\Build-And-Save-Image.ps1 -GenerateChecksum

.PARAMETER Context
  Build context directory. Default: current directory (.)

.PARAMETER Image
  Image name to build. Default: repo-browser

.PARAMETER Tag
  Image tag. Default: today's date in yyyy.MM.dd (also tags `latest` in addition)

.PARAMETER OutputDir
  Directory to place the exported .tar (and checksum if requested). Default: current directory

.PARAMETER GenerateChecksum
  When provided, compute a SHA256 checksum and write a .sha256 file alongside the .tar
#>

param(
  [string]$Context = ".",
  [string]$Image = "repo-browser",
  [string]$Tag = "",
  [string]$OutputDir = ".",
  [switch]$GenerateChecksum
)

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Err($msg)  { Write-Host $msg -ForegroundColor Red }

# Ensure Docker is available
try {
  $null = & docker version --format '{{.Server.Version}}' 2>$null
} catch {
  Write-Err "Docker does not appear to be available. Please install/start Docker Desktop."
  exit 1
}

$computedTag = if ($Tag -and $Tag.Trim() -ne '') { $Tag.Trim() } else { (Get-Date).ToString('yyyy.MM.dd-HHmmss') }
$dateTag = "$($Image):$computedTag"
$latestTag = "$($Image):latest"

Write-Info "Building image with tags: $dateTag and $latestTag (context: $Context)"
& docker build -t $dateTag -t $latestTag $Context
if ($LASTEXITCODE -ne 0) {
  Write-Err "Image build failed."
  exit 1
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$tarPath = Join-Path $OutputDir ("$Image-image-$timestamp.tar")

Write-Info "Saving image to: $tarPath"
& docker save -o $tarPath $dateTag $latestTag
if ($LASTEXITCODE -ne 0) {
  Write-Err "Failed to save image to tar."
  exit 1
}

Write-Host "Done" -ForegroundColor Green
Write-Host "Image tags: $dateTag, $latestTag" -ForegroundColor Green
Write-Host "TAR:   $tarPath" -ForegroundColor Green
if ($GenerateChecksum) {
  Write-Info "Computing SHA256 checksum..."
  $hash = Get-FileHash -Algorithm SHA256 $tarPath
  $checksumFile = "$tarPath.sha256"
  $hash.Hash + "  " + (Split-Path -Leaf $tarPath) | Out-File -FilePath $checksumFile -Encoding ascii
  Write-Host "SHA256 checksum: $checksumFile" -ForegroundColor Green
} else {
  Write-Host "Checksum not generated. Use -GenerateChecksum to create one." -ForegroundColor Yellow
}
