// --- SSE Progress Tracking ---
// Helper to compare version strings like 4.12.0 and 4.14.0
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;
        if (na > nb)
            return 1;
        if (na < nb)
            return -1;
    }
    return 0;
}
// ...existing code...
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { config, getConfig, updateConfig } from './config.js';
const app = express();
app.use(cors());
// Small helper to pause between narrated SSE messages
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
// Slight global slow-down factor for narrated deploy messages
const NARRATION_SLOW_FACTOR = 1.25; // "just a tad" slower
// --- SSE Progress Tracking ---
const sseClients = [];
function sendSseEvent(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(msg);
        }
        catch { }
    }
}
app.get('/api/versioning/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    // Heartbeat keep-alive every 15s so intermediaries don't close the stream
    const heartbeat = setInterval(() => {
        try {
            res.write(':ka\n\n');
        }
        catch { /* ignore */ }
    }, 15000);
    sseClients.push(res);
    req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1)
            sseClients.splice(idx, 1);
        clearInterval(heartbeat);
    });
});
// --- Debug helpers ---
const DEBUG_BUFFER_LIMIT = 1000;
const debugBuffer = [];
function pushDebug(line) {
    const entry = { ts: Date.now(), line };
    debugBuffer.push(entry);
    if (debugBuffer.length > DEBUG_BUFFER_LIMIT)
        debugBuffer.splice(0, debugBuffer.length - DEBUG_BUFFER_LIMIT);
    console.log(line); // still emit to stdout
}
function debugListSecondBase(reason) {
    try {
        const secondBase = config.basePaths[1];
        pushDebug(`[debug] (${reason}) second base path configured: ${secondBase}`);
        if (!secondBase)
            return;
        if (!fs.existsSync(secondBase)) {
            pushDebug('[debug] second base does NOT exist on disk');
            return;
        }
        const stat = fs.statSync(secondBase);
        if (!stat.isDirectory()) {
            pushDebug('[debug] second base exists but is NOT a directory');
            return;
        }
        const children = listFoldersOnce(secondBase);
        pushDebug(`[debug] second base children (${children.length}):`);
        if (children.length === 0) {
            pushDebug('  (none)');
        }
        for (const c of children) {
            const full = path.join(secondBase, c);
            const git = hasGitRepo(full);
            pushDebug(`  - ${c}${git ? ' [git]' : ''}`);
        }
        const optSoa = path.join(secondBase, 'opt-soa');
        pushDebug(`[debug] opt-soa exists: ${fs.existsSync(optSoa)}`);
        if (fs.existsSync(optSoa)) {
            pushDebug(`[debug] opt-soa has .git: ${hasGitRepo(optSoa)}`);
        }
    }
    catch (e) {
        pushDebug('[debug] error during debugListSecondBase: ' + e?.message);
    }
}
// Emit early debug info on startup (before attempting to bind port)
debugListSecondBase('startup-pre-listen');
function listFoldersOnce(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch {
        return [];
    }
}
function hasGitRepo(pathDir) {
    try {
        const gitPath = path.join(pathDir, '.git');
        return fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
    }
    catch {
        return false;
    }
}
function listGitReposUnder(baseDir) {
    // A repo is a direct child directory containing a .git folder.
    return listFoldersOnce(baseDir).filter(name => hasGitRepo(path.join(baseDir, name))).sort();
}
function detectVersion(repoPath) {
    // Look for .war files in target folder, keep only the latest version, remove the rest
    let targetDir = path.join(repoPath, 'target');
    if (path.basename(repoPath).toLowerCase() === 'opt-soa') {
        targetDir = path.join(repoPath, 'SOA', 'target');
    }
    if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
        const warFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.war'));
        if (warFiles.length > 0) {
            // Extract version from filename: name-version.war
            const versionPattern = /^(.*)-(\d+\.\d+\.\d+)(?:[^\d].*)?\.war$/;
            let latestWar = null;
            let latestVersion = null;
            for (const war of warFiles) {
                const m = war.match(versionPattern);
                if (m) {
                    const ver = m[2];
                    if (!latestVersion || compareVersions(ver, latestVersion) > 0) {
                        latestVersion = ver;
                        latestWar = war;
                    }
                }
            }
            // Remove older .war files
            for (const war of warFiles) {
                if (war !== latestWar) {
                    try {
                        fs.unlinkSync(path.join(targetDir, war));
                    }
                    catch { /* ignore */ }
                }
            }
            return latestVersion || undefined;
        }
    }
    // Fallback: package.json version (if no .war found)
    try {
        const pkgFile = path.join(repoPath, 'package.json');
        if (fs.existsSync(pkgFile)) {
            const raw = fs.readFileSync(pkgFile, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data.version === 'string')
                return data.version;
        }
    }
    catch { /* ignore */ }
    return undefined;
    // Helper to compare version strings like 4.12.0 and 4.14.0
    function compareVersions(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (na > nb)
                return 1;
            if (na < nb)
                return -1;
        }
        return 0;
    }
}
// JSON parsing only for settings update route to avoid unnecessary overhead elsewhere.
app.get('/api/repos', (req, res) => {
    const raw = 'raw' in req.query; // if ?raw present, skip ignore filtering
    const wantSources = 'sources' in req.query; // if ?sources include origin base paths
    const wantVersions = 'versions' in req.query; // if ?versions include version info
    const set = new Set();
    const sources = {};
    const versions = {};
    const ignoredCollected = [];
    const firstBase = config.basePaths[0];
    const secondBase = config.basePaths[1];
    pushDebug(`[repos] start raw=${raw} sources=${wantSources} versions=${wantVersions}`);
    for (const base of config.basePaths) {
        const stats = fs.existsSync(base) ? fs.statSync(base) : undefined;
        if (!stats)
            continue;
        if (stats.isDirectory()) {
            const basename = path.basename(base);
            let repoChildren = listGitReposUnder(base);
            pushDebug(`[repos] base ${base} git-children: ${repoChildren.join(', ') || '(none)'}`);
            if (base === secondBase) {
                const optSoaPath = path.join(base, 'opt-soa');
                if (fs.existsSync(optSoaPath) && !repoChildren.includes('opt-soa')) {
                    repoChildren = [...repoChildren, 'opt-soa'].sort();
                    pushDebug('[repos] forced include opt-soa under second base');
                }
            }
            if (repoChildren.length === 0) {
                if (hasGitRepo(base)) {
                    const ignoreList = (base === firstBase ? (config.ignore?.[base] || []).map(s => s.toLowerCase()) : []);
                    if (!raw && base === firstBase && ignoreList.includes(basename.toLowerCase())) {
                        ignoredCollected.push(basename);
                        pushDebug(`[repos] ignored base repo ${basename}`);
                    }
                    else {
                        set.add(basename);
                        if (wantSources) {
                            if (!sources[basename])
                                sources[basename] = new Set();
                            sources[basename].add(base);
                        }
                        if (wantVersions) {
                            const ver = detectVersion(base);
                            if (ver) {
                                if (!versions[basename])
                                    versions[basename] = new Set();
                                versions[basename].add(ver);
                            }
                        }
                        pushDebug(`[repos] add base repo ${basename}`);
                    }
                }
            }
            else {
                const ignoreList = (base === firstBase ? (config.ignore?.[base]?.map(n => n.toLowerCase()) || []) : []);
                for (const child of repoChildren) {
                    // Only ignore if in ignore list, do not force-ignore opt-soa
                    if (!raw && base === firstBase && ignoreList.includes(child.toLowerCase())) {
                        ignoredCollected.push(child);
                        pushDebug(`[repos] ignore child ${child} (first base)`);
                        continue;
                    }
                    set.add(child);
                    if (wantSources) {
                        if (!sources[child])
                            sources[child] = new Set();
                        sources[child].add(base);
                    }
                    if (wantVersions) {
                        const ver = detectVersion(path.join(base, child));
                        if (ver) {
                            if (!versions[child])
                                versions[child] = new Set();
                            versions[child].add(ver);
                        }
                    }
                    pushDebug(`[repos] add child ${child} from base ${base}`);
                }
                if (hasGitRepo(base)) {
                    if (base === firstBase && basename.toLowerCase() === 'opt-soa') {
                        ignoredCollected.push(basename);
                        pushDebug(`[repos] force-ignore base repo opt-soa in first base`);
                    }
                    else if (!raw && base === firstBase && ignoreList.includes(basename.toLowerCase())) {
                        ignoredCollected.push(basename);
                        pushDebug(`[repos] ignored base repo ${basename}`);
                    }
                    else {
                        set.add(basename);
                        if (wantSources) {
                            if (!sources[basename])
                                sources[basename] = new Set();
                            sources[basename].add(base);
                        }
                        if (wantVersions) {
                            const ver = detectVersion(base);
                            if (ver) {
                                if (!versions[basename])
                                    versions[basename] = new Set();
                                versions[basename].add(ver);
                            }
                        }
                        pushDebug(`[repos] add base repo ${basename}`);
                    }
                }
            }
        }
    }
    const appliedIgnore = raw ? [] : ignoredCollected;
    res.setHeader('X-RepoBrowser-Ignored', appliedIgnore.join(','));
    const sortedRepos = Array.from(set).sort();
    pushDebug(`[repos] final repos: ${sortedRepos.join(', ')}`);
    const body = { repos: sortedRepos, raw, ignored: appliedIgnore };
    if (wantSources)
        body.sources = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, Array.from(v)]));
    if (wantVersions)
        body.versions = Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, Array.from(v).join(' | ')]));
    res.json(body);
});
// Return current configuration
app.get('/api/settings', (req, res) => {
    res.json(getConfig());
});
// Update configuration (replace provided fields). Persist to runtime config file.
app.put('/api/settings', express.json(), (req, res) => {
    const body = req.body || {};
    const current = getConfig();
    const next = {
        basePaths: Array.isArray(body.basePaths) ? body.basePaths.filter(p => typeof p === 'string' && p.trim().length) : current.basePaths,
        ignore: body.ignore ? body.ignore : current.ignore
    };
    updateConfig(next);
    res.json(getConfig());
});
// List raw folders for a specific base path (even if currently ignored)
app.get('/api/folders', (req, res) => {
    const base = req.query.base || '';
    if (!base || !config.basePaths.includes(base)) {
        return res.status(400).json({ error: 'Invalid base path' });
    }
    let folders = listGitReposUnder(base);
    const secondBase = config.basePaths[1];
    if (base === secondBase) {
        const optSoaPath = path.join(base, 'opt-soa');
        if (fs.existsSync(optSoaPath) && !folders.includes('opt-soa')) {
            folders = [...folders, 'opt-soa'].sort();
        }
    }
    const repos = folders.map(name => ({ name, version: detectVersion(path.join(base, name)) }));
    if (hasGitRepo(base)) {
        const baseName = path.basename(base);
        if (!repos.find(r => r.name === baseName)) {
            repos.push({ name: baseName, version: detectVersion(base) });
        }
    }
    res.json({ base, folders, repos, ignore: config.ignore?.[base] || [] });
});
// Debug endpoint: inspect base path repo detection
app.get('/api/debug/base', (req, res) => {
    const base = req.query.path || '';
    if (!base)
        return res.status(400).json({ error: 'Missing path param ?path=' });
    const exists = fs.existsSync(base);
    if (!exists)
        return res.json({ base, exists: false });
    const isDir = fs.statSync(base).isDirectory();
    if (!isDir)
        return res.json({ base, exists: true, isDir: false });
    const firstBase = config.basePaths[0];
    const ignoreList = (base === firstBase ? (config.ignore?.[base] || []).map(s => s.toLowerCase()) : []);
    const secondBase = config.basePaths[1];
    const children = listFoldersOnce(base).map(name => {
        const full = path.join(base, name);
        const hasGit = hasGitRepo(full);
        const ignored = ignoreList.includes(name.toLowerCase());
        return { name, hasGit, ignored };
    });
    const detected = listGitReposUnder(base);
    // Reconstruct api/repos logic for this base only
    const basename = path.basename(base);
    let included = [];
    if (detected.length === 0) {
        if (hasGitRepo(base))
            included.push(basename);
    }
    else {
        included = detected.slice();
        if (hasGitRepo(base))
            included.push(basename);
    }
    included = Array.from(new Set(included));
    const optSoaPresent = fs.existsSync(path.join(base, 'opt-soa'));
    const forcedOptSoa = base === secondBase && optSoaPresent && !detected.includes('opt-soa');
    // Branch name detection
    const branchNames = {};
    for (const repoName of included) {
        let repoPath = path.join(base, repoName);
        // opt-soa special case: if under second base, check opt-soa folder
        if (repoName === 'opt-soa' && base === secondBase) {
            repoPath = path.join(base, 'opt-soa');
        }
        const gitHeadPath = path.join(repoPath, '.git', 'HEAD');
        if (fs.existsSync(gitHeadPath)) {
            try {
                const head = fs.readFileSync(gitHeadPath, 'utf8').trim();
                const m = head.match(/^ref: refs\/heads\/(.+)$/);
                if (m)
                    branchNames[repoName] = m[1];
                else
                    branchNames[repoName] = head;
            }
            catch {
                branchNames[repoName] = '';
            }
        }
    }
    return res.json({
        base,
        exists,
        isDir,
        configuredFirst: base === firstBase,
        configuredSecond: base === secondBase,
        ignoreList,
        children,
        detectedGitChildren: detected,
        finalIncluded: included.sort(),
        forcedOptSoa,
        optSoaPresent,
        branchNames
    });
});
// Browse arbitrary local folders (read-only). WARNING: no security/auth since local usage.
app.get('/api/browse', (req, res) => {
    let p = req.query.path || '';
    if (!p) {
        // default to first configured base or C:/
        p = config.basePaths[0] || 'C:/';
    }
    p = p.replace(/\\/g, '/');
    // Ensure Windows drive root format like C:/
    if (/^[A-Za-z]:$/.test(p))
        p = p + '/';
    try {
        const stat = fs.statSync(p);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }
        const entries = fs.readdirSync(p, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        // compute parent
        let parent = null;
        const norm = p.endsWith('/') ? p.slice(0, -1) : p;
        const idx = norm.lastIndexOf('/');
        if (idx > 2) { // e.g., C:/foo => parent C:/
            parent = norm.slice(0, idx + 1);
        }
        else if (idx === 2) { // at drive root like C:/
            parent = null;
        }
        res.json({ path: p, parent, folders: entries });
    }
    catch (e) {
        return res.status(400).json({ error: 'Cannot read path', detail: String(e?.message || e) });
    }
});
// Launch native folder selection dialog (Windows only). Returns selected path or cancelled.
app.get('/api/dialog/folder', async (req, res) => {
    if (process.platform !== 'win32') {
        return res.status(400).json({ error: 'Folder dialog supported only on Windows.' });
    }
    const start = req.query.start || config.basePaths[0] || 'C:/';
    // Use Shell.Application BrowseForFolder (works in non-STA too) with fallback to Windows Forms dialog.
    const psScript = `
  $start = '${start.replace(/'/g, "''")}';
  function Use-ShellBrowse {
    try {
      $shell = New-Object -ComObject Shell.Application
      $folder = $shell.BrowseForFolder(0,'Select new base path',0,$start)
      if ($folder -and $folder.Self -and $folder.Self.Path) { $folder.Self.Path }
    } catch { }
  }
  $sel = Use-ShellBrowse
  if (-not $sel) {
    try {
      Add-Type -AssemblyName System.Windows.Forms | Out-Null
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = 'Select new base path'
      if (Test-Path $start) { $dialog.SelectedPath = $start }
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $sel = $dialog.SelectedPath
      }
    } catch { }
  }
  if ($sel) { [Console]::Out.WriteLine($sel) }
  `;
    const psCmd = ['-STA', '-NoProfile', '-Command', psScript];
    try {
        const child = spawn('powershell.exe', psCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timeoutMs = 180000; // 3 minutes
        const timeout = setTimeout(() => { try {
            child.kill('SIGKILL');
        }
        catch { } }, timeoutMs);
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('close', code => {
            clearTimeout(timeout);
            const sel = stdout.trim();
            if (sel) {
                const norm = sel.replace(/\\/g, '/');
                return res.json({ path: norm });
            }
            return res.json({ cancelled: true, code, stderr: stderr.trim() });
        });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to launch dialog', detail: String(e?.message || e) });
    }
});
// Optionally serve built client (production) when SERVE_CLIENT=1 and dist exists.
try {
    if (process.env.SERVE_CLIENT === '1') {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const clientDist = path.resolve(__dirname, '../../client/dist');
        if (fs.existsSync(clientDist)) {
            app.use(express.static(clientDist));
            // SPA fallback (after API routes, before 404)
            app.get('*', (req, res) => {
                // Avoid intercepting API paths
                if (req.path.startsWith('/api/'))
                    return res.status(404).end();
                res.sendFile(path.join(clientDist, 'index.html'));
            });
            console.log('Serving static client from', clientDist);
        }
        else {
            console.warn('SERVE_CLIENT=1 but client/dist not found. Did you run build?');
        }
    }
}
catch (e) {
    console.warn('Static client serve setup failed:', e);
}
// Fixed port binding: if desired port is busy, do NOT start a secondary instance.
const desiredPort = Number(process.env.PORT) || 5055;
const server = app.listen(desiredPort, () => {
    console.log(`Repo server listening on port ${desiredPort}`);
    debugListSecondBase('listen-callback');
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${desiredPort} is already in use. Not starting another instance; assuming an existing repo-browser server is running.`);
        pushDebug(`[startup] port ${desiredPort} in use; exiting so only one active instance remains.`);
        debugListSecondBase('port-in-use');
        // Exit so user can clearly restart the intended single instance
        process.exit(0);
    }
    console.error('Server failed to start:', err);
    process.exit(1);
});
// Debug log exposure endpoint
app.get('/api/debug/log', (req, res) => {
    const since = Number(req.query.since) || 0;
    const lines = debugBuffer.filter(e => e.ts >= since).map(e => e.line);
    res.json({ lines, total: debugBuffer.length, since });
});
// Simple health/status endpoint to verify active server instance
app.get('/api/health', (req, res) => {
    const secondBase = config.basePaths[1];
    const secondChildren = secondBase && fs.existsSync(secondBase) ? listFoldersOnce(secondBase) : [];
    const payload = {
        ok: true,
        pid: process.pid,
        time: new Date().toISOString(),
        basePaths: config.basePaths,
        secondBase,
        secondBaseChildren: secondChildren,
        note: 'If opt-soa expected ensure it appears in secondBaseChildren and has a .git folder',
        reposSampleUrl: '/api/repos',
        debugLogLines: debugBuffer.slice(-10).map(l => l.line)
    };
    res.json(payload);
});
// Deployment folder scan: extract deployed versions from .war files.
app.get('/api/deploy/versions', (req, res) => {
    const deployPath = req.query.path || '';
    if (!deployPath)
        return res.status(400).json({ error: 'Missing ?path=' });
    if (!fs.existsSync(deployPath))
        return res.status(404).json({ error: 'Path not found', path: deployPath });
    const stat = fs.statSync(deployPath);
    if (!stat.isDirectory())
        return res.status(400).json({ error: 'Not a directory', path: deployPath });
    let files = [];
    try {
        files = fs.readdirSync(deployPath).filter(f => f.toLowerCase().endsWith('.war'));
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to read directory', detail: String(e?.message || e) });
    }
    const versionPattern = /(.*)-([0-9]+\.[0-9]+\.[0-9]+)(?:[^0-9].*)?$/; // capture name-version, allow classifier after version
    const versions = {};
    function cmp(a, b) {
        const pa = a.split('.').map(n => parseInt(n, 10));
        const pb = b.split('.').map(n => parseInt(n, 10));
        for (let i = 0; i < 3; i++) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da !== db)
                return da - db;
        }
        return 0;
    }
    for (const f of files) {
        const base = f.replace(/\.war$/i, '');
        const m = base.match(versionPattern);
        if (!m)
            continue;
        const name = m[1];
        const ver = m[2];
        if (!versions[name] || cmp(ver, versions[name]) > 0) {
            versions[name] = ver;
        }
    }
    pushDebug(`[deploy] scanned ${files.length} war files in ${deployPath}; extracted ${Object.keys(versions).length} versions`);
    res.json({ path: deployPath, countWar: files.length, versions });
});
// Start Versioning: checkout master branch for provided repos
// Build & Deploy: build and deploy selected repos without branch checkout
app.post('/api/versioning/build-deploy', express.json(), async (req, res) => {
    pushDebug(`[build-deploy] process.env.PATH: ${process.env.PATH}`);
    const body = req.body || {};
    const repos = Array.isArray(body.repos) ? body.repos.filter((r) => typeof r === 'string' && r.trim()) : [];
    const deployFolder = body.deployPath || 'C:/OPT/jboss-eap-8.0.5/standalone/deployments';
    pushDebug(`[build-deploy] endpoint called with repos: ${JSON.stringify(repos)}, deployPath: ${deployFolder}`);
    if (repos.length === 0)
        return res.status(400).json({ error: 'No repos provided' });
    const results = [];
    for (const repo of repos) {
        let repoDir = null;
        for (const base of config.basePaths) {
            const candidate = path.join(base, repo);
            if (fs.existsSync(candidate) && hasGitRepo(candidate)) {
                repoDir = candidate;
                break;
            }
        }
        if (!repoDir) {
            const msg = 'not found or not a git repo';
            results.push({ repo, ok: false, error: msg });
            pushDebug(`[build-deploy] ${repo}: ${msg}`);
            continue;
        }
        const steps = [];
        let buildOk = false;
        let warPath = null;
        let deployOk = false;
        let deployError = null;
        try {
            // Build step
            let buildCmd;
            let buildArgs;
            let buildCwd = repoDir;
            if (repo.toLowerCase() === 'opt-soa') {
                buildCwd = path.join(repoDir, 'SOA');
                sendSseEvent({ repo, step: 'Build', status: 'running', stdout: `$ cd ${buildCwd}\n$ mvn clean install` });
                buildCmd = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
                buildArgs = ['clean', 'install'];
            }
            else {
                sendSseEvent({ repo, step: 'Build', status: 'running', stdout: `$ cd ${buildCwd}\n$ npm run build` });
                // Use full path to npm.cmd for Windows
                buildCmd = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\npm.cmd' : 'npm';
                buildArgs = ['run', 'build'];
            }
            const child = spawn(buildCmd, buildArgs, { cwd: buildCwd, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            // Stream live logs via SSE while build runs
            child.stdout.on('data', d => {
                stdout += d.toString();
                sendSseEvent({ repo, step: 'Build', status: 'running', stdout });
            });
            child.stderr.on('data', d => {
                stderr += d.toString();
                sendSseEvent({ repo, step: 'Build', status: 'running', stderr });
            });
            const buildResult = await new Promise(resolve => {
                child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
                child.on('error', err => resolve({ code: -1, stdout, stderr: String(err) }));
            });
            pushDebug(`[build-deploy] ${repo}: build exit code=${buildResult.code}`);
            if (buildResult.stdout)
                pushDebug(`[build-deploy] ${repo}: build stdout=\n${buildResult.stdout}`);
            if (buildResult.stderr)
                pushDebug(`[build-deploy] ${repo}: build stderr=\n${buildResult.stderr}`);
            steps.push({ cmd: `${buildCmd} ${buildArgs.join(' ')}`, code: buildResult.code, stdout: buildResult.stdout, stderr: buildResult.stderr });
            buildOk = buildResult.code === 0;
            sendSseEvent({ repo, step: 'Build', status: buildOk ? 'success' : 'error', stdout: buildResult.stdout, stderr: buildResult.stderr });
            // Find WAR file
            let warCandidates = [];
            if (buildOk) {
                let warDir;
                if (repo.toLowerCase() === 'opt-soa') {
                    warDir = path.join(repoDir, 'SOA', 'target');
                }
                else {
                    warDir = path.join(repoDir, 'target');
                }
                if (warDir && fs.existsSync(warDir)) {
                    const allWars = fs.readdirSync(warDir).filter(f => f.endsWith('.war'));
                    if (allWars.length > 0) {
                        // Only deploy the latest WAR by version for the repo
                        const versionPattern = /^(.*)-(\d+\.\d+\.\d+)(?:[^\d].*)?\.war$/;
                        let latestWar;
                        let latestVersion;
                        for (const war of allWars) {
                            const m = war.match(versionPattern);
                            if (m) {
                                const [, base, ver] = m;
                                if (!latestVersion || compareVersions(ver, latestVersion) > 0) {
                                    latestVersion = ver;
                                    latestWar = war;
                                }
                            }
                        }
                        if (latestWar) {
                            warCandidates = [path.join(warDir, latestWar)];
                        }
                    }
                }
            }
            if (!buildOk) {
                pushDebug(`[build-deploy] ${repo}: build failed, skipping deploy step.`);
            }
            if (warCandidates.length > 0) {
                sendSseEvent({ repo, step: 'Build', status: 'success', warPath: warCandidates.join(', ') });
            }
            // Deploy WAR file with narrated, gradual SSE messages
            {
                let deployStdout = '';
                const say = async (line, pauseMs = 500) => {
                    deployStdout += (deployStdout ? '\n' : '') + line;
                    sendSseEvent({ repo, step: 'Deploy WAR', status: 'running', stdout: deployStdout });
                    if (pauseMs > 0)
                        await sleep(Math.round(pauseMs * NARRATION_SLOW_FACTOR));
                };
                await say(`Preparing to deploy WAR to ${deployFolder}...`, 700);
                let deployedCount = 0;
                if (buildOk && warCandidates.length > 0) {
                    const firstWar = warCandidates[0];
                    const destName = path.basename(firstWar);
                    const baseName = destName.replace(/-\d+\.\d+\.\d+.*\.war$/i, '');
                    await say(`Scanning for existing ${baseName}-*.war in deployment folder...`, 500);
                    const existingWars = fs.existsSync(deployFolder) ? fs.readdirSync(deployFolder).filter(f => f.startsWith(baseName) && f.endsWith('.war')) : [];
                    await say(existingWars.length ? `Found ${existingWars.length} previous version(s): ${existingWars.join(', ')}` : 'No previous versions found.', 400);
                    for (const oldWar of existingWars) {
                        await say(`Deleting ${oldWar}...`, 200);
                        try {
                            fs.unlinkSync(path.join(deployFolder, oldWar));
                            await say(`Deleted ${oldWar}.`, 150);
                        }
                        catch (e) {
                            deployError = String(e);
                            await say(`Failed to delete ${oldWar}: ${deployError}`, 0);
                        }
                    }
                    for (const war of warCandidates) {
                        if (!fs.existsSync(war)) {
                            await say(`WAR not found: ${war}`, 0);
                            continue;
                        }
                        const dest = path.join(deployFolder, path.basename(war));
                        await say(`Copying ${path.basename(war)} to deployment folder...`, 400);
                        try {
                            fs.copyFileSync(war, dest);
                            deployedCount++;
                            await say(`Copied to ${dest}.`, 300);
                        }
                        catch (e) {
                            deployError = String(e);
                            await say(`Copy failed: ${deployError}`, 0);
                        }
                    }
                    await say('Finalizing deployment...', 600);
                    deployOk = deployedCount === warCandidates.length;
                    warPath = warCandidates.join(', ');
                    // Extra pause to keep the step visible a little longer
                    await sleep(Math.round(800 * NARRATION_SLOW_FACTOR));
                    sendSseEvent({ repo, step: 'Deploy WAR', status: deployOk ? 'success' : 'error', warPath, detail: deployError, stdout: deployStdout });
                }
                else {
                    await say('No WARs to deploy.', 600);
                    sendSseEvent({ repo, step: 'Deploy WAR', status: 'error', detail: 'No WARs to deploy', stdout: deployStdout });
                    if (!buildOk) {
                        pushDebug(`[build-deploy] ${repo}: no WARs to deploy because build failed.`);
                    }
                    else {
                        pushDebug(`[build-deploy] ${repo}: no WARs found to deploy after build.`);
                    }
                }
            }
            const ok = steps.every(s => s.code === 0) && buildOk && deployOk;
            const combinedStdout = steps.map(s => `# ${s.cmd}\n${s.stdout || ''}`).filter(Boolean).join('\n');
            const combinedStderr = steps.map(s => s.stderr && `# ${s.cmd}\n${s.stderr || ''}`).filter(Boolean).join('\n');
            results.push({ repo, ok, steps, stdout: combinedStdout, stderr: combinedStderr, buildOk, warPath, deployOk, deployError });
            pushDebug(`[build-deploy] ${repo}: ok=${ok} buildOk=${buildOk} deployOk=${deployOk}`);
        }
        catch (e) {
            const errMsg = e?.message || 'unknown error';
            results.push({ repo, ok: false, error: errMsg, steps, buildOk, warPath, deployOk, deployError });
            pushDebug(`[build-deploy] ${repo}: exception ${errMsg}`);
        }
    }
    res.json({ results });
});
app.post('/api/versioning/start', express.json(), async (req, res) => {
    const body = req.body || {};
    const repos = Array.isArray(body.repos) ? body.repos.filter((r) => typeof r === 'string' && r.trim()) : [];
    if (repos.length === 0)
        return res.status(400).json({ error: 'No repos provided' });
    const results = [];
    pushDebug(`[versioning] start for repos: ${repos.join(', ')}`);
    // helper to run git command
    function runGit(repoDir, args) {
        return new Promise(resolve => {
            const child = spawn('git', args, { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', d => stdout += d.toString());
            child.stderr.on('data', d => stderr += d.toString());
            child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), cmd: ['git', ...args].join(' ') }));
            child.on('error', () => resolve({ code: -1, stdout: stdout.trim(), stderr: 'spawn error', cmd: ['git', ...args].join(' ') }));
        });
    }
    // Get deployment folder from client if provided, else use default
    const deployFolder = body.deploymentFolderPath || 'C:/OPT/jboss-eap-8.0.5/standalone/deployments';
    for (const repo of repos) {
        sendSseEvent({ repo, step: 'Checkout master', status: 'running' });
        let repoDir = null;
        for (const base of config.basePaths) {
            const candidate = path.join(base, repo);
            if (fs.existsSync(candidate) && hasGitRepo(candidate)) {
                repoDir = candidate;
                break;
            }
        }
        if (!repoDir) {
            const msg = 'not found or not a git repo';
            results.push({ repo, ok: false, error: msg });
            pushDebug(`[versioning] ${repo}: ${msg}`);
            continue;
        }
        const steps = [];
        let buildOk = false;
        let warPath = null;
        let deployOk = false;
        let deployError = null;
        try {
            // fetch latest
            sendSseEvent({ repo, step: 'Checkout master', status: 'running', stdout: `$ cd ${repoDir}\n$ git fetch --all --prune` });
            steps.push(await runGit(repoDir, ['fetch', '--all', '--prune']));
            // determine target branch preference: master then main
            let targetBranch = 'master';
            const revMaster = await runGit(repoDir, ['rev-parse', '--verify', 'master']);
            if (revMaster.code !== 0) {
                const revMain = await runGit(repoDir, ['rev-parse', '--verify', 'main']);
                if (revMain.code === 0)
                    targetBranch = 'main';
                steps.push(revMain);
            }
            else {
                steps.push(revMaster);
            }
            // checkout branch
            sendSseEvent({ repo, step: 'Checkout master', status: 'running', stdout: `$ git checkout ${targetBranch}` });
            const checkoutRes = await runGit(repoDir, ['checkout', targetBranch]);
            steps.push(checkoutRes);
            // pull latest
            sendSseEvent({ repo, step: 'Checkout master', status: 'running', stdout: `$ git pull --ff-only` });
            const pullRes = await runGit(repoDir, ['pull', '--ff-only']);
            steps.push(pullRes);
            // Send SSE for checkout step with branch info and logs
            sendSseEvent({
                repo,
                step: 'Checkout master',
                status: 'success',
                branch: targetBranch,
                stdout: [checkoutRes.stdout, pullRes.stdout].filter(Boolean).join('\n'),
                stderr: [checkoutRes.stderr, pullRes.stderr].filter(Boolean).join('\n'),
            });
            // Build step
            let buildCmd, buildArgs, buildCwd;
            if (repo.toLowerCase() === 'opt-soa') {
                buildCmd = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
                buildArgs = ['clean', 'install'];
                buildCwd = path.join(repoDir, 'SOA');
            }
            else {
                buildCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                buildArgs = ['run', 'build'];
                buildCwd = repoDir;
            }
            sendSseEvent({ repo, step: 'Build', status: 'running', stdout: `$ ${buildCmd} ${buildArgs.join(' ')}` });
            // Ensure buildCwd exists and is a directory
            if (!fs.existsSync(buildCwd) || !fs.statSync(buildCwd).isDirectory()) {
                steps.push({ cmd: 'skip build', code: -1, stdout: '', stderr: `Build directory not found: ${buildCwd}` });
                buildOk = false;
                sendSseEvent({ repo, step: 'Build', status: 'error', detail: `Build directory not found: ${buildCwd}` });
            }
            else {
                const buildResult = await new Promise(resolve => {
                    const child = spawn(buildCmd, buildArgs, { cwd: buildCwd, shell: false });
                    let stdout = '', stderr = '';
                    child.stdout.on('data', d => {
                        const str = d.toString();
                        stdout += str;
                        sendSseEvent({ repo, step: 'Build', status: 'running', stdout });
                        // Also send each line as a separate log event for immediate feedback
                        str.split(/\r?\n/).forEach((line) => {
                            if (line.trim())
                                sendSseEvent({ repo, step: 'Build', status: 'running', stdout: line });
                        });
                    });
                    child.stderr.on('data', d => {
                        const str = d.toString();
                        stderr += str;
                        sendSseEvent({ repo, step: 'Build', status: 'running', stderr });
                        str.split(/\r?\n/).forEach((line) => {
                            if (line.trim())
                                sendSseEvent({ repo, step: 'Build', status: 'running', stderr: line });
                        });
                    });
                    child.on('close', code => resolve({ code: Number(code), stdout, stderr }));
                    child.on('error', err => resolve({ code: -1, stdout, stderr: String(err) }));
                });
                steps.push({ cmd: `${buildCmd} ${buildArgs.join(' ')}`, code: buildResult.code, stdout: buildResult.stdout, stderr: buildResult.stderr });
                buildOk = buildResult.code === 0;
                sendSseEvent({ repo, step: 'Build', status: buildOk ? 'success' : 'error', stdout: buildResult.stdout, stderr: buildResult.stderr });
            }
            // Find WAR file
            let warCandidates = [];
            if (buildOk) {
                let warDir;
                if (repo.toLowerCase() === 'opt-soa') {
                    warDir = path.join(repoDir, 'SOA', 'target');
                }
                else {
                    warDir = path.join(repoDir, 'target');
                }
                if (warDir && fs.existsSync(warDir)) {
                    const allWars = fs.readdirSync(warDir).filter(f => f.endsWith('.war'));
                    // Only deploy the latest WAR by version for the repo
                    if (allWars.length > 0) {
                        // Extract base name and version
                        const versionPattern = /^(.*)-(\d+\.\d+\.\d+)(?:[^\d].*)?\.war$/;
                        let latestWar;
                        let latestVersion;
                        for (const war of allWars) {
                            const m = war.match(versionPattern);
                            if (m) {
                                const [, base, ver] = m;
                                if (!latestVersion || compareVersions(ver, latestVersion) > 0) {
                                    latestVersion = ver;
                                    latestWar = war;
                                }
                            }
                        }
                        if (latestWar) {
                            warCandidates = [path.join(warDir, latestWar)];
                        }
                    }
                }
            }
            if (warCandidates.length > 0) {
                sendSseEvent({ repo, step: 'Build', status: 'success', warPath: warCandidates.join(', ') });
            }
            // Helper to compare version strings like 4.12.0 and 4.14.0
            function compareVersions(a, b) {
                const pa = a.split('.').map(Number);
                const pb = b.split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const na = pa[i] || 0, nb = pb[i] || 0;
                    if (na > nb)
                        return 1;
                    if (na < nb)
                        return -1;
                }
                return 0;
            }
            // Deploy WAR file with narrated, gradual SSE messages (same UX as build-deploy)
            {
                let deployStdout = '';
                const say = async (line, pauseMs = 500) => {
                    deployStdout += (deployStdout ? '\n' : '') + line;
                    sendSseEvent({ repo, step: 'Deploy WAR', status: 'running', stdout: deployStdout });
                    if (pauseMs > 0)
                        await sleep(Math.round(pauseMs * NARRATION_SLOW_FACTOR));
                };
                await say(`Preparing to deploy WAR to ${deployFolder}...`, 700);
                let deployedCount = 0;
                if (buildOk && warCandidates.length > 0) {
                    const firstWar = warCandidates[0];
                    const destName = path.basename(firstWar);
                    const baseName = destName.replace(/-\d+\.\d+\.\d+.*\.war$/i, '');
                    await say(`Scanning for existing ${baseName}-*.war in deployment folder...`, 500);
                    const existingWars = fs.existsSync(deployFolder) ? fs.readdirSync(deployFolder).filter(f => f.startsWith(baseName) && f.endsWith('.war')) : [];
                    await say(existingWars.length ? `Found ${existingWars.length} previous version(s): ${existingWars.join(', ')}` : 'No previous versions found.', 400);
                    for (const oldWar of existingWars) {
                        await say(`Deleting ${oldWar}...`, 200);
                        try {
                            fs.unlinkSync(path.join(deployFolder, oldWar));
                            await say(`Deleted ${oldWar}.`, 150);
                        }
                        catch (e) {
                            deployError = String(e);
                            await say(`Failed to delete ${oldWar}: ${deployError}`, 0);
                        }
                    }
                    for (const war of warCandidates) {
                        if (!fs.existsSync(war)) {
                            await say(`WAR not found: ${war}`, 0);
                            continue;
                        }
                        const dest = path.join(deployFolder, path.basename(war));
                        await say(`Copying ${path.basename(war)} to deployment folder...`, 400);
                        try {
                            fs.copyFileSync(war, dest);
                            deployedCount++;
                            await say(`Copied to ${dest}.`, 300);
                        }
                        catch (e) {
                            deployError = String(e);
                            await say(`Copy failed: ${deployError}`, 0);
                        }
                    }
                    await say('Finalizing deployment...', 600);
                    deployOk = deployedCount === warCandidates.length;
                    warPath = warCandidates.join(', ');
                    await sleep(Math.round(800 * NARRATION_SLOW_FACTOR));
                    sendSseEvent({ repo, step: 'Deploy WAR', status: deployOk ? 'success' : 'error', warPath, detail: deployError, stdout: deployStdout });
                }
                else {
                    await say('No WARs to deploy.', 600);
                    sendSseEvent({ repo, step: 'Deploy WAR', status: 'error', detail: 'No WARs to deploy', stdout: deployStdout });
                }
            }
            const ok = steps.every(s => s.code === 0) && buildOk && deployOk;
            const combinedStdout = steps.map(s => `# ${s.cmd}\n${s.stdout || ''}`).filter(Boolean).join('\n');
            const combinedStderr = steps.map(s => s.stderr && `# ${s.cmd}\n${s.stderr || ''}`).filter(Boolean).join('\n');
            results.push({ repo, ok, branch: targetBranch, steps, stdout: combinedStdout, stderr: combinedStderr, buildOk, warPath, deployOk, deployError });
            pushDebug(`[versioning] ${repo}: branch=${targetBranch} ok=${ok} buildOk=${buildOk} deployOk=${deployOk}`);
        }
        catch (e) {
            const errMsg = e?.message || 'unknown error';
            results.push({ repo, ok: false, error: errMsg, steps, buildOk, warPath, deployOk, deployError });
            pushDebug(`[versioning] ${repo}: exception ${errMsg}`);
        }
    }
    res.json({ results });
});
