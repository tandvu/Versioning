// Utility to detect the backend API base URL by probing sequential ports.
// Tries explicit environment override first (VITE_API_BASE), then sequential ports.

const DEFAULT_START = 5055;
const RANGE = 20; // inclusive range width (5055..5055+20)

async function probe(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD', signal });
    if (resp.ok) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function detectApiBase(): Promise<string> {
  // 1. Environment-provided base
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase) return envBase.replace(/\/$/, '');

  // 2. Same-origin heuristic (production build when served behind same host)
  if (!(import.meta as any).env?.DEV) {
    return window.location.origin; // assume reverse proxy or same host
  }

  // 3. Dev: probe sequential localhost ports
  const controller = new AbortController();
  for (let port = DEFAULT_START; port <= DEFAULT_START + RANGE; port++) {
    const base = `http://localhost:${port}`;
    const ok = await probe(`${base}/api/repos`, controller.signal); // HEAD is enough
    if (ok) return base;
  }
  // Fallback: default start even if unreachable (UI will show error later)
  return `http://localhost:${DEFAULT_START}`;
}
