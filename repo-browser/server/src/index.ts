// --- SSE Progress Tracking ---
// ...existing code...
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { config, getConfig, updateConfig, RepoConfig } from './config.js';


const app = express();
app.use(cors());

// --- SSE Progress Tracking ---
const sseClients: Response[] = [];
function sendSseEvent(data: any) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { }
  }
}

app.get('/api/versioning/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// --- Debug helpers ---
const DEBUG_BUFFER_LIMIT = 1000;
const debugBuffer: { ts: number; line: string }[] = [];
function pushDebug(line: string) {
  const entry = { ts: Date.now(), line };
  debugBuffer.push(entry);
  if (debugBuffer.length > DEBUG_BUFFER_LIMIT) debugBuffer.splice(0, debugBuffer.length - DEBUG_BUFFER_LIMIT);
  console.log(line); // still emit to stdout
}

function debugListSecondBase(reason: string) {
  try {
    const secondBase = config.basePaths[1];
    pushDebug(`[debug] (${reason}) second base path configured: ${secondBase}`);
    if (!secondBase) return;
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
  } catch (e) {
    pushDebug('[debug] error during debugListSecondBase: ' + (e as any)?.message);
  }
}

// Emit early debug info on startup (before attempting to bind port)
debugListSecondBase('startup-pre-listen');

function listFoldersOnce(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.filter((e: fs.Dirent) => e.isDirectory()).map((e: fs.Dirent) => e.name);
  } catch {
    return [];
  }
}

function hasGitRepo(pathDir: string): boolean {
  try {
    const gitPath = path.join(pathDir, '.git');
    return fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
  } catch {
    return false;
  }
}

function listGitReposUnder(baseDir: string): string[] {
  // A repo is a direct child directory containing a .git folder.
  return listFoldersOnce(baseDir).filter(name => hasGitRepo(path.join(baseDir, name))).sort();
}

function detectVersion(repoPath: string): string | undefined {
  const baseName = path.basename(repoPath).toLowerCase();
  // Special case: opt-soa => read SOA/pom.xml <parent><version>
  if (baseName === 'opt-soa') {
    try {
      const pomPath = path.join(repoPath, 'SOA', 'pom.xml');
      if (fs.existsSync(pomPath)) {
        const xml = fs.readFileSync(pomPath, 'utf8');
        // Capture version inside <parent> ... <version> ... </parent>
        const match = xml.match(/<parent>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/parent>/i);
        if (match) {
          const v = match[1].trim();
          if (v) return v;
        }
      }
    } catch { /* ignore */ }
  }
  // Fallback: package.json version
  try {
    const pkgFile = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgFile)) {
      const raw = fs.readFileSync(pkgFile, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.version === 'string') return data.version as string;
    }
  } catch { /* ignore */ }
  return undefined;
}

