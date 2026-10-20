/* ============================================================
 *  AXION Search v5 — Cloudflare Worker (Backend API)
 *  Hosted at: api.search.axn.cc.cd
 *  Invoked by Pages frontend via Cloudflare Service Bindings
 *  (no external HTTP overhead), or directly by SDK/AI agents.
 *
 *  CPU budget: <= 10ms. All external calls async/non-blocking.
 *  No artificial delays. No scraping. No Node dependencies.
 * ============================================================ */

import { SearchService } from './search.js';
import { AIService } from './ai.js';
import { EdgeCache } from './cache.js';
import { normLang, cacheKey } from './util.js';

const AI_TTL = 3600; // 1 hour

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra }
  });
}

function err(message, status = 500, detail = '') {
  return json({ error: message, detail: detail || message }, status);
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, ''); // normalize /api/v1/... -> /v1/...
  const q = (url.searchParams.get('q') || '').toString().trim();
  const type = (url.searchParams.get('type') || 'web').toString().trim();
  const safeParam = url.searchParams.get('safe');
  const lang = (url.searchParams.get('lang') || 'en').toString();

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  /* ── Health ─────────────────────────────────────────────── */
  if (path === '/health' || path === '/v1/health') {
    return json({ ok: true, ts: Date.now(), version: '5.0.0', providers: {
      brave: !!env.BRAVE_API_KEY, serpdive: !!env.SERPDIVE_API_KEY, tavily: !!env.TAVILY_API_KEY,
      ai: !!(env.AI_KEY_1 || env.AI_KEY_2 || env.AI_KEY_3), kv: !!env.AXION_KV
    } });
  }

  const svc = new SearchService(env);
  const safe = safeParam !== undefined ? safeParam === '1' : undefined;

  /* ── Search (standard + legacy paths) ───────────────────── */
  if (request.method === 'GET' && (path === '/v1/search' || path === '/v1/tool/search' || path === '/search')) {
    if (!q) return err('empty query', 400);
    try {
      if (path === '/v1/tool/search') return json(await svc.toolSearch(q, { safe, lang }));
      return json(await svc.search(type, q, { safe, lang }));
    } catch (e) { return err('search failed', 500, String(e?.message || e)); }
  }

  /* ── AI Summary (grounded) ──────────────────────────────── */
  if (request.method === 'GET' && (path === '/v1/summary' || path === '/summary')) {
    if (!q) return err('empty query', 400);
    const ai = new AIService(env);
    if (!ai.enabled) return err('AI not configured', 501);
    const cache = new EdgeCache(env);
    const key = cacheKey(['ai', 'summary', normLang(lang), q]);
    const hit = await cache.get(key);
    if (hit) return json({ query: q, ...hit });
    try {
      const { results } = await svc.search('web', q, { safe, lang });
      const out = await ai.summarize(q, results, normLang(lang));
      if (out.summary) cache.put(key, out, AI_TTL); // fire-and-forget
      return json({ query: q, webCount: results.length, ...out });
    } catch (e) {
      return err(e?.code === 'NO_KEY' ? 'AI not configured' : 'summary failed', e?.code === 'NO_KEY' ? 501 : 500, String(e?.message || e));
    }
  }

  /* ── AI Chat Mode ───────────────────────────────────────── */
  if (request.method === 'POST' && (path === '/v1/chat' || path === '/chat')) {
    let body = {};
    try { body = await request.json(); } catch { return err('invalid JSON body', 400); }
    const messages = body.messages;
    if (!Array.isArray(messages) || !messages.length) return err('no messages', 400);
    const ai = new AIService(env);
    if (!ai.enabled) return err('AI not configured', 501);
    const chatLang = normLang(body.lang || lang);
    const chatSafe = body.safe !== undefined ? !!body.safe : undefined;
    try {
      const lastQ = messages[messages.length - 1]?.content || '';
      const { results } = await svc.search('web', lastQ, { safe: chatSafe, lang: chatLang });
      const out = await ai.chat(messages, results, chatLang);
      return json(out);
    } catch (e) {
      return err(e?.code === 'NO_KEY' ? 'AI not configured' : 'chat failed', e?.code === 'NO_KEY' ? 501 : 500, String(e?.message || e));
    }
  }

  return err('not found', 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return err('internal error', 500, String(e?.message || e));
    }
  }
};
