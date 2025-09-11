# Repo Browser Distribution Guide

This guide explains how to package, distribute, and run Repo Browser for end users—no source code or build tools required.

## 1. Packaging the App

**Prerequisites:**
- Node.js 18+ installed (for packaging)
- PowerShell (Windows)

**Steps:**
1. Open a PowerShell terminal in the repo root.
2. Run the packaging script:
   ```powershell
   npm run package:zip
   ```
   This builds the app and creates a ZIP file (e.g. `repo-browser-YYYYMMDD-HHMMSS.zip`).
3. Find the ZIP in the repo root. It contains:
   - `dist-package/` folder with:
     - `runtime/server/dist` (compiled backend)
     - `runtime/server/node_modules` (production dependencies only)
     - `runtime/client/dist` (compiled frontend)
     - `Start-App.bat` (Windows launcher)
     - `README.txt` (quick usage)

## 2. Distributing to Users

- Share the ZIP file with users (email, file share, etc.).
- Users do **not** need Node.js, npm, or any build tools—just the ZIP contents.

## 3. User Instructions (for ZIP Recipients)

**Requirements:**
- Windows PC
- Node.js 18+ installed (https://nodejs.org/)

**Steps:**
1. Unzip the package anywhere (e.g. `C:\RepoBrowserRuntime`).
2. Double-click `Start-App.bat` to launch the app.
   - This starts the backend server and serves the UI.
   - Default port: `http://localhost:5055`
3. The browser should open automatically. If not, open your browser and go to:
   ```
   http://localhost:5055
   ```

**Notes:**
- No source code is included—only compiled files and required dependencies.
- You can move the unzipped folder anywhere on your PC.
- To change the port, edit `Start-App.bat` and set a different `PORT` value.
- To stop the app, close the terminal window or press `Ctrl+C` in the terminal.

## 4. Troubleshooting

| Symptom                | Solution                                  |
|------------------------|-------------------------------------------|
| App won’t start        | Ensure Node.js is installed and up to date|
| Port already in use    | Edit `Start-App.bat` to change `PORT`     |
| Browser doesn’t open   | Manually visit `http://localhost:5055`    |
| Missing dependencies   | Re-extract ZIP; ensure antivirus didn’t block files |

## 5. Advanced

- The server serves the UI and API together—no need to run anything else.
- For non-Windows users, run the server manually:
   ```sh
   cd dist-package/runtime/server
   NODE_ENV=production SERVE_CLIENT=1 PORT=5055 node dist/index.js
   ```
- For updates, distribute a new ZIP and repeat the steps above.

---
For questions or help, contact the maintainer or open an issue in the repo.

See also: `USER_GUIDE.md` for how end users run and operate the app.
