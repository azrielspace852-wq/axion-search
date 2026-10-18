/*
 * AXION Search SDK v4.1 — UMD, zero runtime dependencies.
 * API:  https://api.search.axn.cc.cd
 * Site: https://search.xxn.cc.cd
 *
 * const axn = new AxionSDK();
 * await axn.search('neural networks', { type: 'web', lang: 'en' });
 * await axn.summary('what is AXION?', { lang: 'en' });
 * await axn.chat([{ role: 'user', content: 'Explain this' }]);
 * await axn.aiToolSearch('latest news');
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxionSDK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEFAULT_API = 'https://api.search.axn.cc.cd';
  var DEFAULT_SITE = 'https://search.xxn.cc.cd';

  function trimBase(value) { return String(value).replace(/\/+$/, ''); }

  function AxionSDK(opts) {
    opts = opts || {};
    // `base` is kept as a backward-compatible override for callers using v4.0.
    this.apiBase = trimBase(opts.apiBase || opts.base || DEFAULT_API);
    this.siteBase = trimBase(opts.siteBase || opts.base || DEFAULT_SITE);
    this.base = this.apiBase;
    this.timeout = Math.max(1000, Number(opts.timeout) || 45000);
    this.headers = Object.assign({}, opts.headers || {});
  }

  AxionSDK.prototype._req = async function (method, path, params, body) {
    var query = new URLSearchParams();
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null) query.set(key, String(value));
    });
    var url = this.apiBase + path + (query.toString() ? '?' + query.toString() : '');

    if (typeof fetch === 'function') {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, this.timeout) : null;
      try {
        var options = { method: method, headers: Object.assign({}, this.headers) };
        if (controller) options.signal = controller.signal;
        if (method === 'POST') {
          options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
          options.body = JSON.stringify(body || {});
        }
        var response = await fetch(url, options);
        var raw = await response.text();
        var data;
        try { data = raw ? JSON.parse(raw) : null; }
        catch (_) { throw new Error('AXION API returned invalid JSON (HTTP ' + response.status + ')'); }
        if (!response.ok) {
          var error = new Error(data && data.error ? data.error : 'AXION API request failed (HTTP ' + response.status + ')');
          error.status = response.status;
          error.response = data;
          throw error;
        }
        return data;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          var timeoutError = new Error('AXION API request timed out after ' + this.timeout + 'ms');
          timeoutError.code = 'ETIMEDOUT';
          throw timeoutError;
        }
        throw error;
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }

    // Legacy Node.js fallback for runtimes without global fetch.
    return new Promise(function (resolve, reject) {
      var mod;
      try { mod = url.startsWith('https:') ? require('https') : require('http'); }
      catch (error) { reject(error); return; }
      var payload = method === 'POST' ? JSON.stringify(body || {}) : null;
      var headers = Object.assign({}, this.headers);
      if (payload) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
      var req = mod.request(url, { method: method, headers: headers }, function (res) {
        var raw = '';
        res.on('data', function (chunk) { raw += chunk; });
        res.on('end', function () {
          var data;
          try { data = raw ? JSON.parse(raw) : null; }
          catch (error) { reject(error); return; }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            var apiError = new Error(data && data.error ? data.error : 'AXION API request failed (HTTP ' + res.statusCode + ')');
            apiError.status = res.statusCode;
            apiError.response = data;
            reject(apiError);
          } else resolve(data);
        });
      }.bind(this));
      req.on('error', reject);
      req.setTimeout(this.timeout, function () { req.destroy(Object.assign(new Error('AXION API request timed out'), { code: 'ETIMEDOUT' })); });
      if (payload) req.write(payload);
      req.end();
    }.bind(this));
  };

  AxionSDK.prototype.search = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/search', {
      q: query, type: opts.type || 'web', safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };
  AxionSDK.prototype.summary = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/summary', {
      q: query, model: opts.model || 'gemini-2.5-flash', ai: opts.ai === false ? '0' : '1', safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };
  AxionSDK.prototype.chat = function (messages, opts) {
    opts = opts || {};
    return this._req('POST', '/api/v1/chat', {}, {
      messages: messages, model: opts.model || 'gemini-2.5-flash', lang: opts.lang || 'en', safe: opts.safe !== false
    });
  };
  AxionSDK.prototype.aiToolSearch = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/tool/search', {
      q: query, safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };
  AxionSDK.prototype.health = function () { return this._req('GET', '/health', {}); };
  AxionSDK.prototype.searchUrl = function (query) { return this.siteBase + '/search?q=' + encodeURIComponent(query); };
  AxionSDK.prototype.shortUrl = function (query) { return this.siteBase + '/s/' + encodeURIComponent(query); };
  AxionSDK.prototype.openaiToolSpec = function () {
    return {
      type: 'function',
      function: {
        name: 'axion_web_search',
        description: 'Search the web via AXION Search. Returns titles, URLs, and snippets to ground AI answers.',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] }
      }
    };
  };
  return AxionSDK;
});
