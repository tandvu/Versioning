// Mapping logic between repository names and deployed WAR base names.
// Some repositories build WAR files whose deployed name differs from the repo name.
// Example provided: repo "opt-forces" -> war base name "ampt-forces".

export const WAR_NAME_MAP: Record<string, string> = {
  // Explicit examples / overrides. Extend this map as more mismatches are discovered.
  'opt-forces': 'ampt-forces'
};

// Simple in-memory cache so once a repo resolves we keep that association during the session.
const RESOLUTION_CACHE: Record<string, string | undefined> = {};

/**
 * Resolve the deployed version for a repo, considering direct match, explicit mapping,
 * and heuristic prefix substitutions (e.g., opt- -> ampt-).
 */
export function resolveDeployVersion(repo: string, deployVersions?: Record<string, string>): string | undefined {
  if (!deployVersions) return undefined;
  const cached = RESOLUTION_CACHE[repo];
  if (cached !== undefined) return cached;
  const keys = Object.keys(deployVersions);
  if (keys.length === 0) return undefined;
  const repoLc = repo.toLowerCase();
  const direct = deployVersions[repo] ?? deployVersions[repoLc];
  if (direct) {
    RESOLUTION_CACHE[repo] = direct;
    return direct;
  }
  // Explicit mapping
  const mapped = WAR_NAME_MAP[repo] || WAR_NAME_MAP[repoLc];
  if (mapped) {
    const m = deployVersions[mapped] ?? deployVersions[mapped.toLowerCase()];
    if (m) { RESOLUTION_CACHE[repo] = m; return m; }
  }
  // Generate candidate names
  const candidates: string[] = [];
  if (repo.startsWith('opt-')) candidates.push('ampt-' + repo.slice(4));
  // Also try dropping opt-/ampt- entirely
  const baseNoPrefix = repo.replace(/^(ampt-|opt-)/i, '');
  candidates.push(baseNoPrefix);
  // Normalization util: strip prefixes/suffixes, remove version tail if present
  const norm = (s: string) => s.toLowerCase()
    .replace(/\.war$/, '')
    .replace(/-(\d+\.\d+\.\d+).*$/, '')
    .replace(/^(ampt-|opt-)/, '')
    .replace(/-(service|web|app|war|ear)$/, '');
  const targetNorm = norm(repo);
  // Pass 1: candidate direct/ci
  for (const c of candidates) {
    const cv = deployVersions[c] ?? deployVersions[c.toLowerCase()];
    if (cv) { RESOLUTION_CACHE[repo] = cv; return cv; }
  }
  // Pass 2: normalized comparison
  for (const k of keys) {
    if (norm(k) === targetNorm) { RESOLUTION_CACHE[repo] = deployVersions[k]; return deployVersions[k]; }
  }
  // Pass 3: normalized vs candidates
  for (const c of candidates) {
    const cn = norm(c);
    for (const k of keys) {
      if (norm(k) === cn) { RESOLUTION_CACHE[repo] = deployVersions[k]; return deployVersions[k]; }
    }
  }
  // Fallback substring heuristic: find a unique key containing the normalized base
  const matches = keys.filter(k => {
    const nk = norm(k);
    return nk.includes(targetNorm) || targetNorm.includes(nk);
  });
  if (matches.length === 1) {
    const val = deployVersions[matches[0]];
    RESOLUTION_CACHE[repo] = val;
    return val;
  }
  RESOLUTION_CACHE[repo] = undefined;
  return undefined;
}

/** Clear the in-memory resolution cache. Call this when deployVersions changes so
 * previously cached (possibly undefined) resolutions are recomputed against the
 * new deployVersions object.
 */
export function clearResolutionCache() {
  for (const k of Object.keys(RESOLUTION_CACHE)) delete RESOLUTION_CACHE[k];
}
