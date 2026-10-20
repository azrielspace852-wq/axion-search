/* ============================================================
 *  AXION Search v5 — IndexedDB storage layer
 *  Replaces localStorage (point 12): larger capacity, async,
 *  structured data, no main-thread blocking. One object store
 *  `kv` (keyPath: k) with optional TTL per entry.
 * ============================================================ */
(function () {
  'use strict';
  const DB_NAME = 'axion-search';
  const DB_VERSION = 1;
  const STORE = 'kv';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode) {
    return open().then(db => {
      const t = db.transaction(STORE, mode);
      return { store: t.objectStore(STORE), done: new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); }) };
    });
  }

  const IDB = {
    async get(k, def) {
      try {
        const { store } = await tx('readonly');
        const v = await new Promise((res, rej) => {
          const r = store.get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        if (!v) return def;
        if (v.ttl && Date.now() > v.ttl) { this.del(k).catch(() => {}); return def; }
        return v.v;
      } catch { return def; }
    },
    async set(k, v, ttlMs) {
      try {
        const { store, done } = await tx('readwrite');
        store.put({ k, v, ttl: ttlMs ? Date.now() + ttlMs : undefined });
        await done;
      } catch { /* storage may be unavailable — degrade gracefully */ }
    },
    async del(k) {
      try {
        const { store, done } = await tx('readwrite');
        store.delete(k);
        await done;
      } catch {}
    },
    async clear() {
      try {
        const { store, done } = await tx('readwrite');
        store.clear();
        await done;
      } catch {}
    },
    async exportAll() {
      try {
        const { store } = await tx('readonly');
        const all = await new Promise((res, rej) => {
          const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const out = {};
        for (const row of all) if (!row.ttl || Date.now() <= row.ttl) out[row.k] = row.v;
        return out;
      } catch { return {}; }
    },
    async importAll(data) {
      if (!data || typeof data !== 'object') return false;
      try {
        const { store, done } = await tx('readwrite');
        for (const [k, v] of Object.entries(data)) store.put({ k, v });
        await done;
        return true;
      } catch { return false; }
    }
  };

  /* One-time migration: move legacy localStorage axn_* keys into IndexedDB. */
  (async function migrateFromLocalStorage() {
    try {
      const marker = await IDB.get('_migrated_v5');
      if (marker) return;
      const migrated = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('axn_')) {
          try { migrated[k] = JSON.parse(localStorage.getItem(k)); } catch { migrated[k] = localStorage.getItem(k); }
        }
      }
      if (Object.keys(migrated).length) await IDB.importAll(migrated);
      for (const k of Object.keys(migrated)) try { localStorage.removeItem(k); } catch {}
      await IDB.set('_migrated_v5', true);
    } catch {}
  })();

  window.AxnDB = IDB;
})();
