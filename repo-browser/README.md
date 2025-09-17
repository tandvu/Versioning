# Repo Browser

A small React + Node.js (Express) app to list local repositories (folders) under configured base paths and display them with checkboxes.

Configured base paths (adjust in `server/src/config.ts`):
- `C:\\AMPT` (always forced as first/default; if removed from runtime config it will be re-added at the top on startup)
- `C:\\AMPT_DEV\\TRMC_MODULE` (single repo folder)

## Features
- Backend endpoint `GET /api/repos` scans the configured directories (top-level only) and returns unique repo names.
- Frontend React app lists repos with checkboxes, select all / clear, and text filter.
- TypeScript codebase (server + client) with Vite for fast React dev.
 - Client auto-detects backend port (tries 5055..5075) so it still works if the server shifted due to a port conflict.

## Quick Start
```powershell
# From repo root
npm run install:all   # install server + client deps
npm run dev           # start both server (5055) and client (5174) together
# Or use convenience script (auto installs if needed):
./dev.ps1             # PowerShell
# Windows cmd alternative:
dev.bat
# If you are one directory ABOVE (e.g. currently in C:\tan_projects), run:
# PowerShell
./repo-browser/dev.ps1
# CMD
repo-browser\dev.bat
# Or always with full path:
& "C:\tan_projects\repo-browser\dev.ps1"
# If PowerShell blocks script (execution policy):
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
The browser should open automatically. If not, manually visit:
```
http://localhost:5174
```
API endpoint (test in browser / curl):
```
http://localhost:5055/api/repos
```

## Running Individually
```powershell
# Terminal 1 (backend)
cd server; npm run dev
# Terminal 2 (frontend)
cd client; npm run dev
```

## Adjusting Repository Paths
Edit `server/src/config.ts` and add/remove entries in `basePaths`. The dev server restarts automatically (tsx watch). For a one-off restart, stop and re-run `npm run dev` (root) or `npm run dev` inside `server`.

## Production Build
```powershell
npm run build
```
Outputs:
- Compiled server: `server/dist`
- Frontend static assets: `client/dist`

You can serve the frontend build via any static server (e.g. `npx serve client/dist`) while running the Node server.

### One-Step Build + Start (Serve Client From Server)
```powershell
npm run build-and-start   # build then start server with static client
# or manually:
npm run build
npm run start:prod
```
Direct helper scripts:
```powershell
./build_start.ps1         # PowerShell
build_start.bat           # CMD
```
These set SERVE_CLIENT=1 so the server also serves the built React app (SPA fallback) on the same port.

## Notes
- Only top-level folders are listed. Add recursive / .git filtering if needed.
- Duplicate names (if any) are de-duplicated by name.

---

## Development Quick Start

### Prerequisites
- Node.js 18+
- PowerShell (Windows)

### Install & Run
```powershell
# From repo root
npm run install:all   # install server + client deps
npm run dev           # start both server (5055) and client (5174) together
# Or use convenience script (auto installs if needed):
./dev.ps1             # PowerShell
dev.bat               # Windows CMD
```
The browser should open automatically. If not, manually visit:
http://localhost:5174

API endpoint:
http://localhost:5055/api/repos

### Running Individually
```powershell
# Terminal 1 (backend)
cd server; npm run dev
# Terminal 2 (frontend)
cd client; npm run dev
```

### Adjusting Repository Paths
Edit `server/src/config.ts` and add/remove entries in `basePaths`. The dev server restarts automatically.

### Production Build
```powershell
npm run build
```
Outputs:
- Compiled server: `server/dist`
- Frontend static assets: `client/dist`

---


## Docker Distribution

### For Distributors: Build and Save Docker Image as .tar


Use the helper script to build, tag, and export the Docker image as a tar file for client delivery:

```powershell
./Build-And-Save-Image.ps1
```

After running this script, the `.tar` file will be saved in your current working directory (where you ran the script) as:
- `repo-browser-image-YYYYMMDD-HHMMSS.tar`
You can specify a different output directory with the `-OutputDir` option.

This script will:
- Build the Docker image from the current source
- Tag the image with the current date/time (e.g., repo-browser:2025.09.17-142530) and 'latest'
- Save the image as a tar file (e.g., repo-browser-image-20250917-142530.tar)
- Optionally generate a SHA256 checksum file (add `-GenerateChecksum`)

**Example usage:**
```powershell
# Basic: build, tag, and save tar
./Build-And-Save-Image.ps1

