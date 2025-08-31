import fs from 'fs';
import path from 'path';
const defaultConfig = {
    basePaths: [
        'C:/AMPT',
        'C:/AMPT_DEV/TRMC_MODULE'
    ],
    ignore: {
        'C:/AMPT': [
            '.git',
            'SOA',
            'datalayerp',
            'deps',
            'docs',
            'minerva',
            'quarkus',
            'react-d3-tree-example',
            'src',
            'staging',
            'tests',
            'organizational-chart-with-d3-js-expandable-zoomable'
        ]
    }
};
// Runtime config file (JSON) created/updated when user edits settings.
const runtimeConfigPath = path.resolve(process.cwd(), 'server', 'config.runtime.json');
function loadRuntime() {
    try {
        if (fs.existsSync(runtimeConfigPath)) {
            const raw = fs.readFileSync(runtimeConfigPath, 'utf8');
            return JSON.parse(raw);
        }
    }
    catch (e) {
        console.warn('Failed to load runtime config:', e);
    }
    return undefined;
}
function mergeConfig(base, override) {
    if (!override)
        return base;
    return {
        basePaths: Array.isArray(override.basePaths) ? override.basePaths : base.basePaths,
        ignore: override.ignore ? override.ignore : base.ignore
    };
}
export const config = mergeConfig(defaultConfig, loadRuntime());
export function updateConfig(newCfg) {
    // Mutate exported object to keep references alive
    config.basePaths.splice(0, config.basePaths.length, ...newCfg.basePaths);
    config.ignore = newCfg.ignore || {};
    try {
        fs.writeFileSync(runtimeConfigPath, JSON.stringify({
            basePaths: config.basePaths,
            ignore: config.ignore
        }, null, 2), 'utf8');
    }
    catch (e) {
        console.error('Failed to write runtime config:', e);
    }
}
export function getConfig() {
    return { basePaths: [...config.basePaths], ignore: config.ignore ? { ...config.ignore } : {} };
}