// JSON parsing only for settings update route to avoid unnecessary overhead elsewhere.
app.get('/api/repos', (req: Request, res: Response) => {
  const raw = 'raw' in req.query; // if ?raw present, skip ignore filtering
  const wantSources = 'sources' in req.query; // if ?sources include origin base paths
  const wantVersions = 'versions' in req.query; // if ?versions include version info
  const set = new Set<string>();
  const sources: Record<string, Set<string>> = {};
  const versions: Record<string, Set<string>> = {};
  const ignoredCollected: string[] = [];
  const firstBase = config.basePaths[0];
  const secondBase = config.basePaths[1];
  pushDebug(`[repos] start raw=${raw} sources=${wantSources} versions=${wantVersions}`);
  for (const base of config.basePaths) {
    const stats = fs.existsSync(base) ? fs.statSync(base) : undefined;
    if (!stats) continue;
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
          if (!raw && base === firstBase && ignoreList.includes(basename.toLowerCase())) { ignoredCollected.push(basename); pushDebug(`[repos] ignored base repo ${basename}`); }
          else {
            set.add(basename);
            if (wantSources) { if (!sources[basename]) sources[basename] = new Set(); sources[basename].add(base); }
            if (wantVersions) {
              const ver = detectVersion(base);
              if (ver) { if (!versions[basename]) versions[basename] = new Set(); versions[basename].add(ver); }
            }
            pushDebug(`[repos] add base repo ${basename}`);
          }
        }
      } else {
        const ignoreList = (base === firstBase ? (config.ignore?.[base]?.map(n => n.toLowerCase()) || []) : []);
        for (const child of repoChildren) {
          // Only ignore if in ignore list, do not force-ignore opt-soa
          if (!raw && base === firstBase && ignoreList.includes(child.toLowerCase())) { ignoredCollected.push(child); pushDebug(`[repos] ignore child ${child} (first base)`); continue; }
          set.add(child);
          if (wantSources) { if (!sources[child]) sources[child] = new Set(); sources[child].add(base); }
          if (wantVersions) {
            const ver = detectVersion(path.join(base, child));
            if (ver) { if (!versions[child]) versions[child] = new Set(); versions[child].add(ver); }
          }
          pushDebug(`[repos] add child ${child} from base ${base}`);
        }
        if (hasGitRepo(base)) {
          if (base === firstBase && basename.toLowerCase() === 'opt-soa') {
            ignoredCollected.push(basename);
            pushDebug(`[repos] force-ignore base repo opt-soa in first base`);
          } else if (!raw && base === firstBase && ignoreList.includes(basename.toLowerCase())) { ignoredCollected.push(basename); pushDebug(`[repos] ignored base repo ${basename}`); }
          else {
            set.add(basename);
            if (wantSources) { if (!sources[basename]) sources[basename] = new Set(); sources[basename].add(base); }
            if (wantVersions) {
              const ver = detectVersion(base);
              if (ver) { if (!versions[basename]) versions[basename] = new Set(); versions[basename].add(ver); }
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
  const body: any = { repos: sortedRepos, raw, ignored: appliedIgnore };
  if (wantSources) body.sources = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, Array.from(v)]));
  if (wantVersions) body.versions = Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, Array.from(v).join(' | ')]));
  res.json(body);
});

// Return current configuration
app.get('/api/settings', (req: Request, res: Response) => {
  res.json(getConfig());
});

interface UpdateSettingsBody {
  basePaths?: string[];
  ignore?: Record<string, string[]>;
}

// Update configuration (replace provided fields). Persist to runtime config file.
app.put('/api/settings', express.json(), (req: Request, res: Response) => {
  const body: UpdateSettingsBody = req.body || {};
  const current = getConfig();
  const next: RepoConfig = {
    basePaths: Array.isArray(body.basePaths) ? body.basePaths.filter(p => typeof p === 'string' && p.trim().length) : current.basePaths,
    ignore: body.ignore ? body.ignore : current.ignore
  };
  updateConfig(next);
  res.json(getConfig());
});

// List raw folders for a specific base path (even if currently ignored)
app.get('/api/folders', (req: Request, res: Response) => {
  const base = (req.query.base as string) || '';
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
app.get('/api/debug/base', (req: Request, res: Response) => {
  const base = (req.query.path as string) || '';
  if (!base) return res.status(400).json({ error: 'Missing path param ?path=' });
  const exists = fs.existsSync(base);
  if (!exists) return res.json({ base, exists: false });
  const isDir = fs.statSync(base).isDirectory();
  if (!isDir) return res.json({ base, exists: true, isDir: false });
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
  let included: string[] = [];
  if (detected.length === 0) {
    if (hasGitRepo(base)) included.push(basename);
  } else {
    included = detected.slice();
    if (hasGitRepo(base)) included.push(basename);
  }
  included = Array.from(new Set(included));
  const optSoaPresent = fs.existsSync(path.join(base, 'opt-soa'));
  const forcedOptSoa = base === secondBase && optSoaPresent && !detected.includes('opt-soa');
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
    optSoaPresent
  });
});

// Browse arbitrary local folders (read-only). WARNING: no security/auth since local usage.
app.get('/api/browse', (req: Request, res: Response) => {
  let p = (req.query.path as string) || '';
  if (!p) {
    // default to first configured base or C:/
    p = config.basePaths[0] || 'C:/';
  }
  p = p.replace(/\\/g, '/');
  // Ensure Windows drive root format like C:/
  if (/^[A-Za-z]:$/.test(p)) p = p + '/';
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
    let parent: string | null = null;
    const norm = p.endsWith('/') ? p.slice(0, -1) : p;
    const idx = norm.lastIndexOf('/');
    if (idx > 2) { // e.g., C:/foo => parent C:/
      parent = norm.slice(0, idx + 1);
    } else if (idx === 2) { // at drive root like C:/
      parent = null;
    }
    res.json({ path: p, parent, folders: entries });
  } catch (e: any) {
    return res.status(400).json({ error: 'Cannot read path', detail: String(e?.message || e) });
  }
});

