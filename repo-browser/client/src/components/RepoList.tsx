import React from 'react';
import { resolveDeployVersion } from '../lib/deployMapping';

export const RepoList: React.FC<{
  repos: string[];
  selected: Set<string>;
  toggle: (repo: string) => void;
  versions?: Record<string, string>;
  targetVersions?: Record<string, string>;
  deployVersions?: Record<string, string>;
  showBothVersions?: boolean;
}> = ({ repos, selected, toggle, versions, targetVersions, deployVersions, showBothVersions }) => {
  if (repos.length === 0) return <p style={{ opacity: 0.7 }}>No repos</p>;
  const _cmp = (a: string, b: string) => {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  };
  // All repos are always enabled now
  // const isNonUpgrade = ... (removed)
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, columns: '280px 3', columnGap: '2rem' }}>
      {repos.map(r => {
        const dv = resolveDeployVersion(r, deployVersions);
        // ...
        // Try both original and lowercased repo name
        const repoVersion = versions && (versions[r] || versions[r.toLowerCase()]);
        // ...
        const tv = targetVersions && targetVersions[r];
        const showVersion = dv || repoVersion;
        let showVersionColor = '#c084fc'; // deployed (purple)
        if (!dv && repoVersion) showVersionColor = '#60a5fa'; // fallback repo version (blue)
        // ...
        // Show both deployed and repo version if they differ and showBothVersions is true
        let versionDisplay = null;
        // Show both deployed and repo version if they differ and showBothVersions is true
        if (showBothVersions && dv && repoVersion && dv !== repoVersion) {
          versionDisplay = (
            <span style={{ marginLeft: 8, fontSize: '0.7em', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#c084fc' }}>{dv}</span>
              <span style={{ color: '#64748b' }}>|</span>
              <span style={{ color: '#60a5fa' }}>{repoVersion}</span>
              {/* Notification badge */}
              <span
                title="Repo version is different from deployed version. Consider redeploying."
                style={{
                  background: '#fbbf24',
                  color: '#222',
                  borderRadius: 4,
                  padding: '0 6px',
                  fontSize: '0.8em',
                  fontWeight: 700,
                  marginLeft: 4,
                  display: 'inline-block',
                  cursor: 'help',
                  border: '1px solid #f59e42',
                }}
              >!</span>
              {targetVersions && targetVersions[r] && (
                <>
                  <span style={{ color: '#64748b' }}>→</span>
                  <span style={{ color: '#34d399', fontWeight: 500 }}>{targetVersions[r]}</span>
                </>
              )}
            </span>
          );
        } else {
          versionDisplay = (showVersion || tv) && (
            <span style={{ marginLeft: 8, fontSize: '0.7em', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {showVersion && <span style={{ color: showVersionColor }}>{showVersion}</span>}
              {tv && (
                <>
                  <span style={{ color: '#64748b' }}>→</span>
                  <span style={{ color: '#34d399', fontWeight: 500 }}>{tv}</span>
                </>
              )}
              {!showVersion && tv && (
                <span style={{ color: '#c084fc' }}>—</span>
              )}
            </span>
          );
        }
        return (
          <li key={r} style={{ breakInside: 'avoid', padding: '4px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.65rem', cursor: 'pointer', lineHeight: 1.15 }}>
              <input
                type="checkbox"
                checked={selected.has(r)}
                onChange={() => toggle(r)}
              />
              <span>{r}</span>
              {versionDisplay}
            </label>
          </li>
        );
      })}
    </ul>
  );
};
