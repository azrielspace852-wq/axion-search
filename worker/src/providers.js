/* ============================================================
 *  AXION Search v5 — Unified Search Provider Abstraction Layer
 *
 *  Three third-party Search API providers (no scraping anywhere):
 *    - Brave Search API  (web / images / videos / news verticals)
 *    - SerpDive          (Krill mode — LLM-optimized, raw URLs)
 *    - Tavily            (LLM-optimized search API, raw URLs)
 *
 *  Because Tavily & SerpDive are LLM-optimized and return raw URLs,
 *  the same abstraction feeds BOTH standard Web Search and the
 *  AI-grounded summary/chat pipeline. Every provider implements:
 *      search({ query, vertical, safe, lang, count }) -> { results, provider }
 *  where result shape is normalized to:
 *      { title, link, snippet, source, thumb?, duration?, date? }
 * ============================================================ */

import { hostOf, applySafeQuery } from './util.js';

const OUTBOUND_TIMEOUT_MS = 12000; // wall-clock I/O, not CPU

async function fetchJson(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OUTBOUND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

function norm(r) {
  return {
    title: r.title || '',
    link: r.link || r.url || '',
    snippet: r.snippet || r.description || r.content || '',
    source: r.source || hostOf(r.link || r.url || ''),
    thumb: r.thumb || r.thumbnail || r.image || undefined,
    duration: r.duration || undefined,
    date: r.date || r.published || undefined
  };
}

/* ── Brave Search API ─────────────────────────────────────── */
class BraveProvider {
  constructor(key) { this.key = key; this.name = 'brave'; }
  enabled(vertical) {
    return !!this.key && ['web', 'images', 'videos', 'news'].includes(vertical);
  }
  async search({ query, vertical, safe, lang, count = 20 }) {
    const q = applySafeQuery(query, safe);
    const endpoint = vertical === 'web' ? 'web' : vertical; // images | videos | news | web
    const url = `https://api.search.brave.com/res/v1/${endpoint}/search?q=${encodeURIComponent(q)}&count=${count}&safesearch=${safe ? 'strict' : 'off'}&search_lang=${lang}`;
    const data = await fetchJson(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': this.key } });
    let raw = [];
    if (vertical === 'web') raw = data.web?.results || [];
    else if (vertical === 'images') raw = data.results || [];
    else if (vertical === 'videos') raw = data.results || [];
    else if (vertical === 'news') raw = data.results || [];
    const results = raw.map(r => norm({
      title: r.title, link: r.url || r.properties?.url,
      snippet: r.description, thumb: r.thumbnail?.src?.url || r.properties?.thumbnail,
      duration: r.properties?.duration, date: r.age || r.page_age
    })).filter(r => r.title && r.link);
    if (!results.length) throw new Error('brave empty');
    return { results, provider: this.name };
  }
}

/* ── SerpDive (Krill mode) ──────────────────────────────────
 *  LLM-optimized endpoint. Krill mode returns clean, structured
 *  results with raw URLs — ideal both for web listings and as
 *  grounding context for the AI pipeline.                    */
class SerpDiveProvider {
  constructor(key) { this.key = key; this.name = 'serpdive'; }
  enabled(vertical) { return !!this.key && vertical === 'web'; }
  async search({ query, vertical, safe, lang, count = 20 }) {
    const q = applySafeQuery(query, safe);
    const data = await fetchJson('https://api.serpdive.com/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.key}` },
      body: JSON.stringify({ q, mode: 'krill', num: count, safe_search: !!safe, hl: lang })
    });
    const raw = data.results || data.organic || [];
    const results = raw.map(r => norm({
      title: r.title, link: r.link || r.url, snippet: r.snippet || r.description
    })).filter(r => r.title && r.link);
    if (!results.length) throw new Error('serpdive empty');
    return { results, provider: this.name };
  }
}

/* ── Tavily (LLM-optimized) ─────────────────────────────────
 *  Returns results + answer. Used for web search and directly
 *  as grounding source for AI (raw URLs + content snippets).  */
class TavilyProvider {
  constructor(key) { this.key = key; this.name = 'tavily'; }
  enabled(vertical) { return !!this.key && vertical === 'web'; }
  async search({ query, vertical, safe, lang, count = 15 }) {
    const q = applySafeQuery(query, safe);
    const data = await fetchJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.key, query: q, search_depth: 'basic', max_results: count, include_answer: false })
    });
    const raw = data.results || [];
    const results = raw.map(r => norm({
      title: r.title, link: r.url, snippet: r.content, date: r.published_date
    })).filter(r => r.title && r.link);
    if (!results.length) throw new Error('tavily empty');
    return { results, provider: this.name };
  }
}

/* ── iTunes (public JSON API) — Audio vertical only ─────────
 *  Not scraping; a structured public API. Retained for audio. */
class ItunesProvider {
  constructor() { this.name = 'itunes'; }
  enabled(vertical) { return vertical === 'audio'; }
  async search({ query, count = 30 }) {
    const data = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=all&limit=${count}`);
    const results = (data.results || []).map(r => norm({
      title: `${r.trackName || r.collectionName || ''} — ${r.artistName || ''}`.trim(),
      link: r.trackViewUrl || r.collectionViewUrl || '',
      thumb: r.artworkUrl100,
      snippet: r.kind || r.wrapperType || 'Audio',
      source: r.kind || r.wrapperType || 'Audio',
      duration: r.trackTimeMillis ? `${Math.round(r.trackTimeMillis / 1000)}s` : undefined
    })).filter(r => r.title && r.link);
    if (!results.length) throw new Error('itunes empty');
    return { results, provider: this.name };
  }
}

/* ── Provider registry ────────────────────────────────────── */
export function buildProviders(env) {
  const list = [];
  if (env.BRAVE_API_KEY) list.push(new BraveProvider(env.BRAVE_API_KEY));
  if (env.SERPDIVE_API_KEY) list.push(new SerpDiveProvider(env.SERPDIVE_API_KEY));
  if (env.TAVILY_API_KEY) list.push(new TavilyProvider(env.TAVILY_API_KEY));
  list.push(new ItunesProvider());
  return list;
}

/* Pick providers that support a given vertical, in rotation order.
 * Rotation start shifts every minute to balance quota across keys. */
export function providersFor(providers, vertical, seedMinute) {
  const capable = providers.filter(p => p.enabled(vertical));
  if (!capable.length) return [];
  const start = seedMinute % capable.length;
  const out = [];
  for (let i = 0; i < capable.length; i++) out.push(capable[(start + i) % capable.length]);
  return out;
}
