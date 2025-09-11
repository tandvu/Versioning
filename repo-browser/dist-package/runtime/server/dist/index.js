import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, getConfig, updateConfig } from './config.js';
const app = express();
app.use(cors());
function listFoldersOnce(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch {
        return [];
    }
}
// JSON parsing only for settings update route to avoid unnecessary overhead elsewhere.
app.get('/api/repos', (req, res) => {
    const raw = 'raw' in req.query; // if ?raw present, skip ignore filtering
    const set = new Set();
    for (const base of config.basePaths) {
        const stats = fs.existsSync(base) ? fs.statSync(base) : undefined;
        if (!stats)
            continue;
        if (stats.isDirectory()) {
            // If base itself is a repo folder (like opt-soa), include its name
            const parent = path.dirname(base).replace(/\\/g, '/');
            const basename = path.basename(base);
            // If parent scan: when base is an actual folder containing repos
            // We treat: if it has subfolders with .git or other markers
            const children = listFoldersOnce(base);
            if (children.length === 0) {
                set.add(basename);
            }
            else {
                // base might be a directory containing multiple repos (like C:/AMPT)
                if (config.basePaths.includes(base)) {
                    const ignoreList = config.ignore?.[base]?.map(n => n.toLowerCase()) || [];
                    for (const child of children) {
                        if (!raw && ignoreList.includes(child.toLowerCase()))
                            continue;
                        set.add(child);
                    }
                }
                // also include the base directory itself if we explicitly listed it and it's a repo
                if (fs.existsSync(path.join(base, '.git'))) {
                    set.add(basename);
                }
            }
        }
    }
    const appliedIgnore = raw ? [] : (config.ignore?.['C:/AMPT'] || []);
    res.setHeader('X-RepoBrowser-Ignored', appliedIgnore.join(','));
    res.json({ repos: Array.from(set).sort(), raw, ignored: appliedIgnore });
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
    const folders = listFoldersOnce(base);
    res.json({ base, folders: folders.sort(), ignore: config.ignore?.[base] || [] });
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
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${desiredPort} is already in use. Not starting another instance; assuming an existing repo-browser server is running.`);
        // Intentionally do not exit with failure (treat as graceful no-op)
        return; // Leave process alive doing nothing (no listener); could alternatively process.exit(0)
    }
    console.error('Server failed to start:', err);
    process.exit(1);
});
