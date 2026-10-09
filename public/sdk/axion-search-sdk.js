/* ============================================================
 *  AXION Search SDK — UMD, zero dependencies, ~2KB
 *  Usage:
 *    const axn = new AxionSDK({ base: 'https://axion-search.axn.cc.cd' });
 *    await axn.search(q, { type:'web', safe:true, lang:'en' });
 *    await axn.summary(q, { model:'gemini-3.5-flash-lite', lang:'en' });
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxionSDK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function AxionSDK(opts) {
    opts = opts || {};
    this.base = (opts.base || 'https://axion-search.axn.cc.cd').replace(/\/+$/, '');
    this.timeout = opts.timeout || 20000;
  }

  AxionSDK.prototype._get = function (path, params) {
    var self = this;
    var qs = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = this.base + path + (qs ? '?' + qs : '');
    if (typeof fetch === 'function') {
      return Promise.race([
        fetch(url).then(function (r) { return r.json(); }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, self.timeout); })
      ]);
    }
    // Node fallback
    return new Promise(function (resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      mod.get(url, function (res) {
        var body = '';
        res.on('data', function (c) { body += c; });
        res.on('end', function () { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      }).on('error', reject).setTimeout(self.timeout, function () { reject(new Error('timeout')); });
    });
  };

  AxionSDK.prototype.search = function (query, opts) {
    opts = opts || {};
    return this._get('/api/search', {
      q: query,
      type: opts.type || 'web',
      safe: opts.safe === false ? '0' : '1',
      lang: opts.lang || 'en'
    });
  };

  AxionSDK.prototype.summary = function (query, opts) {
    opts = opts || {};
    return this._get('/api/summary', {
      q: query,
      model: opts.model || 'gemini-3.5-flash-lite',
      ai: '1',
      lang: opts.lang || 'en'
    });
  };

  AxionSDK.prototype.health = function () { return this._get('/health', {}); };

  // Direct results-page URL (for browser search engines)
  AxionSDK.prototype.searchUrl = function (query) { return this.base + '/search?q=' + encodeURIComponent(query); };

  return AxionSDK;
});
