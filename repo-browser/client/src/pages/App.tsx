import React, { useEffect, useMemo, useState, useRef } from 'react';
import { FaCopy, FaPaste, FaCheck } from 'react-icons/fa';
// helper imports (resolveDeployVersion removed -unused)
// @ts-expect-error media asset handled by bundler
import copyVideo from '../video/Copy.mp4';
import { Tooltip } from '../components/Tooltip';
import '../styles/buttons.css';
import '../css/App.css';
import { RepoList } from '../components/RepoList';
import { ProgressList, RepoProgress } from '../components/ProgressList';
import { Settings } from '../components/Settings';
import { detectApiBase } from '../api';
import ignoreDefaults from '../IgnoreFolders.json';
import { clearResolutionCache, resolveDeployVersion } from '../lib/deployMapping';
// Simple polling log viewer for server debug lines
// Removed client File System Access handling; using server-managed base paths only.

export const App: React.FC = () => {
  // --- State and constants (define only once) ---
  const SECOND_BASE = 'C:/AMPT_DEV/TRMC_MODULE';
  const DEFAULT_DEPLOY_PATH = 'C:/OPT/jboss-eap-8.0.5/standalone/deployments';
  const [progress, setProgress] = useState<RepoProgress[]>([]);
  const [repos, setRepos] = useState<string[]>([]);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [loading, _setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignore, _setIgnore] = useState<Set<string>>(new Set((ignoreDefaults as string[]).map(i => i.toLowerCase())));
  const [firstBasePath, setFirstBasePath] = useState<string | null>(null);
  const [firstBaseRepoNames, setFirstBaseRepoNames] = useState<Set<string>>(new Set());
  const [secondBaseRepoNames, _setSecondBaseRepoNames] = useState<Set<string>>(new Set());
  // second base debug snapshot removed (unused)
  const [deployVersions, setDeployVersions] = useState<Record<string, string>>({});
  const [deployScanError, setDeployScanError] = useState<string | null>(null);
  const [deploymentFolderPath, setDeploymentFolderPath] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem('deploymentFolderPath');
      return saved || DEFAULT_DEPLOY_PATH;
    } catch {
      return DEFAULT_DEPLOY_PATH;
    }
  });
  const [showLogs, setShowLogs] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  // Per-repo logs for current versioning run
  const [repoLogs, setRepoLogs] = useState<Record<string, string[]>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showHelpVideo, setShowHelpVideo] = useState(false);
  const [filter, setFilter] = useState('');
  const [filterNames, setFilterNames] = useState<string[] | null>(null);
  const [filterTargetVersions, setFilterTargetVersions] = useState<Record<string, string>>({});
  const [missingVersions, setMissingVersions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [_probing, setProbing] = useState(false);
  // prevFilterSig and deploying removed (unused)
  const _prevFilterSig = useRef<string | null>(null);
  // Debug response storage removed (unused)

  // Add state for branch names and showBranchNames checkbox
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [showBranchNames, setShowBranchNames] = useState(true);
  const [copiedPathAt, setCopiedPathAt] = useState<number>(0);
  // Track current EventSource to close before starting a new run
  const currentSseRef = useRef<EventSource | null>(null);
  // Track last processed stdout/stderr lengths per repo+step to avoid duplicate log ingestion
  const stdoutOffsetsRef = useRef<Record<string, number>>({});
  const stderrOffsetsRef = useRef<Record<string, number>>({});
  // Track last progress event time for stall detection
  const lastEventAtRef = useRef<number>(0);
  const stallWarnedRef = useRef<Record<string, boolean>>({}); // key: repo::step
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      // If more than 30000ms without events on a running step, append a warning once
      setProgress(prev => {
        const next = prev.map(p => ({ ...p }));
        for (const rp of next) {
          for (const st of rp.steps) {
            if (st.status === 'running') {
              const key = `${rp.repo}::${st.label}`;
              if (!stallWarnedRef.current[key] && lastEventAtRef.current && (now - lastEventAtRef.current) > 30000) {
                // Append warning to repo log
                setRepoLogs(pr => {
                  const r = { ...pr };
                  if (!r[rp.repo]) r[rp.repo] = [];
                  r[rp.repo] = [...r[rp.repo], `${ts()} (No output for 30s while '${st.label}' running — still waiting...)`];
                  return r;
                });
                stallWarnedRef.current[key] = true;
              }
            }
          }
        }
        return next;
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Format timestamp like [9:30:23]
  function ts(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `[${hh}:${mm}:${ss}.${ms}]`;
  }

  // Fetch repo list and versions when apiBase or firstBasePath changes
  useEffect(() => {
    if (!apiBase || !firstBasePath) return;
    let cancelled = false;
    (async () => {
      try {
        // Fetch repo list (include ?versions to get version info)
        const r = await fetch(`${apiBase}/api/repos?base=${encodeURIComponent(firstBasePath)}&versions`);
        if (!r.ok) {
          const errMsg = `[App] /api/repos fetch failed: status ${r.status}`;
          setError(errMsg);
          console.error(errMsg);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        // Log the full response for debugging
        if (!data || typeof data !== 'object') {
          setError('[App] /api/repos: response is not an object');
          return;
        }
        if (!Array.isArray(data.repos)) {
          setError('[App] /api/repos: repos is not an array');
          console.error('[App] /api/repos: repos is not an array', data);
          return;
        }
        setRepos(data.repos);
        setVersions(data.versions || {});
        setError(null);
      } catch (e: unknown) {
        let msg: string;
        if (typeof e === 'object' && e !== null && 'message' in e) {
          const m = (e as { message: unknown }).message;
          msg = typeof m === 'string' ? m : String(m);
        } else {
          msg = String(e);
        }
        setError(`[App] fetch error: ${msg}`);
        console.error('[App] fetch error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, firstBasePath]);
  // Fetch settings and set firstBasePath, firstBaseRepoNames, and apiBase on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProbing(true);
      const base = await detectApiBase();
      if (cancelled) return;
      setApiBase(base);
      setProbing(false);
      // Fetch settings to know first base path and its repos
      try {
        const s = await fetch(`${base}/api/settings`);
        if (s.ok) {
          const sj = await s.json();
          if (Array.isArray(sj.basePaths) && sj.basePaths.length > 0) {
            setFirstBasePath(sj.basePaths[0]);
            try {
              const fr = await fetch(`${base}/api/folders?base=${encodeURIComponent(sj.basePaths[0])}`);
              if (fr.ok) {
                const fd = await fr.json();
                if (Array.isArray(fd.folders)) {
                  setFirstBaseRepoNames(new Set(fd.folders.map((n: string) => n.toLowerCase())));
                }
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Scan deployment folder for deployed versions (.war files) whenever path changes
  useEffect(() => {
    let cancelled = false;
    async function scan(withDelay: boolean) {
      setDeployScanError(null);
      // Clear any cached repo->deployed-name resolutions so UI will re-resolve
      // names against the fresh scan results.
      clearResolutionCache();
      setDeployVersions({});
      if (!deploymentFolderPath) return;
      if (withDelay) await new Promise(res => setTimeout(res, 2000));
      try {
        // Scanning for deployed versions
        const base = apiBase || await detectApiBase();
        const r = await fetch(`${base}/api/deploy/versions?path=${encodeURIComponent(deploymentFolderPath)}`);
        if (!r.ok) {
          setDeployScanError(`status ${r.status}`);
          // Deploy scan error; status logged silently in UI
          return;
        }
        const data = await r.json();
        if (!cancelled && data && data.versions) {
          // Clear cached resolutions so the UI re-resolves deployed versions
          clearResolutionCache();
          setDeployVersions(data.versions);
          // Deployed versions updated
        }
      } catch (e: unknown) {
        let msg: string;
        if (typeof e === 'object' && e !== null && 'message' in e) {
          const m = (e as { message: unknown }).message;
          msg = typeof m === 'string' ? m : String(m);
        } else {
          msg = String(e);
        }
        if (!cancelled) setDeployScanError(msg || 'scan failed');
        // Deploy scan exception
      }
    }
    // Only delay if deployRefreshKey changed
    if (repos.length > 0) {
      scan(true);
      // Trigger a second scan after another 2 seconds to catch late updates
      setTimeout(() => {
        if (!cancelled) scan(false);
      }, 2000);
    } else {
      scan(false);
    }
    return () => { cancelled = true; };
  }, [deploymentFolderPath, apiBase, repos]);

  // Poll server debug log endpoint when visible
  useEffect(() => {
    if (!showLogs || !apiBase) return;
    let stopped = false;
    async function poll() {
      while (!stopped) {
        try {
          const r = await fetch(`${apiBase}/api/debug/log?since=${encodeURIComponent(String(Date.now() - 5 * 60 * 1000))}`);
          if (r.status === 404) {
            // Endpoint not available on server (older version); stop polling quietly.
            stopped = true;
            console.warn('Debug log endpoint not found (404); stopping log polling.');
            continue;
          }
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.lines)) {
              setLogLines(prev => {
                const merged = [...prev, ...data.lines];
                // Deduplicate consecutive identical lines & cap size
                const filtered: string[] = [];
                for (const line of merged) {
                  if (filtered.length === 0 || filtered[filtered.length - 1] !== line) filtered.push(line);
                }
                return filtered.slice(-500);
              });
            }
          }
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    poll();
    return () => { stopped = true; };
  }, [showLogs, apiBase]);

  // Removed effect that restored client-picked directory.

  const filtered = useMemo(() => {
    if (filterNames && filterNames.length) {
      const set = new Set(filterNames.map(s => s.toLowerCase()));
      return repos.filter(r => {
        const low = r.toLowerCase();
        // Never ignore if present in second base
        if (secondBaseRepoNames.has(low)) return set.has(low);
        // Only apply ignore if this repo exists ONLY in first base (not also in second base)
        if (ignore.has(low) && firstBaseRepoNames.has(low)) return false;
        return set.has(low);
      });
    }
    const f = filter.toLowerCase();
    return repos.filter(r => {
      const low = r.toLowerCase();
      // Never ignore if present in second base
      if (secondBaseRepoNames.has(low)) return f ? low.includes(f) : true;
      if (ignore.has(low) && firstBaseRepoNames.has(low)) return false;
      return f ? low.includes(f) : true;
    });
  }, [repos, filter, filterNames, ignore, firstBaseRepoNames, secondBaseRepoNames]);


  function parseFilterInput(raw: string) {
    setFilter(raw);
    const rawLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const versionRegex = /\b\d+\.\d+\.\d+\b/; // basic semver pattern
    const missing: string[] = [];
    const targetVersions: Record<string, string> = {};
    for (const line of rawLines) {
      if (!line) continue;
      if (!versionRegex.test(line)) {
        missing.push(line); // any line without a version pattern counts as missing
      } else {
        // Capture first version occurrence
        const verMatch = line.match(versionRegex);
        if (verMatch) {
          // repo name assumed to be first whitespace-delimited token
          const repoName = line.split(/\s+/)[0];
          if (repoName) targetVersions[repoName] = verMatch[0];
        }
      }
    }
    setDeploymentFolderPath(DEFAULT_DEPLOY_PATH);
    window.localStorage.setItem('deploymentFolderPath', DEFAULT_DEPLOY_PATH);
    setMissingVersions(missing);
    // Only include lines that had versions
    const withVersions = rawLines.filter(l => !missing.includes(l));
    const processed = withVersions.map(l => l.replace(/\s+\(.+\)$/, '').replace(/,.*/, ''));
    const names = processed.map(l => l.split(/\s+/)[0]).filter(Boolean);
    if (names.length) {
      setFilterNames(names);
      setFilterTargetVersions(targetVersions);
      // Compute filtered list locally to avoid async state issues
      const setLower = new Set(names.map(s => s.toLowerCase()));
      const filteredRepos = repos.filter(r => {
        const low = r.toLowerCase();
        if (secondBaseRepoNames.has(low)) return setLower.has(low);
        if (ignore.has(low) && firstBaseRepoNames.has(low)) return false;
        return setLower.has(low);
      });
      // Custom selection logic: checked if deployed version != target upgrade version
      const newSelected = new Set<string>();
      // Use resolveDeployVersion for deployed version comparison
      // Import at top: import { resolveDeployVersion } from '../lib/deployMapping';
      for (const repo of filteredRepos) {
        const targetVer = targetVersions[repo] || targetVersions[repo.toLowerCase()];
        const deployedVer = resolveDeployVersion(repo, deployVersions);
        if (!targetVer || !deployedVer || deployedVer !== targetVer) {
          newSelected.add(repo);
        }
      }
      setSelected(newSelected);
    } else {
      setFilterNames(null);
      setFilterTargetVersions({});
      setSelected(new Set());
    }
  }

  function toggle(repo: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo); else next.add(repo);
      return next;
    });
  }

  function setAll(val: boolean) {
    if (val) setSelected(new Set(filtered)); else setSelected(new Set());
  }

  // Fetch branch names for each repo at startup
  useEffect(() => {
    if (!apiBase || !firstBasePath || repos.length === 0) return;
    let cancelled = false;
    let stopped = false;
    (async () => {
      try {
        // Fetch branch names for first base
        const r1 = await fetch(`${apiBase}/api/debug/base?path=${encodeURIComponent(firstBasePath.replace(/\\/g, '/'))}`);
        let branches: Record<string, string> = {};
        if (r1.ok) {
          const data1 = await r1.json();
          if (data1 && data1.branchNames) {
            branches = { ...data1.branchNames };
          }
        }
        // Special case: opt-soa from second base
        const optSoaRepo = 'opt-soa';
        if (repos.includes(optSoaRepo)) {
          const secondBase = 'C:/AMPT_DEV/TRMC_MODULE';
          const r2 = await fetch(`${apiBase}/api/debug/base?path=${encodeURIComponent(secondBase)}`);
          if (r2.ok) {
            const data2 = await r2.json();
            if (data2 && data2.branchNames && typeof data2.branchNames[optSoaRepo] === 'string') {
              branches[optSoaRepo] = data2.branchNames[optSoaRepo];
            }
          }
        }
        // branchNames and repo list fetched
        if (!cancelled) setBranchNames(branches);
      } catch (e) {
        // Error fetching branchNames for base
      }
    })();
    return () => { cancelled = true; stopped = true; };
  }, [apiBase, firstBasePath, repos]);

  return (
    <>
      <header className="app-header">
        <div>
          <h1 className="app-title">Local Repositories</h1>
          <small className="app-small app-small-path">
            opt-soa Path: {SECOND_BASE}
          </small>
          <small className="app-small">
            <span className="app-label">Repository Path:</span>
            {firstBasePath ? (
              <a
                href="#settings"
                className="repo-path-link"
                onClick={(e) => { e.preventDefault(); setShowSettings(true); }}
              >{firstBasePath}</a>
            ) : <span className="app-small app-small-path">Loading...</span>}
          </small>
          <small className="app-small">
            <span className="app-label">Deployment Folder Path:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Tooltip content={`Deployment Folder\n${deploymentFolderPath}`} forceShow={false}>
                <input
                  type="text"
                  value={deploymentFolderPath}
                  onChange={e => {
                    setDeploymentFolderPath(e.target.value);
                    window.localStorage.setItem('deploymentFolderPath', e.target.value);
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onMouseUp={(e) => e.preventDefault()}
                  title={deploymentFolderPath}
                  style={{
                    width: '32em',
                    maxWidth: '100%',
                    marginRight: '0.5em',
                    fontSize: '0.95em',
                    padding: '2px 6px',
                    backgroundColor: '#181f2a',
                    color: '#e0e6ef',
                    border: '1px solid #2d3642',
                    borderRadius: 4
                  }}
                  placeholder={DEFAULT_DEPLOY_PATH}
                />
              </Tooltip>
              <Tooltip content={'Paste clipboard path into Deployment Folder input'} forceShow={false}>
                <button
                  type="button"
                  title="Paste path from clipboard"
                  aria-label="Paste deployment path from clipboard"
                  className="btn btn-icon"
                  onClick={async () => {
                    try {
                      const txt = await navigator.clipboard.readText();
                      if (txt) {
                        setDeploymentFolderPath(txt);
                        window.localStorage.setItem('deploymentFolderPath', txt);
                        setCopiedPathAt(Date.now()); // reuse timestamp state for success flash
                      }
                    } catch { /* ignore */ }
                  }}
                >{Date.now() - copiedPathAt < 2000 ? <FaCheck aria-hidden /> : <FaPaste aria-hidden />}</button>
              </Tooltip>
            </span>
          </small>
        </div>
        <button
          type="button"
          title="Toggle Debug Logs"
          aria-label="Toggle Debug Logs"
          className={`btn btn-icon ${showLogs ? 'is-active' : ''}`}
          onClick={() => setShowLogs(s => !s)}
        >🪵</button>
      </header>
      <main>
        {showHelpVideo && (
          <div className="help-video-overlay" onClick={() => setShowHelpVideo(false)}>
            <div className="help-video-modal" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowHelpVideo(false)} className="help-video-close" aria-label="Close video">×</button>
              <h3 className="help-video-title">How to Copy & Paste Release List</h3>
              <video src={copyVideo} controls autoPlay className="help-video-player" />
            </div>
          </div>
        )}
        {showSettings ? (
          <div className="settings-modal">
            <Settings onClose={() => setShowSettings(false)} onUpdated={() => setShowSettings(false)} />
          </div>
        ) : (
          <>
            <div className="main-content-row">
              {/* Left Column (filter + repo list) */}
              <div className="main-content-left">
                <div className="main-content-filter">
                  Filter by pasting repo names &amp; versions from <a href="https://www.trmc.osd.mil/wiki/pages/viewpage.action?spaceKey=MINERVA&title=AMPT+Releases" target="_blank" rel="noopener noreferrer" className="release-link">AMPT Latest Release</a>{' '}
                  <button
                    type="button"
                    onClick={() => setShowHelpVideo(true)}
                    className="help-video-btn"
                    title="Play help video"
                  >(See video)</button>
                </div>
                <div className="main-content-filter-row">
                  <textarea
                    className={"repo-textarea" + (missingVersions.length ? ' repo-textarea-error' : '')}
                    placeholder={"Paste repo list (will match names). Example:\nopt-log-summary\t2.15.0\nopt-ribbon\t4.8.0\nopt-gui\t4.14.0\nopt-plansmanager\t4.17.0\nonr-transit\t4.9.0 (deploy quarkus-app to: C:/OPT/quarkus-ots)\nopt-soa\t4.9.0"}
                    value={filter}
                    onChange={e => parseFilterInput(e.target.value)}
                    onPaste={e => {
                      e.preventDefault();
                      const txt = e.clipboardData?.getData('text');
                      if (txt) parseFilterInput(txt);
                    }}
                    rows={showLogs ? 18 : 10}
                  />
                  <div className="repo-textarea-btns">
                    <button
                      className="btn btn-secondary btn-full"
                      title="Paste clipboard text into filter"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard.readText();
                          if (txt) parseFilterInput(txt);
                        } catch { /* ignore clipboard errors (permissions, etc.) */ }
                      }}
                    ><FaPaste aria-hidden style={{ marginRight: 6, position: 'relative', top: 1 }} />Paste</button>
                    <button className="btn btn-outline btn-full" onClick={() => { setFilter(''); setFilterNames(null); setMissingVersions([]); setDeploymentFolderPath(DEFAULT_DEPLOY_PATH); setSelected(new Set()); }}>Reset Filter</button>
                  </div>
                </div>
                <div className="repo-legend-row">
                  <span className="repo-legend-item">
                    <span className="repo-legend-dot deployed-version" />
                    <span>Deployed version (.war)</span>
                  </span>
                  <span className="repo-legend-item">
                    <span className="repo-legend-dot repo-version" />
                    <span>Repo version (fallback)</span>
                  </span>
                  <span className="repo-legend-item">
                    <span className="repo-legend-dot target-version" />
                    <span>Target upgrade version</span>
                  </span>
                  <span className="repo-legend-item">
                    <span className="repo-legend-dot no-upgrade" />
                    <span>No upgrade (equal/older)</span>
                  </span>
                  <label style={{ marginLeft: '1.5rem', fontWeight: 500 }}>
                    <input type="checkbox" checked={showBranchNames} onChange={e => setShowBranchNames(e.target.checked)} /> Display Current Branch in Local Repo
                  </label>
                </div>
                {missingVersions.length > 0 && (
                  <div className="repo-missing-versions">
                    {missingVersions.length === 1 ? 'Line missing version:' : 'Lines missing versions:'} {missingVersions.slice(0, 5).join(', ')}{missingVersions.length > 5 ? '…' : ''}
                  </div>
                )}
                {loading && <p>Loading...</p>}
                {error && <p className="repo-error">Error: {error}</p>}
                {!loading && !error && (
                  <div className="repo-progress-list">
                    {/* Always show progress if there are steps in progress */}
                    {progress.length > 0 && (
                      <ProgressList progress={progress} repoLogs={repoLogs} />
                    )}
                    <RepoList
                      repos={filtered}
                      selected={selected}
                      toggle={toggle}
                      versions={versions}
                      targetVersions={filterTargetVersions}
                      deployVersions={deployVersions}
                      showBothVersions
                      branchNames={branchNames}
                      showBranchNames={showBranchNames}
                    />
                    {deployScanError && (
                      <div className="repo-deploy-error">Deploy scan error: {deployScanError}</div>
                    )}
                    <div className="repo-versioning-btns-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '2.5rem' }}>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={() => setAll(true)}>Select All</button>
                        <button className="btn btn-secondary" onClick={() => setAll(false)}>Select None</button>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <Tooltip
                          content={'Versioning\n\nChecks out master (or main/develop for special repos), builds, and deploys the selected repos.\nUse this for full release workflow.'}
                          forceShow={false}
                        >
                          <button
                            className="btn btn-secondary"
                            style={{ marginRight: '0.75rem' }}
                            disabled={selected.size === 0}
                            onClick={async () => {
                              try {
                                const base = apiBase || await detectApiBase();
                                const chosen = Array.from(selected);
                                if (!chosen.length) return;
                                // Order by current visible list order (fallback to full repos list)
                                const listOrder = (filtered && filtered.length ? filtered : repos);
                                const orderedChosen = [...chosen].sort((a, b) => listOrder.indexOf(a) - listOrder.indexOf(b));
                                const firstRepo = orderedChosen[0];
                                // Initialize progress state and clear per-repo logs
                                setProgress(orderedChosen.map(repo => ({
                                  repo,
                                  steps: [
                                    { label: 'Checkout master', status: 'pending' },
                                    { label: 'Build', status: 'pending' },
                                    { label: 'Deploy WAR', status: 'pending' },
                                  ]
                                })));
                                setRepoLogs({});
                                // Pre-mark only the first repo's first step as running
                                setProgress(prev => prev.map(p => p.repo === firstRepo ? ({
                                  ...p,
                                  steps: p.steps.map((s, i) => i === 0 ? { ...s, status: 'running' } : s)
                                }) : p));
                                // Start SSE for real-time progress
                                let stopped = false;
                                if (currentSseRef.current) { try { currentSseRef.current.close(); } catch { /* ignore */ } }
                                const eventSource = new window.EventSource(`${base}/api/versioning/progress`);
                                currentSseRef.current = eventSource;
                                eventSource.onmessage = (event) => {
                                  try {
                                    const data = JSON.parse(event.data);
                                    if (!data || !data.repo || !data.step) return;
                                    setProgress(prev => prev.map(p => {
                                      if (p.repo !== data.repo) return p;
                                      const steps = p.steps.map(s => {
                                        // Accept both 'Deploy WAR' and 'Deploy WAR(s)' as valid step labels
                                        const stepMatch = (s.label === data.step) ||
                                          (s.label === 'Deploy WAR' && data.step === 'Deploy WAR(s)') ||
                                          (s.label === 'Deploy WAR(s)' && data.step === 'Deploy WAR');
                                        if (stepMatch) {
                                          return {
                                            ...s,
                                            status: data.status || s.status,
                                            detail: data.detail || s.detail,
                                            stdout: data.stdout || s.stdout,
                                            stderr: data.stderr || s.stderr,
                                            warPath: data.warPath || s.warPath,
                                            branch: data.branch || s.branch,
                                          };
                                        }
                                        return s;
                                      });
                                      // Attach extra info at top level for ProgressList
                                      return {
                                        ...p,
                                        steps,
                                        branch: data.branch || p.branch,
                                        stdout: data.stdout || p.stdout,
                                        stderr: data.stderr || p.stderr,
                                        warPath: data.warPath || p.warPath,
                                        deployError: data.detail || p.deployError
                                      };
                                    }));
                                    // Add log lines for stdout/stderr to both global and per-repo logs
                                    // Only append new log lines for real-time build output
                                    const canonicalStep = data.step === 'Deploy WAR(s)' ? 'Deploy WAR' : data.step;
                                    if (data.stdout) {
                                      const key = `${data.repo}::${canonicalStep}::stdout`;
                                      const prevOffset = stdoutOffsetsRef.current[key] || 0;
                                      if (data.stdout.length < prevOffset) {
                                        // Reset (backend may have restarted)
                                        stdoutOffsetsRef.current[key] = 0;
                                      }
                                      if (data.stdout.length > (stdoutOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stdout.slice(stdoutOffsetsRef.current[key] || 0);
                                        stdoutOffsetsRef.current[key] = data.stdout.length;
                                        let newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) {
                                            if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl);
                                          }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev };
                                          if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) {
                                            if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl);
                                          }
                                          return r;
                                        });
                                      }
                                    }
                                    if (data.stderr) {
                                      const key = `${data.repo}::${canonicalStep}::stderr`;
                                      const prevOffset = stderrOffsetsRef.current[key] || 0;
                                      if (data.stderr.length < prevOffset) {
                                        stderrOffsetsRef.current[key] = 0;
                                      }
                                      if (data.stderr.length > (stderrOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stderr.slice(stderrOffsetsRef.current[key] || 0);
                                        stderrOffsetsRef.current[key] = data.stderr.length;
                                        let newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) {
                                            if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl);
                                          }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev };
                                          if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) {
                                            if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl);
                                          }
                                          return r;
                                        });
                                      }
                                    }
                                  } catch (e) {
                                    // Error parsing SSE data
                                  }
                                  // Auto-advance: if a repo just finished all steps, start next pending repo
                                  setProgress(prev => {
                                    // Find completed repos and next pending
                                    const next = [...prev];
                                    for (let i = 0; i < next.length; i++) {
                                      const rp = next[i];
                                      const allDone = rp.steps.every(s => s.status === 'success');
                                      if (allDone && !rp._advanced) {
                                        (rp as any)._advanced = true; // mark so we don't re-trigger
                                        // find next repo with all steps pending
                                        for (let j = i + 1; j < next.length; j++) {
                                          const nr = next[j];
                                          const hasRunning = nr.steps.some(s => s.status === 'running');
                                          if (!hasRunning && nr.steps.every(s => s.status === 'pending')) {
                                            nr.steps[0].status = 'running';
                                            break;
                                          }
                                        }
                                      }
                                    }
                                    return next;
                                  });
                                };
                                eventSource.onerror = (err) => {
                                  // SSE error
                                  stopped = true;
                                };
                                // Close SSE when all repos completed
                                const maybeClose = () => {
                                  setProgress(prev => {
                                    const allDone = prev.length > 0 && prev.every(p => p.steps.every(s => s.status === 'success' || s.status === 'error'));
                                    if (allDone && !stopped) {
                                      stopped = true;
                                      try { eventSource.close(); } catch { /* ignore */ }
                                    }
                                    return prev;
                                  });
                                };
                                eventSource.onmessage = (event) => {
                                  lastEventAtRef.current = Date.now();
                                  try {
                                    const data = JSON.parse(event.data);
                                    if (!data || !data.repo || !data.step) return;
                                    setProgress(prev => prev.map(p => {
                                      if (p.repo !== data.repo) return p;
                                      const steps = p.steps.map(s => {
                                        // Accept both 'Deploy WAR' and 'Deploy WAR(s)' as valid step labels
                                        const stepMatch = (s.label === data.step) ||
                                          (s.label === 'Deploy WAR' && data.step === 'Deploy WAR(s)') ||
                                          (s.label === 'Deploy WAR(s)' && data.step === 'Deploy WAR');
                                        if (stepMatch) {
                                          return {
                                            ...s,
                                            status: data.status || s.status,
                                            detail: data.detail || s.detail,
                                            stdout: data.stdout || s.stdout,
                                            stderr: data.stderr || s.stderr,
                                            warPath: data.warPath || s.warPath,
                                            branch: data.branch || s.branch,
                                          };
                                        }
                                        return s;
                                      });
                                      return {
                                        ...p,
                                        steps,
                                        branch: data.branch || p.branch,
                                        stdout: data.stdout || p.stdout,
                                        stderr: data.stderr || p.stderr,
                                        warPath: data.warPath || p.warPath,
                                        deployError: data.detail || p.deployError
                                      };
                                    }));
                                    // Add log lines for stdout/stderr to both global and per-repo logs
                                    // Only append new log lines for real-time build output
                                    const canonicalStep = data.step === 'Deploy WAR(s)' ? 'Deploy WAR' : data.step;
                                    if (data.stdout) {
                                      const key = `${data.repo}::${canonicalStep}::stdout`;
                                      const prevOffset = stdoutOffsetsRef.current[key] || 0;
                                      if (data.stdout.length < prevOffset) stdoutOffsetsRef.current[key] = 0;
                                      if (data.stdout.length > (stdoutOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stdout.slice(stdoutOffsetsRef.current[key] || 0);
                                        stdoutOffsetsRef.current[key] = data.stdout.length;
                                        const newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) { if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl); }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev }; if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) { if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl); }
                                          return r;
                                        });
                                      }
                                    }
                                    if (data.stderr) {
                                      const key = `${data.repo}::${canonicalStep}::stderr`;
                                      const prevOffset = stderrOffsetsRef.current[key] || 0;
                                      if (data.stderr.length < prevOffset) stderrOffsetsRef.current[key] = 0;
                                      if (data.stderr.length > (stderrOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stderr.slice(stderrOffsetsRef.current[key] || 0);
                                        stderrOffsetsRef.current[key] = data.stderr.length;
                                        const newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) { if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl); }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev }; if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) { if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl); }
                                          return r;
                                        });
                                      }
                                    }
                                  } catch { /* ignore parse errors */ }
                                  // Auto-advance logic retained below
                                  setProgress(prev => {
                                    const next = [...prev];
                                    for (let i = 0; i < next.length; i++) {
                                      const rp = next[i];
                                      const allDone = rp.steps.every(s => s.status === 'success');
                                      if (allDone && !rp._advanced) {
                                        (rp as any)._advanced = true; // mark so we don't re-trigger
                                        for (let j = i + 1; j < next.length; j++) {
                                          const nr = next[j];
                                          const hasRunning = nr.steps.some(s => s.status === 'running');
                                          if (!hasRunning && nr.steps.every(s => s.status === 'pending')) {
                                            nr.steps[0].status = 'running';
                                            break;
                                          }
                                        }
                                      }
                                    }
                                    return next;
                                  });
                                  maybeClose();
                                };
                                // Trigger backend versioning with ordered repositories
                                fetch(`${base}/api/versioning/start`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ repos: orderedChosen, deploymentFolderPath }),
                                }).catch(() => { /* versioning request error */ });
                              } catch (e) {
                                // Versioning start error
                              }
                            }}
                          >Start Versioning</button>
                        </Tooltip>
                        <Tooltip
                          content={'Build & Deploy\n\nBuilds and deploys selected repos without changing branches.\nUse this for quick redeploys or hotfixes.'}
                          forceShow={false}
                        >
                          <button
                            className="btn btn-primary"
                            disabled={selected.size === 0}
                            onClick={async () => {
                              try {
                                const base = apiBase || await detectApiBase();
                                const chosen = Array.from(selected);
                                if (!chosen.length) return;
                                // Order by current visible list order (fallback to full repos list)
                                const listOrder = (filtered && filtered.length ? filtered : repos);
                                const orderedChosen = [...chosen].sort((a, b) => listOrder.indexOf(a) - listOrder.indexOf(b));
                                const firstRepo = orderedChosen[0];
                                // Initialize progress state and clear per-repo logs BEFORE backend request
                                setProgress(orderedChosen.map(repo => ({
                                  repo,
                                  steps: [
                                    { label: 'Build', status: 'pending' },
                                    { label: 'Deploy WAR', status: 'pending' },
                                  ],
                                  statusIcon: undefined
                                })));
                                // Pre-mark first step as running and seed log so UI shows immediately
                                setProgress(prev => prev.map(p => p.repo === firstRepo ? {
                                  ...p,
                                  steps: p.steps.map(s => s.label === 'Build' ? { ...s, status: 'running' } : s)
                                } : p));
                                setRepoLogs(firstRepo ? { [firstRepo]: [`${ts()} Starting build...`] } : {});
                                // Start SSE for real-time progress (before triggering backend)
                                let stopped = false;
                                if (currentSseRef.current) { try { currentSseRef.current.close(); } catch { /* ignore */ } }
                                const eventSource = new window.EventSource(`${base}/api/versioning/progress?mode=build-deploy`);
                                currentSseRef.current = eventSource;
                                eventSource.onmessage = (event) => {
                                  lastEventAtRef.current = Date.now();
                                  try {
                                    const data = JSON.parse(event.data);
                                    // Build & Deploy SSE event
                                    if (!data || !data.repo || !data.step) return;
                                    setProgress(prev => prev.map(p => {
                                      if (p.repo !== data.repo) return p;
                                      const steps = p.steps.map(s => {
                                        const stepMatch = (s.label === data.step) ||
                                          (s.label === 'Deploy WAR' && data.step === 'Deploy WAR(s)') ||
                                          (s.label === 'Deploy WAR(s)' && data.step === 'Deploy WAR');
                                        if (stepMatch) {
                                          return {
                                            ...s,
                                            status: data.status || s.status,
                                            detail: data.detail || s.detail,
                                            stdout: data.stdout || s.stdout,
                                            stderr: data.stderr || s.stderr,
                                            warPath: data.warPath || s.warPath,
                                            branch: data.branch || s.branch,
                                          };
                                        }
                                        return s;
                                      });
                                      return {
                                        ...p,
                                        steps,
                                        branch: data.branch || p.branch,
                                        stdout: data.stdout || p.stdout,
                                        stderr: data.stderr || p.stderr,
                                        warPath: data.warPath || p.warPath,
                                        deployError: data.detail || p.deployError,
                                        statusIcon: data.statusIcon !== undefined ? data.statusIcon : p.statusIcon
                                      };
                                    }));
                                    // Add log lines for stdout/stderr to both global and per-repo logs
                                    // Only append new log lines for real-time build output
                                    const canonicalStepBD = data.step === 'Deploy WAR(s)' ? 'Deploy WAR' : data.step;
                                    if (data.stdout) {
                                      const key = `${data.repo}::${canonicalStepBD}::stdout`;
                                      if (data.stdout.length < (stdoutOffsetsRef.current[key] || 0)) stdoutOffsetsRef.current[key] = 0;
                                      if (data.stdout.length > (stdoutOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stdout.slice(stdoutOffsetsRef.current[key] || 0);
                                        stdoutOffsetsRef.current[key] = data.stdout.length;
                                        const newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) {
                                            if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl);
                                          }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev };
                                          if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) {
                                            if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl);
                                          }
                                          return r;
                                        });
                                      }
                                    }
                                    if (data.stderr) {
                                      const key = `${data.repo}::${canonicalStepBD}::stderr`;
                                      if (data.stderr.length < (stderrOffsetsRef.current[key] || 0)) stderrOffsetsRef.current[key] = 0;
                                      if (data.stderr.length > (stderrOffsetsRef.current[key] || 0)) {
                                        const newPart = data.stderr.slice(stderrOffsetsRef.current[key] || 0);
                                        stderrOffsetsRef.current[key] = data.stderr.length;
                                        const newLines = newPart.split(/\r?\n/).filter(Boolean).map((l: string) => `${ts()} ${l}`);
                                        setLogLines(prev => {
                                          const merged = [...prev];
                                          for (const nl of newLines) {
                                            if (merged.length === 0 || merged[merged.length - 1] !== nl) merged.push(nl);
                                          }
                                          return merged;
                                        });
                                        setRepoLogs(prev => {
                                          const r = { ...prev };
                                          if (!r[data.repo]) r[data.repo] = [];
                                          const existing = r[data.repo];
                                          for (const nl of newLines) {
                                            if (existing.length === 0 || existing[existing.length - 1] !== nl) existing.push(nl);
                                          }
                                          return r;
                                        });
                                      }
                                    }
                                  } catch (e) {
                                    // Error parsing SSE data
                                  }
                                  // Auto-advance for Build & Deploy
                                  setProgress(prev => {
                                    const next = [...prev];
                                    for (let i = 0; i < next.length; i++) {
                                      const rp = next[i];
                                      const allDone = rp.steps.every(s => s.status === 'success');
                                      if (allDone && !rp._advanced) {
                                        (rp as any)._advanced = true;
                                        for (let j = i + 1; j < next.length; j++) {
                                          const nr = next[j];
                                          const hasRunning = nr.steps.some(s => s.status === 'running');
                                          if (!hasRunning && nr.steps.every(s => s.status === 'pending')) {
                                            nr.steps[0].status = 'running';
                                            break;
                                          }
                                        }
                                      }
                                    }
                                    return next;
                                  });
                                };
                                eventSource.onerror = (err) => {
                                  // SSE error
                                  stopped = true;
                                };
                                // Auto close when all repos complete
                                const maybeCloseBD = () => {
                                  setProgress(prev => {
                                    const allDone = prev.length > 0 && prev.every(p => p.steps.every(s => s.status === 'success' || s.status === 'error'));
                                    if (allDone && !stopped) { stopped = true; try { eventSource.close(); } catch { /* ignore */ } }
                                    return prev;
                                  });
                                };
                                // Attach close check after each progress update
                                eventSource.addEventListener('message', () => maybeCloseBD());
                                // Trigger backend build & deploy (fire-and-forget)
                                fetch(`${base}/api/versioning/build-deploy`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ repos: orderedChosen, deployPath: deploymentFolderPath }),
                                }).catch(() => { /* build-deploy request error */ });
                              } catch (e) {
                                // Versioning start error
                              }
                            }}
                          >Build & Deploy</button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                )}
              </div> {/* main-content-left */}
            </div> {/* main-content-row */}
          </>
        )}
      </main>
    </>
  );
}
