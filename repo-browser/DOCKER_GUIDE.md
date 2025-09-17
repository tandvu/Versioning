# Docker Distribution Guide for Repo Browser

## Overview
This guide shows you how to distribute your Repo Browser application as a Docker container. This approach provides several benefits:

- **No source code exposure**: Clients get a compiled container, not your source code
- **Consistent environment**: Works the same everywhere Docker runs
- **Easy deployment**: Single command to run the application
- **Dependency isolation**: All dependencies are bundled in the container

## Prerequisites

### For You (Building the Image)
1. **Docker Desktop** must be installed and running
2. **Windows**: Download from https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
3. **Start Docker Desktop** from the Start menu

### For Your Clients
1. **Docker Desktop** (recommended) or **Docker Engine**
2. No Node.js, npm, or source code dependencies needed

## Files Created

### 1. `Dockerfile`
Multi-stage build configuration that:
- Builds both React client and Express server
- Creates a production-ready container with only necessary files
- Runs as non-root user for security
- Includes health checks

### 2. `.dockerignore` 
Excludes unnecessary files from the Docker build context:
- Development files and scripts
- Documentation
- Git history
- node_modules (rebuilt in container)

### 3. `docker-compose.yml`
Optional file for easier container management with proper configuration.

### 4. Updated `package.json`
Added new Docker-related scripts:
- `docker:build` - Build the Docker image
- `docker:run` - Run the container
- `docker:dev` - Use docker-compose for development
- `docker:stop` - Stop docker-compose services
- `docker:clean` - Clean up Docker resources

## Building and Testing (For You)

### Step 1: Start Docker Desktop
1. Open Docker Desktop from the Start menu
2. Wait for it to fully start (green icon in system tray)

### Step 2: Build the Docker Image
```powershell
# Navigate to project directory
cd c:\tan_projects\repo-browser

# Build the image
npm run docker:build
# OR directly:
docker build -t repo-browser .
```

### Step 3: Test the Container Locally
```powershell
# Run the container
npm run docker:run
# OR directly:
docker run -p 3001:3001 repo-browser
```

The application should be available at: http://localhost:3001

### Step 4: Using Docker Compose (Alternative)
```powershell
# Build and run with docker-compose
npm run docker:dev

# Stop the services
npm run docker:stop
```

## Distribution to Clients

### Option 1: Docker Hub (Public/Private Registry)
```powershell
# Tag for registry
docker tag repo-browser your-dockerhub-username/repo-browser:latest

# Push to Docker Hub
docker push your-dockerhub-username/repo-browser:latest
```

**Client Usage:**
```powershell
# Client pulls and runs
docker run -p 3001:3001 your-dockerhub-username/repo-browser:latest
```

### Option 2: Save as Tar File (Offline Distribution)
```powershell
# Save image as tar file
docker save -o repo-browser.tar repo-browser:latest
```

**Client Usage:**
```powershell
# Client loads the image
docker load -i repo-browser.tar

# Client runs the container
docker run -p 3001:3001 repo-browser:latest
```

### Option 3: Private Registry
Set up your own Docker registry for enterprise environments.

## Client Instructions Template

Create this file for your clients:

### `DOCKER_CLIENT_GUIDE.md`
```markdown
# Repo Browser - Client Setup

## Prerequisites
- Docker Desktop installed and running

## Quick Start
1. [If using tar file] Load the application:
   ```
   docker load -i repo-browser.tar
   ```

2. Run the application:
   ```
   docker run -p 3001:3001 repo-browser:latest
   ```

3. Open your browser to: http://localhost:3001

## Stopping the Application
```
# Find the running container
docker ps

# Stop the container (replace CONTAINER_ID with actual ID)
docker stop CONTAINER_ID
```

## Updating
[Provide instructions based on your distribution method]
```

## Container Details

### What's Inside the Container
- **Base**: Node.js 18 Alpine Linux (lightweight)
- **Built client**: Compiled React application
- **Built server**: Compiled TypeScript Express server
- **Production dependencies only**: No development tools
- **Port**: 3001 (configurable)
- **User**: Non-root user (nodejs) for security

### Environment Variables
- `NODE_ENV=production`
- `SERVE_CLIENT=1` (serves React app from Express)

### Health Check
The container includes a health check that verifies the application is responding.

## Troubleshooting

### Build Issues
1. **Docker daemon not running**: Start Docker Desktop
2. **Build fails**: Check Docker Desktop has enough resources allocated
3. **Permission errors**: Ensure Docker Desktop is running with proper permissions

### Runtime Issues
1. **Port already in use**: Use different port: `docker run -p 3002:3001 repo-browser`
2. **Container won't start**: Check Docker Desktop logs
3. **Application not accessible**: Verify port mapping and firewall settings

## Security Notes
- Container runs as non-root user
- Only necessary files included in final image
- No source code exposed
- Health checks included for monitoring
- Alpine Linux base for minimal attack surface

## Performance Notes
- Multi-stage build minimizes final image size
- Production dependencies only
- Built-in health monitoring
- Efficient caching during builds

## Advanced Usage

### Custom Port
```powershell
docker run -p 8080:3001 repo-browser
```

### Background Running
```powershell
docker run -d -p 3001:3001 --name repo-browser-app repo-browser
```

### View Logs
```powershell
docker logs repo-browser-app
```

### Clean Up
```powershell
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Full cleanup
npm run docker:clean
```
