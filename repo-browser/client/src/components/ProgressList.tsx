// LiveLogPanel: auto-scrolls to bottom when lines change
type LiveLogPanelProps = { lines: string[] };
const LiveLogPanel: React.FC<LiveLogPanelProps> = ({ lines }) => {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines.length]);
  const filtered = lines
    .filter(line => {
      // Remove Browserslist and update-db lines
      if (line.includes('Browserslist: browsers data (caniuse-lite) is')) return false;
      if (line.includes('Why you should do it regularly: https://github.com/browserslist/update-db#readme')) return false;
      if (line.includes('npx update-browserslist-db@latest')) return false;
      // Remove build artifact size lines and chunk info
      if (/^\[Build\]\[stdout\] \d+(\.\d+)? kB/.test(line)) return false;
      // Remove [Checkout master][stdout] $ ... and similar command echo lines
      if (/^\[Checkout master\]\[stdout\] \$/.test(line)) return false;
      // Do not filter out [Deploy WAR][stdout] lines, just remove the prefix below
      return true;
    })
    .map(line => {
      // Remove [Build][stdout] [time] prefix if present
      // Example: [Build][stdout] [00:48:28] message
      const buildPrefix = /^\[Build\]\[stdout\] \[\u001b\[90m?\d{2}:\d{2}:\d{2}\u001b\[39m?\] ?/;
      // Also remove [Build][stdout] prefix for lines without time
      const buildPrefixNoTime = /^\[Build\]\[stdout\] ?/;
      // Remove [Deploy WAR][stdout] prefix
      const deployPrefix = /^\[Deploy WAR\]\[stdout\] ?/;
      let l = line.replace(buildPrefix, '');
      l = l.replace(buildPrefixNoTime, '');
      l = l.replace(deployPrefix, '');
      // Strip ANSI color codes and normalize problematic symbols (heavy check mark) to plain text
      l = l.replace(/\x1b\[[0-9;]*m/g, '');
      l = l.replace(/[\u2714\u2705]/g, 'OK');
      return l;
    })
    .filter(line => line.trim() !== '');
  return (
    <div ref={logRef} style={{ background: '#181f2a', color: '#e0e6ef', fontFamily: 'monospace', fontSize: 15, marginTop: 8, padding: 8, borderRadius: 4, maxHeight: 180, overflowY: 'auto', border: '1.5px solid #3b4252' }}>
      {filtered.length > 0
        ? filtered.slice(-100).map((line, idx) => <div key={idx}>{line}</div>)
        : <div style={{ opacity: 0.5 }}>[No log output yet]</div>}
    </div>
  );
};
import React, { useEffect, useRef, useState } from 'react';
import { FaCopy, FaCheck } from 'react-icons/fa';

export interface ProgressStep {
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  detail?: string;
  stdout?: string;
  stderr?: string;
  warPath?: string;
  branch?: string;
}

export interface RepoProgress {
  repo: string;
  steps: ProgressStep[];
  branch?: string;
  stdout?: string;
  stderr?: string;
  warPath?: string;
  deployError?: string;
  statusIcon?: string; // '✔' or '✗' from backend
  // internal flag for auto-advance (not persisted)
  _advanced?: boolean;
}

interface ProgressListProps {
  progress: RepoProgress[];
  repoLogs?: Record<string, string[]>;
}

export const ProgressList: React.FC<ProgressListProps> = ({ progress, repoLogs }) => {
  const [expandedRepos, setExpandedRepos] = React.useState<Record<string, boolean>>({});
  const [copiedRepos, setCopiedRepos] = useState<Record<string, number>>({}); // timestamp of last copy per repo
  const handleToggle = (repo: string) => {
    setExpandedRepos(prev => ({ ...prev, [repo]: !prev[repo] }));
  };
  function copyLog(repo: string) {
    const lines = repoLogs && repoLogs[repo] ? repoLogs[repo] : [];
    if (!lines.length) return;
    try {
      navigator.clipboard.writeText(lines.join('\n'));
      setCopiedRepos(prev => ({ ...prev, [repo]: Date.now() }));
    } catch { /* ignore */ }
  }
  return (
    <div style={{ margin: '1rem 0', background: '#181e2a', borderRadius: 8, padding: 12, border: '1px solid #2d3642' }}>
      <h4 style={{ margin: '0 0 .5rem 0', fontSize: 15 }}>Build & Deploy Progress</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {progress.map((item, idx) => {
          const isActive = item.steps.some(s => s.status === 'running');
          const isDone = item.steps.length > 0 && item.steps.every(s => s.status === 'success' || s.status === 'error');
          const isError = item.steps.some(s => s.status === 'error');
          const isExpanded = !!expandedRepos[item.repo];
          const copiedRecently = copiedRepos[item.repo] && Date.now() - copiedRepos[item.repo] < 2000;
          return (
            <li key={item.repo} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, color: '#facc15', fontSize: 18, display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8 }}>{idx + 1}.</span> {item.repo}
                {isDone && (
                  <span style={{ marginLeft: 8, color: isError ? '#f87171' : '#34d399', fontSize: 18 }}>
                    {item.statusIcon === '✗' || isError ? '❌' : '✔️'}
                  </span>
                )}
                {isDone && (
                  <button
                    style={{ marginLeft: 12, fontSize: 13, color: '#a5b4fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={() => handleToggle(item.repo)}
                  >
                    [{isExpanded ? 'hide log' : 'show log'}]
                  </button>
                )}
              </div>
              {(isActive || (isDone && isExpanded)) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, marginTop: 4 }}>
                  {/* Left column: steps */}
                  <div style={{ minWidth: 220, flex: '0 0 220px' }}>
                    <ol style={{ margin: 0, paddingLeft: 24 }}>
                      {item.steps.map((s, i) => {
                        let extra = null;
                        if (s.label === 'Deploy WAR(s)' && item.deployError && (s.status === 'success' || s.status === 'error')) {
                          extra = <div style={{ fontSize: 12, color: '#f87171', marginTop: 2, marginBottom: 2 }}>Deploy error: {item.deployError}</div>;
                        }
                        return (
                          <li key={i} style={{ color: s.status === 'error' ? '#f87171' : s.status === 'success' ? '#34d399' : s.status === 'running' ? '#60a5fa' : '#a1a1aa', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                            <span>{s.label}</span>
                            {s.status === 'running' && (
                              <span style={{ marginLeft: 6, display: 'inline-block', verticalAlign: 'middle' }}>
                                <span className="spinner" style={{
                                  display: 'inline-block',
                                  width: 16,
                                  height: 16,
                                  border: '2px solid #60a5fa',
                                  borderTop: '2px solid transparent',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite',
                                  verticalAlign: 'middle',
                                  position: 'relative',
                                  top: -5
                                }} />
                              </span>
                            )}
                            {s.status === 'success' && <span style={{ marginLeft: 6 }}>✔️</span>}
                            {s.status === 'error' && <span style={{ marginLeft: 6 }}>❌</span>}
                            {s.detail && <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>{s.detail}</span>}
                            {extra}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  {/* Right column: live log */}
                  <div style={{ flex: 1, minWidth: 320 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                      <span style={{ fontWeight: 500, color: '#a5b4fc', fontSize: 16 }}>Live Log</span>
                      <button
                        onClick={() => copyLog(item.repo)}
                        title="Copy Live Log to clipboard"
                        aria-label="Copy Live Log to clipboard"
                        style={{
                          background: 'none',
                          border: '1px solid #374151',
                          color: '#a5b4fc',
                          cursor: 'pointer',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >{copiedRecently ? <FaCheck aria-hidden /> : <FaCopy aria-hidden />}</button>
                    </div>
                    <LiveLogPanel lines={repoLogs && repoLogs[item.repo] ? repoLogs[item.repo] : []} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
