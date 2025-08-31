# Development Instructions

## Prerequisites
- Node.js 18+ (or later)
- PowerShell (default on Windows) for the provided commands

## 1. Install Dependencies
From repo root:
```powershell
npm run install:all
```
This installs packages in `server` and `client` workspaces.

## 2. Run Server + GUI Together
Recommended single command (opens browser automatically if port free):
```powershell
npm run dev
```
Or convenience helper scripts (auto install check):
```powershell
./dev.ps1          # PowerShell (from repo root)
dev.bat            # CMD (from repo root)
# From parent directory (e.g. C:\tan_projects):
./repo-browser/dev.ps1
repo-browser\dev.bat
# Full path example:
& "C:\tan_projects\repo-browser\dev.ps1"
```
If PowerShell blocks script execution:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Starts:
- API server (Express) on: http://localhost:5055 (falls back to +1 up to +20 if busy)
- React/Vite dev server on: http://localhost:5174 (auto-opens; if busy Vite will choose 5175+)

If the tab does not open, manually visit the logged URL. (Common reason: an earlier Vite instance still using the port.) The React client probes ports 5055..5075 to find the live API automatically.

## 3. Run Individually (Optional)
```powershell
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev   # adds --open flag; may pick new port if the old is busy
```

## 4. Verify API
Open in browser or use PowerShell:
```powershell
Invoke-RestMethod http://localhost:5055/api/repos | ConvertTo-Json
```
Expected JSON shape:
```json
{ "repos": ["opt-soa", "some-other-repo", "..." ] }
```

## 5. Adjust Repository Paths
Edit `server/src/config.ts`:
```ts
export const config = { basePaths: [
	'C:/AMPT',
	'C:/AMPT_DEV/TRMC_MODULE'
] };
```
Add additional absolute Windows paths as needed. The watcher restarts automatically.

### Filtering Logic
Currently: lists top-level folder names of each configured base directory. A directory path that points directly to a single repo (like the opt-soa path) is itself included.

## 6. Production Build
```powershell
npm run build
```
Or build + start (serve static client via server):
```powershell
npm run build-and-start
# or helper scripts
./build_start.ps1
build_start.bat
```
Artifacts:
- Server JS -> `server/dist`
- Frontend static assets -> `client/dist`

Serve frontend build (example):
```powershell
npx serve client/dist
```
Run server:
```powershell
cd server
npm start
```

## 7. Common Issues / Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Browser didn\'t open | Port already taken / prior process | Close old Vite terminal, re-run `npm run dev` |
| Getting empty repo list | Paths incorrect or inaccessible | Confirm each path exists; adjust in config.ts |
| UI shows "Detecting API..." then error | API not running or blocked | Ensure server started, check console for port message |
| Need only git repos | Current code doesn\'t filter | Enhance server logic to check for `.git` (ask for help) |
| Port conflict 5055 | Another process using port | Change `PORT` env var: `$env:PORT=5056; npm run dev-server` |

## 8. Next Enhancements (Optional)
- Filter by presence of `.git` directory.
- Add recursive scan + caching.
- Button to open repo in File Explorer.
- Export selected repo names.

## 9. Scripts Overview
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

---
For deeper changes or new features, open an issue or ask for guidance.

