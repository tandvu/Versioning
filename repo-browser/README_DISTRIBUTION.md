# Repo Browser Distribution Guide (Docker-Only)

This guide explains how to distribute and run Repo Browser using Docker only. Clients do not need Node.js, npm, or any build tools—just Docker Desktop.

## 1) Client Setup and Run

Prerequisites:
- Windows 10/11 with Docker Desktop installed and running
- PowerShell
- A Repo Browser Docker image tar file (e.g., repo-browser-image-YYYYMMDD-HHMMSS.tar)

Quick start (optional): Use the helper script

```powershell
# Basic
./Start-Docker-App.ps1

# Advanced: mount local repos, set BASE_PATHS, use root for Windows volume permissions, and follow logs
./Start-Docker-App.ps1 -Port 3001 `
  -Mount @("C:\AMPT:/app/AMPT", "C:\AMPT_DEV\TRMC_MODULE:/app/TRMC_MODULE") `
  -BasePaths @("/app/AMPT", "/app/TRMC_MODULE") `
  -UseRoot `
  -Follow
```

After it starts, open [http://localhost:3001](http://localhost:3001) in your browser.

### Get the image

Load the image from the .tar file you received (for example, `repo-browser-image-20250917-142239.tar`):

```powershell
# Load the image into Docker
docker load -i .\repo-browser-image-YYYYMMDD-HHMMSS.tar

# Verify the image exists
docker images | findstr repo-browser
```

### Start the app (basic)
Starts the server on [http://localhost:3001](http://localhost:3001) (mapped to container port 5055).

```powershell
docker run -d --name repo-browser -p 3001:5055 repo-browser:YYYY.MM.DD-HHmmss
```

Port mapping note:
- The app listens on port 5055 inside the container.
- The `-p HOST:5055` flag maps that container port to your machine. Change `HOST` (e.g., 3001, 5055) to pick the browser port you want.
- With the helper script, `-Port` sets the host port (default 3001): `./Start-Docker-App.ps1 -Port 5055`.
- With raw Docker, use `-p 3001:5055` to expose it on http://localhost:3001 (or change 3001 as needed).


### Start with all folders accessible (universal mount)
Mount your entire C:/ drive so any folder is available in the UI, regardless of client layout.

```powershell
# Mount all of C:/ as /host in the container
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

**Security note:** This gives the container access to all files on your C: drive. Only use on trusted machines. For more privacy, mount just a parent folder as shown above.

Open [http://localhost:3001](http://localhost:3001) in your browser.

Windows GUI quick setup (Docker Desktop):
- Volumes (Mounts): Host path = C:/, Container path = /host (use forward slashes)
- Environment variables: BASE_PATHS = /host
- Ports: 3001 (host) -> 5055 (container)
- Then, in the app, browse paths under /host (e.g., /host/AMPT, /host/AMPT_DEV/TRMC_MODULE).

Windows-to-container path mapping examples:
- C:\AMPT -> /host/AMPT
- C:\AMPT_DEV\TRMC_MODULE -> /host/AMPT_DEV/TRMC_MODULE
- C:\OPT\jboss-eap-8.0.5\standalone\deployments -> /host/OPT/jboss-eap-8.0.5/standalone/deployments

Environment variables:
- BASE_PATHS (comma-separated): Paths inside the container where your repos live. Used to discover projects and to locate private packages for local file installs.
- DEPLOYMENT_PATH (optional): Where to copy built WAR files inside the container. Default: /app/deployments.

### Why mounts and BASE_PATHS?
- The app runs inside the container and can only see the container filesystem. Host folders (like `C:\AMPT`) are invisible unless you bind-mount them with `-v`.
- The UI path selector works with container paths. So a host folder must be mounted to a container path (e.g., `C:\AMPT` -> `/app/AMPT`) to be selectable in the UI.
- You can’t add new mounts after the container starts; define the folders once at `docker run`. Dynamic UI selection still works—but only within the mounted roots.
- `BASE_PATHS` constrains where the backend scans for repos and where it looks for private packages to rewrite as `file:` dependencies. Include the mounted roots you want the app to search.

Simplify with a single parent mount:

```powershell
# Mount a single parent folder and point BASE_PATHS at it
docker run -d `
  --name repo-browser `
  -p 3001:5055 `
  -v C:/AMPT_DEV:/work `
  -e BASE_PATHS=/work `
  repo-browser:YYYY.MM.DD-HHmmss
```

Or with the helper:

```powershell
./Start-Docker-App.ps1 -Port 3001 -Mount @("C:\AMPT_DEV:/work") -BasePaths @("/work")
```

Then in the UI, choose paths like `/work/AMPT` or `/work/TRMC_MODULE`.

### Windows volume permissions (optional)
If you see EACCES (permission) errors when installing dependencies in mounted folders, start the container as root:

```powershell
docker run -d `
  --name repo-browser `
  -p 3001:5055 `
  -v C:/AMPT:/app/AMPT `
  -v C:/AMPT_DEV/TRMC_MODULE:/app/TRMC_MODULE `
  -e BASE_PATHS=/app/AMPT,/app/TRMC_MODULE `
  --user root `
  repo-browser:YYYY.MM.DD-HHmmss
```

### Stop and view logs

```powershell
# Stop the container by name
docker stop repo-browser

# Tail logs
docker logs --tail 200 -f repo-browser

# Or use the helper (timestamps, filters, follow)
./Tail-Backend-Logs.ps1 -Since 30m -Follow -Filter "error|warn"
```

### Cleanup (optional)

```powershell
# Remove the container and the image (replace the tag with your actual date/time tag)
docker rm -f repo-browser
docker rmi repo-browser:YYYY.MM.DD-HHmmss
```

### Troubleshooting
- Port 3001 in use: change the left side of -p 3001:5055 (e.g., -p 5055:5055) and browse to that port.

  Examples:

  ```powershell
  # Use port 5055 on the host with the helper, then open http://localhost:5055
  ./Start-Docker-App.ps1 -Port 5055
  ```

  ```powershell
  # Raw docker (basic)
  docker run -d --name repo-browser -p 5055:5055 repo-browser:YYYY.MM.DD-HHmmss
  ```

- Repos not detected: confirm your host paths are correct and included in BASE_PATHS.
- Private packages 404 from npm: the app rewrites package.json to use local file: paths based on BASE_PATHS.
- Permission errors on Windows mounts: add --user root to docker run.

---

## 2) Distributor Notes (internal use)

Use these steps if you are building and shipping the Docker image to clients.

Quick path (script):

```powershell
# From repo root; rebuilds, tags the image with today's datetime (yyyy.MM.dd-HHmmss) and 'latest', then produces a timestamped tar
./Build-And-Save-Image.ps1

# Optional: set a custom tag, output directory, and generate a checksum
./Build-And-Save-Image.ps1 -Tag 2025.09.17-142530 -OutputDir .\dist-image -GenerateChecksum
```

### Build the image from source
From the repository root:

```powershell
docker build -t repo-browser:latest .
```

### Save to a .tar file for offline distribution

```powershell
docker save -o .\repo-browser-image.tar repo-browser:latest

# Optional: compute a checksum to share with clients
Get-FileHash -Algorithm SHA256 .\repo-browser-image.tar
```

Recommended:
- Use date-based tags to identify releases (the build script does this for you).
- Provide this README alongside the .tar file.

---

For questions or help, contact the maintainer or open an issue in the repo.

