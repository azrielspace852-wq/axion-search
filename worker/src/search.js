/* ============================================================
 *  AXION Search v5 — Search orchestrator
 *
 *  Limits enforced (Cloudflare Worker constraints):
 *    - <= 50 subrequests per invocation  (we use ~10 worst case)
 *    - <= 6 concurrent outbound connections (pLimit(4) enforces)
 *    - <= 10ms CPU time (all heavy work is async I/O; JSON parse only)
 *
 *  Strategy: per vertical, fire up to 2 providers in parallel and
 *  merge; a third only as fallback. Aggressive caching upstream
 *  (EdgeCache) eliminates repeat queries entirely.
 * ============================================================ */

import { buildProviders, providersFor } from './providers.js';
import { dedupe, filterSafe, pLimit, cacheKey, normLang } from './util.js';
import { EdgeCache } from './cache.js';

const limiter = pLimit(4); // < 6 concurrent connections cap
const SEARCH_TTL = 300;    // 5 minutes

export class SearchService {
  constructor(env) {
    this.env = env;
    this.providers = buildProviders(env);
    this.cache = new EdgeCache(env);
    this.safeDefault = env.SAFESEARCH_DEFAULT !== '0';
    this.seedMinute = Math.floor(Date.now() / 60000);
  }

  async _vertical(vertical, query, { safe, lang }) {
    const key = cacheKey(['search', vertical, safe ? 1 : 0, lang, query]);
    const hit = await this.cache.get(key);
    if (hit) return hit;

    const candidates = providersFor(this.providers, vertical, this.seedMinute);
    if (!candidates.length) return { results: [] };

    // Try up to 2 providers in parallel; if both fail, try a 3rd sequentially.
    const primary = candidates.slice(0, 2);
    const settled = await Promise.allSettled(
      primary.map(p => limiter(() => p.search({ query, vertical, safe, lang, count: 20 })))
    );
    let merged = [];
    for (const s of settled) if (s.status === 'fulfilled') merged = merged.concat(s.value.results);
    if (!merged.length && candidates[2]) {
      try {
        const r = await limiter(() => candidates[2].search({ query, vertical, safe, lang, count: 20 }));
        merged = merged.concat(r.results);
      } catch { /* all providers failed */ }
    }

    merged = filterSafe(dedupe(merged), safe).slice(0, 40);
    const out = { type: vertical, query, count: merged.length, results: merged };
    this.cache.put(key, out, SEARCH_TTL); // fire-and-forget
    return out;
  }

  async search(type, query, opts = {}) {
    const safe = opts.safe ?? this.safeDefault;
    const lang = normLang(opts.lang);
    if (type === 'all') return this._all(query, { safe, lang });
    // apps & shop are web verticals with query modifiers
    if (type === 'apps') return this._vertical('web', `${query} app OR site:play.google.com OR site:apps.apple.com`, { safe, lang });
    if (type === 'shop') return this._vertical('web', `${query} buy OR shop OR price OR jual OR harga`, { safe, lang });
    return this._vertical(type, query, { safe, lang });
  }

  async _all(query, { safe, lang }) {
    const key = cacheKey(['search', 'all', safe ? 1 : 0, lang, query]);
    const hit = await this.cache.get(key);
    if (hit) return hit;
    const [web, images, videos, news, audio] = await Promise.allSettled([
      this._vertical('web', query, { safe, lang }),
      this._vertical('images', query, { safe, lang }),
      this._vertical('videos', query, { safe, lang }),
      this._vertical('news', query, { safe, lang }),
      this._vertical('audio', query, { safe, lang })
    ]);
    const val = p => p.status === 'fulfilled' ? p.value.results : [];
    const out = {
      type: 'all', query,
      count: val(web).length + val(images).length + val(videos).length + val(news).length + val(audio).length,
      web: val(web).slice(0, 12), images: val(images).slice(0, 8),
      videos: val(videos).slice(0, 6), news: val(news).slice(0, 6), audio: val(audio).slice(0, 4)
    };
    this.cache.put(key, out, SEARCH_TTL);
    return out;
  }

  /* Tool endpoint for external AI agents — compact, structured. */
  async toolSearch(query, opts = {}) {
    const safe = opts.safe ?? this.safeDefault;
    const lang = normLang(opts.lang);
    const { results } = await this._vertical('web', query, { safe, lang });
    return { query, results: results.slice(0, 10).map(r => ({ title: r.title, url: r.link, snippet: r.snippet, source: r.source })) };
  }
}
