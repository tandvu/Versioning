import React, { useEffect, useState, useMemo } from 'react';
import { MdContentPaste } from 'react-icons/md';
import { detectApiBase } from '../api';
import ignoreDefaults from '../IgnoreFolders.json';

interface SettingsProps { onClose: () => void; onUpdated: () => void; }
interface RepoSettingsData { basePaths: string[]; ignore?: Record<string, string[]>; }
const FIXED_SECOND_PATH = 'C:/AMPT_DEV/TRMC_MODULE';

export const Settings: React.FC<SettingsProps> = ({ onClose, onUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basePaths, setBasePaths] = useState<string[]>([]); // Always length 2: [editable, FIXED_SECOND_PATH]
  const [originalBasePaths, setOriginalBasePaths] = useState<string[]>([]); // snapshot from server
  const [ignoreMap, setIgnoreMap] = useState<Record<string, string[]>>({});
  const [selectedBase, setSelectedBase] = useState<string>('');
  const [folders, setFolders] = useState<string[]>([]);
  const [repoMeta, setRepoMeta] = useState<Record<string, { version?: string }>>({});
  const ignoreSet = useMemo(() => new Set((ignoreDefaults as string[]).map(s => s.toLowerCase())), []);
  const [apiBase, setApiBase] = useState('');
  // Removed dirty tracking since Save button eliminated.
  const [loadingFolders, setLoadingFolders] = useState(false);
  // Removed applyingFirst state (Apply button removed)
  const [secondBaseChildren, setSecondBaseChildren] = useState<string[] | null>(null);
  const [secondBaseLoading, setSecondBaseLoading] = useState(false);
  const [secondBaseError, setSecondBaseError] = useState<string | null>(null);


  useEffect(() => {
    (async () => {
      try {
        const api = await detectApiBase();
        setApiBase(api);
        const r = await fetch(`${api}/api/settings`);
        const data: RepoSettingsData = await r.json();
        // Normalize to two paths: first from config (or C:/AMPT fallback), second fixed constant
        const first = (data.basePaths && data.basePaths[0]) || 'C:/AMPT';
        const normalized: string[] = [first, FIXED_SECOND_PATH];
        setBasePaths(normalized);
        setOriginalBasePaths(normalized);
        setIgnoreMap(data.ignore || {});
        if (data.basePaths?.length) setSelectedBase(data.basePaths[0]);
      } catch (e: any) {
        setError(e.message || 'Failed to load settings');
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedBase) return;
    // Only fetch if path exists in persisted config (server knows it)
    if (!apiBase) return;
    const persisted = originalBasePaths.includes(selectedBase);
    if (!persisted) { setFolders([]); return; }
    (async () => {
      setLoadingFolders(true);
      try {
        const r = await fetch(`${apiBase}/api/folders?base=${encodeURIComponent(selectedBase)}`);
        if (!r.ok) throw new Error('Failed to load folders');
        const data = await r.json();
        setFolders(data.folders || []);
        if (Array.isArray(data.repos)) {
          const meta: Record<string, { version?: string }> = {};
          for (const rep of data.repos) {
            if (rep && rep.name) meta[rep.name] = { version: rep.version };
          }
          setRepoMeta(meta);
        } else {
          setRepoMeta({});
        }
      } catch (e: any) {
        console.warn(e);
        setFolders([]);
        setRepoMeta({});
      } finally { setLoadingFolders(false); }
    })();
  }, [selectedBase, apiBase, originalBasePaths]);

  // Debug: fetch children of fixed second base via debug endpoint (shows raw list even if filtering elsewhere)
  useEffect(() => {
    (async () => {
      if (!apiBase) return;
      setSecondBaseLoading(true);
      setSecondBaseError(null);
      try {
        const r = await fetch(`${apiBase}/api/debug/base?path=${encodeURIComponent(FIXED_SECOND_PATH)}`);
        if (!r.ok) throw new Error(`debug ${r.status}`);
        const data = await r.json();
        if (Array.isArray(data.children)) {
          setSecondBaseChildren(data.children.map((c: any) => c.name));
        } else {
          setSecondBaseChildren([]);
        }
      } catch (e: any) {
        setSecondBaseError(e.message || 'Failed');
        setSecondBaseChildren(null);
      } finally { setSecondBaseLoading(false); }
    })();
  }, [apiBase]);

  // Explicit fetch helper (used by Apply button)
  async function fetchFoldersFor(base: string) {
    if (!apiBase) return;
    setLoadingFolders(true);
    try {
      const r = await fetch(`${apiBase}/api/folders?base=${encodeURIComponent(base)}`);
      if (!r.ok) throw new Error('Failed to load folders');
      const data = await r.json();
      setFolders(data.folders || []);
      if (Array.isArray(data.repos)) {
        const meta: Record<string, { version?: string }> = {};
        for (const rep of data.repos) {
          if (rep && rep.name) meta[rep.name] = { version: rep.version };
        }
        setRepoMeta(meta);
      } else {
        setRepoMeta({});
      }
    } catch (e) {
      console.warn(e);
      setFolders([]);
      setRepoMeta({});
    } finally { setLoadingFolders(false); }
  }

  function handlePathChange(index: number, value: string) {
    if (index !== 0) return; // Only first path editable
    setBasePaths(prev => {
      const copy = [...prev];
      const old = copy[0];
      copy[0] = value;
      if (ignoreMap[old] && old !== value) {
        setIgnoreMap(mPrev => {
          const mCopy = { ...mPrev };
          mCopy[value] = mCopy[old];
          delete mCopy[old];
          return mCopy;
        });
      }
      if (selectedBase === old) setSelectedBase(value);
      return copy;
    });
    // Dirty tracking removed.
  }

  // applyFirstPath removed (Apply button gone). Save now commits changes.

  function toggleIgnore(folder: string) {
    if (!selectedBase) return;
    // Changes persist only when Save is pressed.
    setIgnoreMap(prev => {
      const current = new Set(prev[selectedBase] || []);
      if (current.has(folder)) current.delete(folder); else current.add(folder);
      return { ...prev, [selectedBase]: Array.from(current).sort() };
    });
  }
  // removeBasePath & addBasePath removed: exactly two paths enforced
  // Removed manual Save. Changes (first path + ignore) apply automatically on paste of a new path.

  // Silent save used when user pastes a new path; keeps dialog open but applies config so repos can load.
  async function silentApplyFirstPath(firstPath: string) {
    if (!apiBase) return;
    const cleanFirst = firstPath.trim() || 'C:/AMPT';
    try {
      setSaving(true);
      const body: RepoSettingsData = { basePaths: [cleanFirst, FIXED_SECOND_PATH], ignore: ignoreMap };
      const r = await fetch(`${apiBase}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Save failed: ${r.status}`);
      setOriginalBasePaths([cleanFirst, FIXED_SECOND_PATH]);
      onUpdated(); // notify parent to refresh overall repo list
    } catch (e: any) {
      console.warn('Silent apply failed', e);
      // Non-fatal; leave path unsaved state so user can still click Save.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, width: '100%', background: '#1b222c', border: '1px solid #2d3642', borderRadius: 8, padding: '1.25rem 1.5rem', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'goldenrod' }}>Repository Path</h2>
      </div>
      {loading && <div style={{ opacity: .8 }}>Loading…</div>}
      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 80, flexWrap: 'wrap' }}>
          <section style={{ flex: '2 1 420px' }}>
            <p style={{ margin: '0 0 .5rem 0', fontSize: '.8rem', lineHeight: 1.4, opacity: .75 }}>
              Paste (Ctrl+V) your repository base path into the first field. It applies immediately and loads repos automatically. The second path is fixed at {FIXED_SECOND_PATH}. Click Close when done.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {basePaths.map((p, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', width: '100%' }}>
                  <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {idx === 0 && (
                      <label style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: '#60a5fa', margin: '0 0 4px 2px' }}>All Other Repos</label>
                    )}
                    {idx === 1 && (
                      <label style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: '#60a5fa', margin: '14px 0 4px 2px' }}>OPT-SOA</label>
                    )}
                    <div style={{ display: 'flex', width: '100%', gap: 10, minWidth: 0 }}>
                      <input
                        value={p}
                        readOnly={idx === 1}
                        onChange={e => handlePathChange(idx, e.target.value)}
                        onFocus={e => { setSelectedBase(p); if (idx === 0) e.target.select(); }}
                        style={{ flex: '1 1 auto', minWidth: 0, background: selectedBase === p ? '#243043' : '#181f27', border: '1px solid #2d3642', color: idx === 1 ? '#94a3b8' : '#e2e8f0', padding: '10px 14px', borderRadius: 6, fontFamily: 'monospace', fontSize: 15, lineHeight: 1.35, opacity: idx === 1 ? .75 : 1 }}
                        placeholder='C:/full/path'
                      />
                      {idx === 0 ? (
                        <button
                          type='button'
                          onClick={async () => {
                            try {
                              const txtRaw = await navigator.clipboard.readText();
                              const txt = txtRaw.trim();
                              if (!txt) return;
                              const norm = txt.replace(/\\/g, '/');
                              handlePathChange(0, norm);
                              setSelectedBase(norm);
                              // Apply immediately so repos load without manual Save.
                              await silentApplyFirstPath(norm);
                              await fetchFoldersFor(norm);
                            } catch (err) {
                              console.warn('Clipboard read failed', err);
                            }
                          }}
                          title='Paste path from clipboard'
                          style={{ width: 50, background: '#334155', border: '1px solid #475569', color: '#fff', padding: '10px 8px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
                          <MdContentPaste size={18} aria-hidden='true' />
                        </button>
                      ) : (
                        <div style={{ width: 50 }} />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section style={{ flex: '3 1 520px' }}>
            <h3 style={{ margin: '0 0 .5rem 0', fontSize: '.95rem', letterSpacing: '.5px', opacity: .8 }}>Available Repos {selectedBase && <span style={{ opacity: .6 }}>@ {selectedBase}</span>}</h3>
            {selectedBase ? (
              <div style={{ border: '1px solid #2d3642', borderRadius: 6, padding: '8px 10px', maxHeight: 340, overflowY: 'auto', background: '#161d25' }}>
                {!originalBasePaths.includes(selectedBase) && <div style={{ opacity: .6 }}>Path not yet applied yet. Paste a path to apply and load its folders.</div>}
                {originalBasePaths.includes(selectedBase) && loadingFolders && <div style={{ opacity: .6 }}>Loading folders…</div>}
                {originalBasePaths.includes(selectedBase) && !loadingFolders && folders.length === 0 && <div style={{ opacity: .6 }}>No Repository Found.</div>}
                {originalBasePaths.includes(selectedBase) && !loadingFolders && (() => {
                  const baseName = selectedBase ? selectedBase.split(/[/\\]/).filter(Boolean).pop() : undefined;
                  const isSecond = selectedBase === basePaths[1];
                  // combine folder repos plus potential base repo if present in meta
                  const names = new Set<string>();
                  folders.forEach(f => {
                    if (isSecond) {
                      names.add(f); // do not apply ignore list to second path
                    } else {
                      if (!ignoreSet.has(f.toLowerCase())) names.add(f);
                    }
                  });
                  if (baseName && repoMeta[baseName]) {
                    if (isSecond || !ignoreSet.has(baseName.toLowerCase())) names.add(baseName);
                  }
                  return Array.from(names).sort().map(f => {
                    const v = repoMeta[f]?.version;
                    return (
                      <div key={f} style={{ padding: '6px 0', fontSize: 16, color: '#ddd', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222' }}>
                        <span>{f}</span>
                        <span style={{ fontSize: 12, color: v ? '#93c5fd' : '#64748b', fontFamily: 'monospace' }}>{v || '—'}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : <div style={{ opacity: .6 }}>Select a base path to view folders.</div>}
            {/* Removed opt-soa Repo snapshot section */}
          </section>
        </div>
      )}
      <div style={{ marginTop: 16, fontSize: 12, opacity: .6 }}>Changes apply immediately on paste (server/config.runtime.json)</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          disabled={saving}
          onClick={() => onClose()}
          style={{
            background: '#334155',
            border: '1px solid #475569',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 15,
            fontWeight: 600,
            minWidth: 120
          }}>
          Close
        </button>
      </div>
    </div>
  );
};
export default Settings;
