import fs from 'fs';
import path from 'path';

export interface RepoConfig {
  basePaths: string[];
  /** Map of absolute base path -> set of folder names to ignore (exact match, case-insensitive). */
  ignore?: Record<string, string[]>;
}

const defaultConfig: RepoConfig = {
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
// process.cwd() when running workspace script (npm --workspace server) is already the server directory,
// so we write directly inside that directory (avoid duplicating '/server/server').
const runtimeConfigPath = path.resolve(process.cwd(), 'config.runtime.json');
console.log('[config] Runtime config path:', runtimeConfigPath);

function loadRuntime(): Partial<RepoConfig> | undefined {
  try {
    if (fs.existsSync(runtimeConfigPath)) {
      const raw = fs.readFileSync(runtimeConfigPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load runtime config:', e);
  }
  return undefined;
}

function mergeConfig(base: RepoConfig, override?: Partial<RepoConfig>): RepoConfig {
  if (!override) return base;
  return {
    basePaths: Array.isArray(override.basePaths) ? override.basePaths : base.basePaths,
    ignore: override.ignore ? override.ignore : base.ignore
  };
}

// Merge runtime overrides (if any); no forced reordering so first path (user selection) persists across restarts.
export const config: RepoConfig = mergeConfig(defaultConfig, loadRuntime());

export function updateConfig(newCfg: RepoConfig) {
  // Mutate exported object to keep references alive
  config.basePaths.splice(0, config.basePaths.length, ...newCfg.basePaths);
  config.ignore = newCfg.ignore || {};
  try {
    // Ensure directory exists (in case process.cwd changes in future)
    fs.mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
    fs.writeFileSync(runtimeConfigPath, JSON.stringify({
      basePaths: config.basePaths,
      ignore: config.ignore
    }, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write runtime config:', e);
  }
}

export function getConfig(): RepoConfig {
  return { basePaths: [...config.basePaths], ignore: config.ignore ? { ...config.ignore } : {} };
}
