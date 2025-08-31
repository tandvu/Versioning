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

See `README_DEV.md` for extended development details.
