# Repo Browser — User Guide

This guide shows how to run Repo Browser and use its features to browse repositories, build, and deploy with live logs.

## 1. Getting Started

You likely received a ZIP (e.g., `repo-browser-YYYYMMDD-HHMMSS.zip`).

1) Unzip the file to any folder (e.g., `C:\RepoBrowser`).
2) Open the unzipped folder and double‑click `Start-App.bat`.
3) Your default browser should open automatically. If not, visit:
   - http://localhost:5055 (or the port shown in the terminal window)

Notes
- If you want a different port, edit `Start-App.bat` and change the `PORT=` value (e.g., `PORT=5060`). Save and relaunch the batch file.
- To stop Repo Browser, close the terminal window or press Ctrl+C in it.

## 2. Main Screen Overview

The app has a simple layout:

- Repository list: all detected repos under your configured base paths.
- Actions: buttons to run processes (e.g., Build & Deploy) and view logs.
- Settings: configure where to scan for repos.
- Live Log: shows timestamped output while steps run.

### 2.1 Settings (Base Paths)
- Base paths tell Repo Browser where to look for repositories.
- To change them, open Settings in the UI and edit the list.
- The app scans top‑level folders and includes those that are Git repos (contain a `.git` folder).
- Special case: the second configured path may include a single repo folder (e.g., `opt-soa`).

### 2.2 Repository List
- Use the checkboxes to select which repos you want to process.
- Use the text filter to quickly narrow the list.
- The list processes one repo at a time in order.

## 3. Deployment Folder Path

If you deploy WAR files, set the destination folder once:
- Click the paste icon next to Deployment Folder Path and paste your path (e.g., `C:\OPT\jboss-eap-8.0.5\standalone\deployments`).
- The value is remembered between runs.
- During Deploy, WARs found in each repo’s `target/` (or special paths) are copied to this folder with narration messages.

## 4. Actions

- Start Versioning: runs the versioning steps. (Build & Deploy does the same set except the checkout step.)
- Build & Deploy: builds each selected repo and deploys WARs to the configured deployment folder.
- Show Live Log: opens the streaming log panel for a repo while it runs.

Processing behavior
- Repos run one at a time with live output streaming into the log.
- The app auto‑advances to the next repo and avoids multiple simultaneous streams.

## 5. Live Log

- Every line is timestamped like `[HH:MM:SS.mmm]`.
- The log autoscrolls to the latest line while a step is running.
- Duplicate lines are filtered to improve readability.
- ANSI colors are stripped; check marks are normalized to `OK` to avoid odd glyphs.
- A Copy button lets you copy the full log to the clipboard.
- If no output arrives for ~30 seconds during a running step, a stall warning is shown so you can investigate.

## 6. Common Tasks

- Build without deploy: run Build & Deploy with an empty or invalid deployment path; only builds will run.
- Change deployment path: update the path field using the paste icon; it saves automatically.
- Retry a repo: re‑select the repo and click the action again; the log will reflect the new run.

## 7. Troubleshooting

- Browser page doesn’t load:
  - Ensure the terminal shows `Repo server listening on port <PORT>`.
  - Try http://localhost:5055 (or the port set in `Start-App.bat`).
  - If the window closes immediately, run `Start-App.bat` from a terminal to see errors.

- Port already in use:
  - Another instance may be running. Close it, or edit `Start-App.bat` to set a different `PORT` and relaunch.

- No repositories listed:
  - Check your base paths in Settings.
  - Ensure the folders exist and contain Git repos (`.git` directory).

- Deploy fails:
  - Verify the Deployment Folder Path exists and is writable.
  - Ensure WAR files exist in the repo’s `target/` directory after build.

- Logs show odd characters:
  - The app strips ANSI color codes and normalizes symbols; copy the log via the Copy button if you need to share it.

## 8. Privacy and Security

- Repo Browser operates locally on your machine. It does not send your code or logs to the network.
- Use trusted deployment paths and be careful when pasting paths from untrusted sources.

## 9. Getting Help

- If you received this from your team, contact the sender for support.
- Developers can consult `README_DEV.md` for deeper technical details.
