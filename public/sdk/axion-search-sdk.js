/*
 * AXION Search SDK v4.2 — UMD, zero runtime dependencies.
 * Site: https://search.xxn.cc.cd | API: https://api.search.axn.cc.cd
 * AI uses live Google AI Studio streaming with automatic Gemma 4 model/key rotation.
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
    this.apiBase = trimBase(opts.apiBase || opts.base || DEFAULT_API);
    this.siteBase = trimBase(opts.siteBase || opts.base || DEFAULT_SITE);
    this.base = this.apiBase;
    this.timeout = Math.max(1000, Number(opts.timeout) || 90000);
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
          var error = new Error(data && (data.detail || data.error) ? (data.detail || data.error) : 'AXION API request failed (HTTP ' + response.status + ')');
          error.status = response.status; error.response = data; throw error;
        }
        return data;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          var timeoutError = new Error('AXION API request timed out after ' + this.timeout + 'ms');
          timeoutError.code = 'ETIMEDOUT'; throw timeoutError;
        }
        throw error;
      } finally { if (timer !== null) clearTimeout(timer); }
    }
    return Promise.reject(new Error('This runtime does not provide fetch(); AXION Search SDK requires a Fetch-compatible runtime.'));
  };

  AxionSDK.prototype._stream = async function (method, path, params, body, onEvent) {
    if (typeof fetch !== 'function') throw new Error('Streaming requires a Fetch-compatible runtime.');
    var query = new URLSearchParams();
    Object.keys(params || {}).forEach(function (key) { if (params[key] !== undefined && params[key] !== null) query.set(key, String(params[key])); });
    var url = this.apiBase + path + (query.toString() ? '?' + query.toString() : '');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, this.timeout) : null;
    var collected = { text: '', model: '', sources: [], result: null };
    try {
      var options = { method: method, headers: Object.assign({ Accept: 'text/event-stream' }, this.headers) };
      if (controller) options.signal = controller.signal;
      if (method === 'POST') {
        options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
        options.body = JSON.stringify(body || {});
      }
      var response = await fetch(url, options);
      if (!response.ok) {
        var raw = await response.text().catch(function () { return ''; });
        var detail = 'AXION API request failed (HTTP ' + response.status + ')';
        try { var j = JSON.parse(raw); detail = j.detail || j.error || detail; } catch (_) {}
        throw new Error(detail);
      }
      if (!response.body || !response.body.getReader) throw new Error('The API did not return a readable stream.');
      var reader = response.body.getReader(); var decoder = new TextDecoder(); var buffer = '';
      function dispatch(rawEvent) {
        var data = rawEvent.split(/\r?\n/).filter(function (line) { return line.indexOf('data:') === 0; }).map(function (line) { return line.slice(5).trim(); }).join('\n');
        if (!data) return;
        var event;
        try { event = JSON.parse(data); } catch (_) { return; }
        if (event.type === 'meta' && event.model) collected.model = event.model;
        if (event.type === 'delta') collected.text += event.text || '';
        if (event.type === 'sources') collected.sources = event.sources || [];
        if (event.type === 'complete') {
          collected.result = event;
          if (typeof event.summary === 'string') collected.text = event.summary;
          if (typeof event.reply === 'string') collected.text = event.reply;
          if (event.model) collected.model = event.model;
          if (Array.isArray(event.sources)) collected.sources = event.sources;
        }
        if (event.type === 'error') throw new Error(event.error || 'AI request failed');
        if (typeof onEvent === 'function') onEvent(event);
      }
      try {
        while (true) {
          var part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          var boundary;
          while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
            var current = buffer.slice(0, boundary);
            var delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
            buffer = buffer.slice(boundary + delimiter.length);
            dispatch(current);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) dispatch(buffer);
      } finally { try { reader.releaseLock(); } catch (_) {} }
      return collected;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        var timeoutError = new Error('AXION AI stream timed out after ' + this.timeout + 'ms');
        timeoutError.code = 'ETIMEDOUT'; throw timeoutError;
      }
      throw error;
    } finally { if (timer !== null) clearTimeout(timer); }
  };

  AxionSDK.prototype.search = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/search', {
      q: query, type: opts.type || 'all', safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };
  AxionSDK.prototype.summary = function (query, opts) {
    opts = opts || {};
    var body = { q: query, ai: opts.ai !== false, safe: opts.safe !== false, lang: opts.lang || 'en' };
    if (Array.isArray(opts.results)) {
      return this._req('POST', '/api/summary', { stream: '0' }, Object.assign(body, { results: opts.results.slice(0, 10) }));
    }
    return this._req('GET', '/api/summary', {
      q: query, ai: opts.ai === false ? '0' : '1', safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en'
    });
  };
  AxionSDK.prototype.summaryStream = function (query, opts, onEvent) {
    opts = opts || {};
    return this._stream('POST', '/api/summary', { stream: '1' }, {
      q: query, ai: opts.ai !== false, safe: opts.safe !== false, lang: opts.lang || 'en', stream: true,
      results: Array.isArray(opts.results) ? opts.results.slice(0, 10) : undefined
    }, onEvent);
  };
  AxionSDK.prototype.chat = function (messages, opts) {
    opts = opts || {};
    return this._req('POST', '/api/v1/chat', {}, { messages: messages, lang: opts.lang || 'en', safe: opts.safe !== false });
  };
  AxionSDK.prototype.chatStream = function (messages, opts, onEvent) {
    opts = opts || {};
    return this._stream('POST', '/api/v1/chat', { stream: '1' }, { messages: messages, lang: opts.lang || 'en', safe: opts.safe !== false, stream: true }, onEvent);
  };
  AxionSDK.prototype.aiToolSearch = function (query, opts) {
    opts = opts || {};
    return this._req('GET', '/api/v1/tool/search', { q: query, safe: opts.safe === false ? '0' : '1', lang: opts.lang || 'en' });
  };
  AxionSDK.prototype.health = function () { return this._req('GET', '/health', {}); };
  AxionSDK.prototype.searchUrl = function (query) { return this.siteBase + '/search?q=' + encodeURIComponent(query); };
  AxionSDK.prototype.shortUrl = function (query) { return this.siteBase + '/s/' + encodeURIComponent(query); };
  AxionSDK.prototype.openaiToolSpec = function () {
    return { type: 'function', function: {
      name: 'axion_web_search',
      description: 'Search the web via AXION Search. Returns titles, URLs, and snippets to ground AI answers.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] }
    } };
  };
  AxionSDK.prototype.models = function () { return ['gemma-4-31b-it', 'gemma-4-26b-a4b-it']; };
  return AxionSDK;
});
