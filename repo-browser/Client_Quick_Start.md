# Repo Browser – Client Quick Start

This guide explains how to run Repo Browser using only the Docker image tar file you received. No source code or build tools required.

## Prerequisites
- Windows 10/11 with Docker Desktop installed and running
- PowerShell
- The Docker image tar file (e.g., repo-browser-image-YYYYMMDD-HHMMSS.tar)

## Steps

### 1. Load the Docker image
```powershell
docker load -i .\repo-browser-image-YYYYMMDD-HHMMSS.tar
```

### 2. Start the app (recommended universal mount)
```powershell
docker run -d --name repo-browser -p 3001:5055 -v C:/:/host -e BASE_PATHS=/host repo-browser:YYYY.MM.DD-HHmmss
```
- This makes all your C:/ folders available in the app UI.
- For privacy, you can mount a specific parent folder instead (see README.md for details).

Default to AMPT while keeping full C:/ access:
```powershell
docker run -d --name repo-browser -p 3001:5055 -v C:/:/host -e BASE_PATHS=/host/AMPT,/host repo-browser:YYYY.MM.DD-HHmmss
```
- Puts /host/AMPT first so it’s the default “Repository Path”, but still lets you browse anywhere under /host.

Restrict to AMPT only (no other folders visible in the app):
```powershell
docker run -d --name repo-browser -p 3001:5055 -v C:/:/host -e BASE_PATHS=/host/AMPT repo-browser:YYYY.MM.DD-HHmmss
```

### 3. Open the app
Open [http://localhost:3001](http://localhost:3001) in your browser.

## Troubleshooting
- If port 3001 is busy, change the left side of `-p 3001:5055` (e.g., `-p 5055:5055`) and open that port in your browser.
- If you see permission errors, add `--user root` to the docker run command.
- For more help, see the full README.md or contact your distributor.

---

**Security note:** Mounting C:/ gives the container access to all files on your C: drive. Only use on trusted machines.