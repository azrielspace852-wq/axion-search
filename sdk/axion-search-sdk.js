/* ============================================================
 *  AXION Search SDK v5 — UMD, zero dependencies
 *  Rebuilt for the new architecture (Cloudflare Worker API).
 *  Works in: Node.js · Vanilla JS (browser) · External AI agents
 *
 *  Usage:
 *    const axn = new AxionSDK({ base: 'https://api.search.axn.cc.cd' });
 *    await axn.search(q, { type:'web', safe:true, lang:'en' });
 *    await axn.summary(q, { lang:'id' });                 // model auto-selected
 *    await axn.chat([{role:'user', content:'...'}], { lang:'id' });
 *    await axn.aiToolSearch('berita terbaru');            // for AI agents
 *    axn.openaiToolSpec();                                 // OpenAI tool schema
 *    axn.searchUrl('kucing');                              // human-friendly URL
 *    await axn.health();
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxionSDK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_BASE = 'https://api.search.axn.cc.cd';

  function AxionSDK(opts) {
    opts = opts || {};
    this.base = (opts.base || DEFAULT_BASE).replace(/\/+$/, '');
    this.timeout = opts.timeout || 30000;
  }

  AxionSDK.prototype._req = function (method, path, params, body) {
    var self = this;
    var qs = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = this.base + path + (qs ? '?' + qs : '');
    var fetchOpts = method === 'POST'
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }
      : { method: 'GET' };

    if (typeof fetch === 'function') {
      return Promise.race([
        fetch(url, fetchOpts).then(function (r) { return r.json(); }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, self.timeout); })
      ]);
    }
    // Node.js fallback (no fetch — Node < 18)
    return new Promise(function (resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      var req = mod.request(url, method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' } } : {}, function (res) {
        var b = '';
        res.on('data', function (c) { b += c; });
        res.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      req.setTimeout(self.timeout, function () { req.destroy(new Error('timeout')); });
      if (method === 'POST') req.write(JSON.stringify(body || {}));
      req.end();
    });
  };

  /* Standard search — type: web|images|videos|news|audio|apps|shop|all */
  AxionSDK.prototype.search = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/search', {
      q: query, type: opts.type || 'web',
      safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };

  /* Grounded AI summary — backend auto-selects & rotates the AI model. */
  AxionSDK.prototype.summary = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/summary', { q: query, lang: opts.lang || 'en' });
  };

  /* AI chat mode — re-searches the latest message for fresh grounding. */
  AxionSDK.prototype.chat = function (messages, opts) {
    opts = opts || {};
    return this._req('POST', '/api/v1/chat', {}, {
      messages: messages, lang: opts.lang || 'en', safe: opts.safe !== false
    });
  };

  /* Compact, structured results for external AI agents / tools. */
  AxionSDK.prototype.aiToolSearch = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/tool/search', {
      q: query, safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };

  AxionSDK.prototype.health = function () { return this._req('GET', '/health', {}); };

  AxionSDK.prototype.searchUrl = function (query) {
    return 'https://search.axn.cc.cd/search?q=' + encodeURIComponent(query);
  };

  /* OpenAI-compatible function-tool schema — drop into your agent's tools array. */
  AxionSDK.prototype.openaiToolSpec = function () {
    return {
      type: 'function',
      function: {
        name: 'axion_web_search',
        description: 'Search the web via AXION Search. Returns up-to-date titles, URLs and snippets to ground AI answers.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            lang: { type: 'string', description: 'ISO 639-1 language code (en, id, zh, ja, ko, ar, es, fr, de, hi)', default: 'en' },
            safe: { type: 'boolean', description: 'Enable SafeSearch filter', default: true }
          },
          required: ['query']
        }
      }
    };
  };

  return AxionSDK;
});
