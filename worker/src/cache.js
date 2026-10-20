/* ============================================================
 *  AXION Search v5 — Multi-tier caching (Tier 1: Edge)
 *
 *  Tier 1a: Cloudflare Cache API (per-edge, fast, s-maxage TTL)
 *  Tier 1b: Cloudflare KV (global, longer TTL) — binding AXION_KV
 *
 *  Writes are fire-and-forget (not awaited) to preserve CPU budget.
 *  Tier 2 (client-side IndexedDB) lives in the frontend, not here.
 * ============================================================ */

const CACHE_ORIGIN = 'https://cache.axion.internal';

export class EdgeCache {
  constructor(env) { this.kv = env.AXION_KV || null; }

  async get(key) {
    // 1a: Cache API (synthetic URL)
    try {
      const cache = await caches.open('axion-v5');
      const hit = await cache.match(`${CACHE_ORIGIN}/${encodeURIComponent(key)}`);
      if (hit) return await hit.json();
    } catch { /* Cache API unavailable in some contexts — fall through */ }
    // 1b: KV
    if (this.kv) {
      try {
        const v = await this.kv.get(key, 'json');
        if (v) {
          // Backfill Cache API (fire-and-forget)
          this._putCache(key, v, 300).catch(() => {});
          return v;
        }
      } catch { /* KV miss/error — fall through to origin */ }
    }
    return null;
  }

  async put(key, value, ttlSec = 300) {
    // Fire-and-forget: never block the response on cache writes.
    this._putCache(key, value, ttlSec).catch(() => {});
    if (this.kv) {
      this.kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(ttlSec, 60) }).catch(() => {});
    }
  }

  async _putCache(key, value, ttlSec) {
    const cache = await caches.open('axion-v5');
    const res = new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, s-maxage=${ttlSec}` }
    });
    await cache.put(`${CACHE_ORIGIN}/${encodeURIComponent(key)}`, res);
  }
}
