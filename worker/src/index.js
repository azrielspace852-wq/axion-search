import { createSearchEngine } from './search-engine.js';

const API_DOMAIN = 'https://api.search.axn.cc.cd';
const SITE_DOMAIN = 'https://search.xxn.cc.cd';

function responseHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders })
  });
}

function cookieMap(request) {
  const out = Object.create(null);
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function pickLanguage(url, cookies) {
  return (url.searchParams.get('lang') || cookies.axn_lang || 'en').slice(0, 2).toLowerCase();
}

function pickSafe(url, cookies, fallback) {
  const param = url.searchParams.get('safe');
  if (param !== null) return param === '1' || param.toLowerCase() === 'true';
  if (cookies.axn_safe === '0') return false;
  if (cookies.axn_safe === '1') return true;
  return fallback;
}

function errorDetail(error) {
  const message = String(error?.message || 'unknown error');
  // Never expose URLs, headers, or request payloads from upstream errors.
  return message.slice(0, 240);
}

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const apiDomain = env.API_DOMAIN || API_DOMAIN;
    const siteDomain = env.SITE_DOMAIN || SITE_DOMAIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders() });
    }

    if (path === '/' && request.method === 'GET') {
      return json({
        name: 'AXION Search API',
        version: '4.1.0',
        status: 'ok',
        site: siteDomain,
        api: apiDomain,
        docs: `${siteDomain}/docs`,
        endpoints: ['/api/v1/search', '/api/v1/tool/search', '/api/v1/chat', '/api/search', '/api/summary', '/health']
      });
    }

    if (path === '/health' && request.method === 'GET') {
      const engine = createSearchEngine(env);
      return json({
        ok: true,
        ts: Date.now(),
        platform: 'cloudflare-workers',
        proxy: engine.proxyConfigured,
        timeout: engine.TIMEOUT,
        aiConfigured: Boolean(env.AI_KEY_1 || env.AI_KEY_2 || env.AI_KEY_3),
        defaultModel: engine.DEFAULT_MODEL
      });
    }

    const apiPaths = new Set(['/api/v1/tool/search', '/api/v1/search', '/api/v1/chat', '/api/search', '/api/summary']);
    if (!apiPaths.has(path)) return json({ error: 'not found', site: siteDomain, docs: `${siteDomain}/docs` }, 404);
    if (path === '/api/v1/chat' ? request.method !== 'POST' : request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, { Allow: path === '/api/v1/chat' ? 'POST, OPTIONS' : 'GET, OPTIONS' });
    }

    const engine = createSearchEngine(env);
    const cookies = cookieMap(request);
    const lang = pickLanguage(url, cookies);
    const safeDefault = engine.SAFESEARCH_DEFAULT;
    const safe = pickSafe(url, cookies, safeDefault);

    try {
      if (path === '/api/v1/tool/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ error: 'empty query' }, 400);
        const { results } = await engine.runSearch('web', q, { safe, lang });
        return json({
          query: q,
          results: results.slice(0, 10).map((result) => ({
            title: result.title,
            url: result.link,
            snippet: result.snippet,
            source: result.source
          }))
        });
      }

      if (path === '/api/v1/search' || path === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        const type = (url.searchParams.get('type') || 'web').trim().toLowerCase();
        if (!q) return json({ error: 'empty query' }, 400);
        const data = type === 'all'
          ? await engine.runAllSearch(q, { safe, lang })
          : await engine.runSearch(type, q, { safe, lang });
        return json(data);
      }

      if (path === '/api/v1/chat') {
        const contentLength = Number(request.headers.get('content-length') || 0);
        if (contentLength > 256_000) return json({ error: 'request body too large' }, 413);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
        const messages = body?.messages;
        if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages must be a non-empty array' }, 400);
        if (messages.length > 30 || messages.some((m) => typeof m?.content !== 'string' || m.content.length > 12000)) {
          return json({ error: 'messages exceed supported limits' }, 413);
        }
        const result = await engine.chatAI(messages, {
          model: String(body?.model || ''),
          lang: String(body?.lang || lang).slice(0, 2),
          safe: body?.safe !== undefined ? Boolean(body.safe) : safe
        });
        return json(result);
      }

      if (path === '/api/summary') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ error: 'empty query' }, 400);
        const model = url.searchParams.get('model') || '';
        const aiOn = url.searchParams.get('ai') !== '0';
        const { results } = await engine.runSearch('web', q, { safe, lang });
        const out = await engine.summarizeAI(q, results, { model, aiOn, lang });
        if (!out?.summary) {
          return json({ query: q, summary: null, ai: false, reason: out?.reason || 'ai_off', webCount: results.length });
        }
        return json({ query: q, ...out, webCount: results.length });
      }
    } catch (error) {
      const noKey = error?.code === 'NO_KEY';
      const routeName = path.replace('/api/', '') || 'request';
      if (env.SILENT === '0') console.error(`[axn-err] ${routeName}: ${errorDetail(error)}`);
      return json({
        error: noKey ? 'AI not configured' : (path.endsWith('/chat') ? 'chat failed' : path.endsWith('/summary') ? 'summary failed' : 'search failed'),
        detail: errorDetail(error)
      }, noKey ? 501 : 500);
    }

    return json({ error: 'not found' }, 404);
  }
};