# Custom tag, output directory, and checksum
./Build-And-Save-Image.ps1 -Tag 2025.09.17-142530 -OutputDir .\dist-image -GenerateChecksum
```

**Outputs:**
- Docker image tagged with date/time and latest
- Tar file in the current or specified output directory
- Optional .sha256 checksum file

Send the tar file to your clients, who will follow the instructions below.

---

### For Clients: Load and Run the App

**Prerequisites:**
- Windows 10/11 with Docker Desktop
- PowerShell
- A Repo Browser Docker image tar file (e.g., repo-browser-image-YYYYMMDD-HHMMSS.tar)

**Load the Image:**
```powershell
docker load -i .\repo-browser-image-YYYYMMDD-HHMMSS.tar
docker images | findstr repo-browser
```

**Start the App (Basic):**
```powershell
docker run -d --name repo-browser -p 3001:5055 repo-browser:YYYY.MM.DD-HHmmss
```
Open [http://localhost:3001](http://localhost:3001) in your browser.

**Port Mapping Note:**
- The app listens on port 5055 inside the container.
- The `-p HOST:5055` flag maps that container port to your machine. Change `HOST` (e.g., 3001, 5055) to pick the browser port you want.

**Universal Mount (Recommended for Flexible Client Layouts):**
Mount your entire C:/ drive so any folder is available in the UI, regardless of client layout.
```powershell
docker run -d `
  --name repo-browser `
  -p 3001:5055 `
  -v C:/:/host `
  -e BASE_PATHS=/host `
  repo-browser:YYYY.MM.DD-HHmmss
```
Or with the helper:
```powershell
./Start-Docker-App.ps1 -Port 3001 -Mount @("C:/:/host") -BasePaths @("/host")
```
Then in the UI, select any path under /host (e.g., /host/AMPT, /host/AMPT_DEV/TRMC_MODULE, etc.).

**Security note:** This gives the container access to all files on your C: drive. Only use on trusted machines. For more privacy, mount just a parent folder.

**Why mounts and BASE_PATHS?**
- The app runs inside the container and can only see the container filesystem. Host folders (like `C:\AMPT`) are invisible unless you bind-mount them with `-v`.
- The UI path selector works with container paths. So a host folder must be mounted to a container path (e.g., `C:\AMPT` -> `/app/AMPT`) to be selectable in the UI.
- You can’t add new mounts after the container starts; define the folders once at `docker run`. Dynamic UI selection still works—but only within the mounted roots.
- `BASE_PATHS` constrains where the backend scans for repos and where it looks for private packages to rewrite as `file:` dependencies. Include the mounted roots you want the app to search.

---

## Troubleshooting
| Symptom                | Solution                                  |
|------------------------|-------------------------------------------|
| App won’t start        | Ensure Node.js (dev) or Docker (client) is installed and up to date|
| Port already in use    | Change host port in `-p HOST:5055` or helper script|
| Browser doesn’t open   | Manually visit the correct localhost URL   |
| Empty repo list        | Confirm BASE_PATHS and mounts are correct |
| Permission errors      | Add `--user root` to docker run           |
| Private packages 404   | App rewrites package.json to use local file: paths|

---

## Scripts Overview
| Script | Location | Purpose |
|--------|----------|---------|
| `npm run dev` | root | Concurrent server + client dev |
| `npm run build` | root | Build both workspaces |
| `npm run build-and-start` | root | Build then start server with static client |
| `npm run start:prod` | root | Start server (SERVE_CLIENT=1) assuming built assets |
| `npm run dev` | server | Backend only (watch) |
| `npm run dev` | client | Frontend only (auto-open) |
| `npm start` | server | Run built server (after build) |
| `./dev.ps1` / `dev.bat` | root | Convenience dev launcher |
| `./build_start.ps1` / `build_start.bat` | root | Convenience prod launcher |
| `./Start-Docker-App.ps1` | root | Docker container runner |
| `./Build-And-Save-Image.ps1` | root | Build/tag/save Docker image as tar |
| `./Tail-Backend-Logs.ps1` | root | Tail backend logs from running container |

---

## For Questions or Help
Contact the maintainer or open an issue in the repo.
See `README_DEV.md` for extended development details.

## User Guide
- For end‑user usage instructions (running the packaged ZIP, changing ports, live logs, troubleshooting), see `USER_GUIDE.md`.
