/* ============================================================
 *  AXION Search SDK v4 — UMD, zero dependencies
 *  Usage:
 *    const axn = new AxionSDK({ base: 'https://axion-search.axn.cc.cd' });
 *    await axn.search(q, { type:'web', safe:true, lang:'en' });
 *    await axn.summary(q, { model:'gemini-2.5-flash', lang:'en' });
 *    await axn.chat([{role:'user', content:'...'}], { lang:'id' });
 *    await axn.aiToolSearch('berita terbaru');   // untuk layanan AI eksternal
 *    axn.searchUrl('kucing');   // /search?q=kucing
 *    axn.shortUrl('kucing');    // /s/kucing
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxionSDK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function AxionSDK(opts) {
    opts = opts || {};
    this.base = (opts.base || 'https://axion-search.axn.cc.cd').replace(/\/+$/, '');
    this.timeout = opts.timeout || 100000;
  }
  AxionSDK.prototype._req = function (method, path, params, body) {
    var self = this;
    var qs = Object.keys(params || {}).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var url = this.base + path + (qs ? '?' + qs : '');
    var fetchOpts = method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) } : {};
    if (typeof fetch === 'function') {
      return Promise.race([
        fetch(url, fetchOpts).then(function (r) { return r.json(); }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, self.timeout); })
      ]);
    }
    return new Promise(function (resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      var req = mod.request(url, method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' } } : {}, function (res) {
        var b = ''; res.on('data', function (c) { b += c; });
        res.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      req.setTimeout(self.timeout, function () { req.destroy(new Error('timeout')); });
      if (method === 'POST') req.write(JSON.stringify(body || {}));
      req.end();
    });
  };
  AxionSDK.prototype.search = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/search', { q: query, type: opts.type || 'web', safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en' });
  };
  AxionSDK.prototype.summary = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/summary', { q: query, model: opts.model || 'gemini-2.5-flash', ai: '1', lang: opts.lang || 'en' });
  };
  AxionSDK.prototype.chat = function (messages, opts) {
    opts = opts || {};
    return this._req('POST', '/api/v1/chat', {}, { messages: messages, model: opts.model || 'gemini-2.5-flash', lang: opts.lang || 'en', safe: opts.safe !== false });
  };
  AxionSDK.prototype.aiToolSearch = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/tool/search', { q: query, safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en' });
  };
  AxionSDK.prototype.health = function () { return this._req('GET', '/health', {}); };
  AxionSDK.prototype.searchUrl = function (query) { return this.base + '/search?q=' + encodeURIComponent(query); };
  AxionSDK.prototype.shortUrl = function (query) { return this.base + '/s/' + encodeURIComponent(query); };
  AxionSDK.prototype.openaiToolSpec = function () {
    return { type: 'function', function: { name: 'axion_web_search', description: 'Search the web via AXION Search. Returns up-to-date titles, URLs and snippets to ground AI answers.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] } } };
  };
  return AxionSDK;
});
