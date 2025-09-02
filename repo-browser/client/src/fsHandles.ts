// Utility for persisting FileSystemDirectoryHandle using IndexedDB so user
// doesn't get re-prompted each visit (cannot skip the first permission).
// Based on File System Access API. Only works in Chromium-based browsers.

const DB_NAME = 'repo-browser-fs';
const STORE = 'handles';
const KEY = 'rootDir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to save handle', e);
  }
}

export async function getSavedHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

export async function clearSavedHandle() {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to clear handle', e);
  }
}

export async function ensurePersistentStorage() {
  if ((navigator as any).storage && (navigator as any).storage.persist) {
    try { await (navigator as any).storage.persist(); } catch (_err) { /* ignore */ }
  }
}

export async function enumerateRepos(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const repos: string[] = [];
  for await (const entry of (handle as any).values()) {
    if (entry.kind === 'directory') repos.push(entry.name);
  }
  repos.sort((a, b) => a.localeCompare(b));
  return repos;
}

// Attempt to ensure we have at least read permission on a handle.
// Returns true if permission is granted after the call, false otherwise.
export async function verifyPermission(handle: any, mode: 'read' | 'readwrite' = 'read'): Promise<boolean> {
  if (!handle?.queryPermission) return false;
  try {
    const q = await handle.queryPermission({ mode });
    if (q === 'granted') return true;
    if (q === 'prompt' && handle.requestPermission) {
      // Must be called in a user gesture to avoid automatic denial.
      const r = await handle.requestPermission({ mode });
      return r === 'granted';
    }
    return false;
  } catch (_err) {
    return false;
  }
}