// Launch native folder selection dialog (Windows only). Returns selected path or cancelled.
app.get('/api/dialog/folder', async (req: Request, res: Response) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ error: 'Folder dialog supported only on Windows.' });
  }
  const start = (req.query.start as string) || config.basePaths[0] || 'C:/';
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
    const timeout = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, timeoutMs);
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
  } catch (e: any) {
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
        if (req.path.startsWith('/api/')) return res.status(404).end();
        res.sendFile(path.join(clientDist, 'index.html'));
      });
      console.log('Serving static client from', clientDist);
    } else {
      console.warn('SERVE_CLIENT=1 but client/dist not found. Did you run build?');
    }
  }
} catch (e) {
  console.warn('Static client serve setup failed:', e);
}

// Fixed port binding: if desired port is busy, do NOT start a secondary instance.
const desiredPort = Number(process.env.PORT) || 5055;
const server = app.listen(desiredPort, () => {
  console.log(`Repo server listening on port ${desiredPort}`);
  debugListSecondBase('listen-callback');
});
server.on('error', (err: any) => {
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
app.get('/api/debug/log', (req: Request, res: Response) => {
  const since = Number(req.query.since) || 0;
  const lines = debugBuffer.filter(e => e.ts >= since).map(e => e.line);
  res.json({ lines, total: debugBuffer.length, since });
});

// Simple health/status endpoint to verify active server instance
app.get('/api/health', (req: Request, res: Response) => {
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
app.get('/api/deploy/versions', (req: Request, res: Response) => {
  const deployPath = (req.query.path as string) || '';
  if (!deployPath) return res.status(400).json({ error: 'Missing ?path=' });
  if (!fs.existsSync(deployPath)) return res.status(404).json({ error: 'Path not found', path: deployPath });
  const stat = fs.statSync(deployPath);
  if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory', path: deployPath });
  let files: string[] = [];
  try {
    files = fs.readdirSync(deployPath).filter(f => f.toLowerCase().endsWith('.war'));
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to read directory', detail: String(e?.message || e) });
  }
  const versionPattern = /(.*)-([0-9]+\.[0-9]+\.[0-9]+)(?:[^0-9].*)?$/; // capture name-version, allow classifier after version
  const versions: Record<string, string> = {};
  function cmp(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10));
    const pb = b.split('.').map(n => parseInt(n, 10));
    for (let i = 0; i < 3; i++) {
      const da = pa[i] || 0; const db = pb[i] || 0;
      if (da !== db) return da - db;
    }
    return 0;
  }
  for (const f of files) {
    const base = f.replace(/\.war$/i, '');
    const m = base.match(versionPattern);
    if (!m) continue;
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
app.post('/api/versioning/start', express.json(), async (req: Request, res: Response) => {
  const body = req.body || {};
  const repos: string[] = Array.isArray(body.repos) ? body.repos.filter((r: any) => typeof r === 'string' && r.trim()) : [];
  if (repos.length === 0) return res.status(400).json({ error: 'No repos provided' });
  const results: any[] = [];
  pushDebug(`[versioning] start for repos: ${repos.join(', ')}`);

  // helper to run git command
  function runGit(repoDir: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string; cmd: string }> {
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
    let repoDir: string | null = null;
    for (const base of config.basePaths) {
      const candidate = path.join(base, repo);
      if (fs.existsSync(candidate) && hasGitRepo(candidate)) { repoDir = candidate; break; }
    }
    if (!repoDir) {
      const msg = 'not found or not a git repo';
      results.push({ repo, ok: false, error: msg });
      pushDebug(`[versioning] ${repo}: ${msg}`);
      continue;
    }
    const steps: any[] = [];
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
        if (revMain.code === 0) targetBranch = 'main';
        steps.push(revMain);
      } else {
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
      } else {
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
      } else {
        const buildResult = await new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
          const child = spawn(buildCmd, buildArgs, { cwd: buildCwd, shell: false });
          let stdout = '', stderr = '';
          child.stdout.on('data', d => {
            const str = d.toString();
            stdout += str;
            sendSseEvent({ repo, step: 'Build', status: 'running', stdout });
            // Also send each line as a separate log event for immediate feedback
            str.split(/\r?\n/).forEach((line: string) => {
              if (line.trim()) sendSseEvent({ repo, step: 'Build', status: 'running', stdout: line });
            });
          });
          child.stderr.on('data', d => {
            const str = d.toString();
            stderr += str;
            sendSseEvent({ repo, step: 'Build', status: 'running', stderr });
            str.split(/\r?\n/).forEach((line: string) => {
              if (line.trim()) sendSseEvent({ repo, step: 'Build', status: 'running', stderr: line });
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
      let warCandidates: string[] = [];
      if (buildOk) {
        let warDir: string | undefined;
        if (repo.toLowerCase() === 'opt-soa') {
          warDir = path.join(repoDir, 'SOA', 'target');
        } else {
          warDir = path.join(repoDir, 'target');
        }
        if (warDir && fs.existsSync(warDir)) {
          const allWars = fs.readdirSync(warDir).filter(f => f.endsWith('.war'));
          // Only deploy the latest WAR by version for the repo
          if (allWars.length > 0) {
            // Extract base name and version
            const versionPattern = /^(.*)-(\d+\.\d+\.\d+)(?:[^\d].*)?\.war$/;
            let latestWar: string | undefined;
            let latestVersion: string | undefined;
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
      function compareVersions(a: string, b: string): number {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const na = pa[i] || 0, nb = pb[i] || 0;
          if (na > nb) return 1;
          if (na < nb) return -1;
        }
        return 0;
      }

      // Deploy WAR file
      sendSseEvent({
        repo,
        step: 'Deploy WAR',
        status: 'running',
        stdout: [
          `Preparing to deploy WAR to ${deployFolder}...`,
          `- Removing any previously deployed versions matching the base name.`,
          `- Copying new WAR from target folder to deployment folder.`,
          `- WAR to deploy: ${warCandidates.map(w => path.basename(w)).join(', ') || 'None found'}`
        ].join('\n')
      });
      let deployedCount = 0;
      if (buildOk && warCandidates.length > 0) {
        for (const war of warCandidates) {
          if (fs.existsSync(war)) {
            const destName = path.basename(war);
            const destPath = path.join(deployFolder, destName);
            const baseName = destName.replace(/-\d+\.\d+\.\d+.*\.war$/i, '');
            try {
              // Delete all previous versions for this repo (e.g., opt-gui-*.war)
              const existingWars = fs.readdirSync(deployFolder).filter(f => f.startsWith(baseName) && f.endsWith('.war'));
              for (const oldWar of existingWars) {
                fs.unlinkSync(path.join(deployFolder, oldWar));
              }
              fs.copyFileSync(war, destPath);
              deployedCount++;
            } catch (e) {
              deployError = String(e);
            }
          }
        }
        deployOk = deployedCount === warCandidates.length;
        warPath = warCandidates.join(', ');
        sendSseEvent({ repo, step: 'Deploy WAR', status: deployOk ? 'success' : 'error', warPath, detail: deployError });
      } else {
        sendSseEvent({ repo, step: 'Deploy WAR', status: 'error', detail: 'No WARs to deploy' });
      }

      const ok = steps.every(s => s.code === 0) && buildOk && deployOk;
      const combinedStdout = steps.map(s => `# ${s.cmd}\n${s.stdout || ''}`).filter(Boolean).join('\n');
      const combinedStderr = steps.map(s => s.stderr && `# ${s.cmd}\n${s.stderr || ''}`).filter(Boolean).join('\n');
      results.push({ repo, ok, branch: targetBranch, steps, stdout: combinedStdout, stderr: combinedStderr, buildOk, warPath, deployOk, deployError });
      pushDebug(`[versioning] ${repo}: branch=${targetBranch} ok=${ok} buildOk=${buildOk} deployOk=${deployOk}`);
    } catch (e: any) {
      const errMsg = e?.message || 'unknown error';
      results.push({ repo, ok: false, error: errMsg, steps, buildOk, warPath, deployOk, deployError });
      pushDebug(`[versioning] ${repo}: exception ${errMsg}`);
    }
  }
  res.json({ results });
});
