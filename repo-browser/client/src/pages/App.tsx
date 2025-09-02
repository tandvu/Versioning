import React, { useEffect, useMemo, useState, useRef } from 'react';
import { resolveDeployVersion } from '../lib/deployMapping';
// @ts-ignore media asset handled by bundler
import copyVideo from '../video/Copy.mp4';
import '../styles/buttons.css';
import '../css/App.css';
import { RepoList } from '../components/RepoList';
import { ProgressList, RepoProgress } from '../components/ProgressList';
import { Settings } from '../components/Settings';
import { detectApiBase } from '../api';
import ignoreDefaults from '../IgnoreFolders.json';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignore, setIgnore] = useState<Set<string>>(new Set((ignoreDefaults as string[]).map(i => i.toLowerCase())));
  const [firstBasePath, setFirstBasePath] = useState<string | null>(null);
  const [firstBaseRepoNames, setFirstBaseRepoNames] = useState<Set<string>>(new Set());
  const [secondBaseRepoNames, setSecondBaseRepoNames] = useState<Set<string>>(new Set());
  const [secondBaseDebug, setSecondBaseDebug] = useState<any>(null);
  const [secondBaseDebugError, setSecondBaseDebugError] = useState<string | null>(null);
  const [deployVersions, setDeployVersions] = useState<Record<string, string>>({});
  const [deployScanError, setDeployScanError] = useState<string | null>(null);
  const [deploymentFolderPath, setDeploymentFolderPath] = useState<string>(DEFAULT_DEPLOY_PATH);
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
  const [probing, setProbing] = useState(false);
  const prevFilterSig = useRef('');
  const [deploying, setDeploying] = useState(false);
  const [deployRefreshKey, setDeployRefreshKey] = useState(0);
  // Debug: store last /api/repos response
  const [lastReposResponse, setLastReposResponse] = useState<any>(null);

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
        console.log('[App] /api/repos raw response:', data);
        setLastReposResponse(data); // Save for debug UI
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
        console.log('[App] repos:', data.repos);
        console.log('[App] versions:', data.versions || {});
      } catch (e) {
        setError(`[App] fetch error: ${e && (typeof e === 'object' && 'message' in e ? (e as any).message : String(e))}`);
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

  // ...existing code...

  // Scan deployment folder for deployed versions (.war files) whenever path changes
  useEffect(() => {
    let cancelled = false;
    async function scan(withDelay: boolean) {
      setDeployScanError(null);
      setDeployVersions({});
      if (!deploymentFolderPath) return;
      if (withDelay) await new Promise(res => setTimeout(res, 2000));
      try {
        console.log('[DEBUG] Scanning for deployed versions...');
        const base = apiBase || await detectApiBase();
        const r = await fetch(`${base}/api/deploy/versions?path=${encodeURIComponent(deploymentFolderPath)}`);
        if (!r.ok) {
          setDeployScanError(`status ${r.status}`);
          console.log('[DEBUG] Deploy scan error, status:', r.status);
          return;
        }
        const data = await r.json();
        if (!cancelled && data && data.versions) {
          setDeployVersions(data.versions);
          console.log('[DEBUG] Deployed versions updated:', data.versions);
        }
      } catch (e: any) {
        if (!cancelled) setDeployScanError(e?.message || 'scan failed');
        console.log('[DEBUG] Deploy scan exception:', e);
      }
    }
    // Only delay if deployRefreshKey changed
    if (deployRefreshKey > 0) {
      scan(true);
      // Trigger a second scan after another 2 seconds to catch late updates
      setTimeout(() => {
        if (!cancelled) scan(false);
      }, 2000);
    } else {
      scan(false);
    }
    return () => { cancelled = true; };
  }, [deploymentFolderPath, apiBase, deploying, deployRefreshKey]);

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
      setSelected(new Set(filteredRepos));
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
            <span>{DEFAULT_DEPLOY_PATH}</span>
            <button
              className="btn btn-outline btn-icon app-refresh-btn"
              title="Refresh deployed versions"
              onClick={() => setDeployRefreshKey(k => k + 1)}
            >🔄 Refresh</button>
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
                {/* ...existing code... */}
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
                    >📋 Paste</button>
                    <button className="btn btn-outline btn-full" onClick={() => { setFilter(''); setFilterNames(null); setMissingVersions([]); setDeploymentFolderPath(DEFAULT_DEPLOY_PATH); setSelected(new Set()); }}>Reset Filter</button>
                    <button className="btn btn-secondary btn-full" onClick={() => setAll(true)}>Select All</button>
                    <button className="btn btn-secondary btn-full" onClick={() => setAll(false)}>Clear</button>
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
                    <ProgressList progress={progress} repoLogs={repoLogs} />
                    <RepoList repos={filtered} selected={selected} toggle={toggle} versions={versions} targetVersions={filterTargetVersions} deployVersions={deployVersions} showBothVersions />
                    {/* ...existing code... */}
                    {deployScanError && <div className="repo-deploy-error">Deploy scan error: {deployScanError}</div>}
                    <div className="repo-versioning-btns">
                      <button
                        className="btn btn-secondary"
                        disabled={selected.size === 0}
                        title={selected.size ? 'Checkout master for selected repos' : 'Select repos to enable'}
                        onClick={async () => {
                          try {
                            const base = apiBase || await detectApiBase();
                            const chosen = Array.from(selected);
                            if (!chosen.length) return;
                            // Initialize progress state and clear per-repo logs
                            setProgress(chosen.map(repo => ({
                              repo,
                              steps: [
                                { label: 'Checkout master', status: 'pending' },
                                { label: 'Build', status: 'pending' },
                                { label: 'Deploy WAR', status: 'pending' },
                              ]
                            })));
                            setRepoLogs({});
                            // Start SSE for real-time progress
                            const eventSource = new window.EventSource(`${base}/api/versioning/progress`);
                            eventSource.onmessage = (event) => {
                              try {
                                const data = JSON.parse(event.data);
                                if (!data || !data.repo || !data.step) return;
                                setProgress(prev => prev.map(p => {
                                  if (p.repo !== data.repo) return p;
                                  const steps = p.steps.map(s => {
                                    if (s.label === data.step) {
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
                                if (data.stdout) {
                                  let prevStdout = '';
                                  setProgress(prev => {
                                    const p = prev.find(x => x.repo === data.repo);
                                    const prevStep = p?.steps.find(s => s.label === data.step);
                                    prevStdout = typeof prevStep?.stdout === 'string' ? prevStep.stdout : '';
                                    return prev;
                                  });
                                  let newLines: string[] = [];
                                  if (data.stdout.length > prevStdout.length) {
                                    const newPart = data.stdout.slice(prevStdout.length);
                                    newLines = newPart.split(/\r?\n/).filter(Boolean);
                                  } else if (!prevStdout && data.stdout.length) {
                                    newLines = data.stdout.split(/\r?\n/).filter(Boolean);
                                  }
                                  if (newLines.length) {
                                    setLogLines(prevLines => [...prevLines, ...newLines.map((l: string) => `[${data.repo}][${data.step}][stdout] ${l}`)].slice(-800));
                                    setRepoLogs(prev => {
                                      const prevArr = prev[data.repo] || [];
                                      return {
                                        ...prev,
                                        [data.repo]: [...prevArr, ...newLines.map((l: string) => `[${data.step}][stdout] ${l}`)].slice(-200)
                                      };
                                    });
                                  }
                                }
                                if (data.stderr) {
                                  let prevStderr = '';
                                  setProgress(prev => {
                                    const p = prev.find(x => x.repo === data.repo);
                                    const prevStep = p?.steps.find(s => s.label === data.step);
                                    prevStderr = typeof prevStep?.stderr === 'string' ? prevStep.stderr : '';
                                    return prev;
                                  });
                                  let newLines: string[] = [];
                                  if (data.stderr.length > prevStderr.length) {
                                    const newPart = data.stderr.slice(prevStderr.length);
                                    newLines = newPart.split(/\r?\n/).filter(Boolean);
                                  } else if (!prevStderr && data.stderr.length) {
                                    newLines = data.stderr.split(/\r?\n/).filter(Boolean);
                                  }
                                  if (newLines.length) {
                                    setLogLines(prevLines => [...prevLines, ...newLines.map((l: string) => `[${data.repo}][${data.step}][stderr] ${l}`)].slice(-800));
                                    setRepoLogs(prev => {
                                      const prevArr = prev[data.repo] || [];
                                      return {
                                        ...prev,
                                        [data.repo]: [...prevArr, ...newLines.map((l: string) => `[${data.step}][stderr] ${l}`)].slice(-200)
                                      };
                                    });
                                  }
                                }
                              } catch (e) {
                                // ignore parse errors
                              }
                            };
                            eventSource.onerror = () => {
                              eventSource.close();
                            };
                            // Start the process
                            const res = await fetch(`${base}/api/versioning/start`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ repos: chosen, deploymentFolderPath })
                            });
                            if (!res.ok) {
                              setLogLines(prev => [...prev, `[start-versioning] request failed status ${res.status}`]);
                              eventSource.close();
                              return;
                            } else {
                              // After deploy, reload deployed versions
                              try {
                                setDeployRefreshKey(k => k + 1);
                              } catch {/* ignore */ }
                            }
                          } catch (e: any) {
                            setLogLines(prev => [...prev, `[start-versioning] error ${(e?.message) || e}`]);
                          }
                        }}
                      >Start Versioning</button>
                    </div>
                  </div>
                )}
              </div>
              {/* Right Column (logs) */}
              {showLogs && (
                <div className="server-debug-log-panel">
                  <h3 className="server-debug-log-title">Server Debug Log</h3>
                  <div className="server-debug-log-content">
                    {logLines.length === 0 ? <div className="server-debug-log-empty">No log lines yet.</div> : logLines.slice(-500).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                  {/* Second Base Snapshot panel removed */}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
};
