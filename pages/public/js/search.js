/* Search results v4.2: All-first search tabs, live AI streams, result-grounded chat. */
(function () {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('query');
  const resultsBox = document.getElementById('results');
  const statusBox = document.getElementById('status');
  const tabs = document.getElementById('tabs');
  const aiBox = document.getElementById('aiSummary');
  const aiBody = document.getElementById('aiBody');
  const aiModelLabel = document.getElementById('aiModelLabel');
  const aiChat = document.getElementById('aiChat');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  let currentType = 'all';
  let activeSearchId = 0;
  let summaryAbort = null;
  let summaryRequestId = 0;
  let lastQuery = '';
  let lastSummary = null;
  let chatMsgs = [];
  let chatSeeded = false;
  let allResults = [];
  let shown = 0;
  const PAGE = 10;
  const esc = (s) => window.Axn.esc(s);
  const prettyUrl = (u) => window.Axn.prettyUrl(u);

  function setStatus(text) { statusBox.textContent = text; statusBox.classList.remove('hidden'); }
  function showSkeleton() {
    resultsBox.className = 'results';
    resultsBox.innerHTML = Array(5).fill('<div class="result"><div class="skeleton" style="height:14px;width:40%;margin-bottom:8px;"></div><div class="skeleton" style="height:20px;width:70%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:90%;"></div></div>').join('');
  }

  /* ── Streaming API reader ── */
  async function readEventStream(response, onEvent) {
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let message = `HTTP ${response.status}`;
      try { const data = JSON.parse(raw); message = data.detail || data.error || message; } catch {}
      throw new Error(message);
    }
    if (!response.body || !response.body.getReader) throw new Error('Streaming responses are not supported by this browser.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const dispatch = (chunk) => {
      const data = chunk.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data) return;
      let parsed;
      try { parsed = JSON.parse(data); } catch { return; }
      onEvent(parsed);
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const part = buffer.slice(0, boundary);
          const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
          buffer = buffer.slice(boundary + delimiter.length);
          dispatch(part);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) dispatch(buffer);
    } finally { try { reader.releaseLock(); } catch {} }
  }

  /* ── AI Summary — Google AI Studio live streaming, server-selected Gemma 4 model ── */
  function renderAiLoading() {
    const s = window.Axn.getSettings();
    aiBox.classList.remove('hidden');
    aiModelLabel.textContent = 'Gemma 4 · automatic rotation';
    aiBody.textContent = s.aiOn ? window.Axn.t('ai_thinking') : window.Axn.t('ai_off');
  }
  function renderAi(data) {
    if (!data || !data.summary) { aiBox.classList.add('hidden'); lastSummary = null; return; }
    lastSummary = data;
    aiBox.classList.remove('hidden');
    aiModelLabel.textContent = data.model || 'Gemma 4';
    aiBody.textContent = data.summary;
  }
  async function fetchSummary(q, results) {
    const s = window.Axn.getSettings();
    if (!s.aiOn) { aiBox.classList.add('hidden'); return; }
    if (summaryAbort) summaryAbort.abort();
    summaryAbort = new AbortController();
    const requestId = ++summaryRequestId;
    let collected = '';
    let activeModel = '';
    renderAiLoading();
    try {
      const res = await fetch('/api/summary?stream=1', {
        method: 'POST', signal: summaryAbort.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ q, results: (results || []).slice(0, 10), lang: s.lang, safe: s.safe, ai: true, stream: true })
      });
      await readEventStream(res, event => {
        if (requestId !== summaryRequestId) return;
        if (event.type === 'status') aiBody.textContent = event.message || window.Axn.t('ai_thinking');
        if (event.type === 'meta') { activeModel = event.model || 'Gemma 4'; aiModelLabel.textContent = activeModel; }
        if (event.type === 'delta') { collected += event.text || ''; aiBody.textContent = collected; }
        if (event.type === 'complete') {
          if (event.model) activeModel = event.model;
          if (typeof event.summary === 'string') collected = event.summary;
          if (event.summary === null) { aiBox.classList.add('hidden'); lastSummary = null; }
          else renderAi({ summary: collected, model: activeModel });
        }
        if (event.type === 'error') throw new Error(event.error || 'AI request failed');
      });
      if (requestId === summaryRequestId && collected && !lastSummary) renderAi({ summary: collected, model: activeModel });
    } catch (err) {
      if (err.name === 'AbortError' || requestId !== summaryRequestId) return;
      aiBody.textContent = err.message;
    }
  }
  aiBox.addEventListener('click', () => {
    if (!lastSummary && !lastQuery) return;
    const aiTab = tabs.querySelector('[data-type="ai"]');
    if (aiTab) aiTab.click();
  });

  /* ── Renderers ── */
  function renderWeb(items) {
    resultsBox.className = 'results';
    const frag = document.createDocumentFragment();
    items.forEach(r => {
      const div = document.createElement('div'); div.className = 'result';
      div.innerHTML = `<div class="url">${esc(prettyUrl(r.link))}</div>
        <a class="title" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
        <div class="snippet">${esc(r.snippet || '')}</div>`;
      frag.appendChild(div);
    });
    resultsBox.innerHTML = ''; resultsBox.appendChild(frag);
  }
  function renderGrid(items) {
    resultsBox.className = 'results grid';
    const frag = document.createDocumentFragment();
    items.forEach(r => {
      const card = document.createElement('div'); card.className = 'card';
      const thumb = r.thumb || '';
      card.innerHTML = `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">
          ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="${esc(r.title || '')}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--muted);">&#9835;</div>'}
        </a>
        <div class="meta"><a class="t" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer" style="color:var(--text);text-decoration:none;">${esc(r.title || 'No title')}</a>
        <div class="s">${esc(r.source || '')}${r.duration ? ' · ' + esc(r.duration) : ''}</div></div>`;
      frag.appendChild(card);
    });
    resultsBox.innerHTML = ''; resultsBox.appendChild(frag);
  }
  function renderAll(data) {
    resultsBox.className = 'results';
    const group = (title, items, kind) => {
      if (!items || !items.length) return '';
      let inner = '';
      if (kind === 'list') {
        inner = items.slice(0, 5).map(r => `<div class="result" style="padding:8px 0;"><a class="title" style="font-size:15px;" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a><div class="snippet" style="font-size:13px;">${esc(r.snippet || '')}</div></div>`).join('');
      } else {
        inner = `<div class="all-grid">` + items.map(r => `<div class="card"><a href="${esc(r.link)}" target="_blank"><img src="${esc(r.thumb || r.link)}" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:110px;object-fit:cover;display:block;"/></a><div class="meta" style="padding:6px 9px;font-size:11.5px;">${esc((r.title || '').slice(0, 60))}</div></div>`).join('') + `</div>`;
      }
      return `<div class="all-group"><h3>${title}</h3>${inner}</div>`;
    };
    const html = group('Web', data.web, 'list') + group('Images', data.images, 'grid') + group('Videos', data.videos, 'grid') + group('News', data.news, 'list') + group('Audio', data.audio, 'grid');
    resultsBox.innerHTML = html || '<div class="status">No results.</div>';
  }
  function renderPage() {
    const slice = allResults.slice(0, shown);
    if (['web', 'news', 'apps', 'shop'].includes(currentType)) renderWeb(slice); else renderGrid(slice);
    document.getElementById('loadMore').style.display = allResults.length > shown ? 'block' : 'none';
  }
  document.getElementById('loadMoreBtn').addEventListener('click', () => { shown += PAGE; renderPage(); });

  /* ── AI Mode: chat ── */
  function renderChat() {
    chatMessages.innerHTML = chatMsgs.map(m => {
      if (m.role === 'user') return `<div class="chat-msg user">${esc(m.content)}</div>`;
      const src = m.sources && m.sources.length ? `<div class="chat-sources">${m.sources.slice(0, 5).map((s, i) => `<a href="${esc(s.link)}" target="_blank">[${i + 1}] ${esc((s.title || '').slice(0, 40))}</a>`).join('')}</div>` : '';
      return `<div class="chat-msg axion">${esc(m.content)}${src}</div>`;
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function showTyping() {
    const d = document.createElement('div'); d.className = 'chat-typing'; d.id = 'typingIndicator';
    d.innerHTML = 'AXION sedang menulis <span></span><span></span><span></span>';
    chatMessages.appendChild(d);
  }
  function removeTyping() { const t = document.getElementById('typingIndicator'); if (t) t.remove(); }
  function seedChatIfNeeded() {
    if (chatSeeded) return;
    chatSeeded = true;
    chatMsgs = [{ role: 'user', content: lastQuery }];
    if (lastSummary && lastSummary.summary) {
      chatMsgs.push({ role: 'axion', content: lastSummary.summary, sources: null });
      renderChat();
    } else {
      renderChat();
      sendChat(lastQuery, true);
    }
  }
  async function sendChat(text, skipPush) {
    if (!skipPush) { chatMsgs.push({ role: 'user', content: text }); renderChat(); }
    showTyping();
    const s = window.Axn.getSettings();
    const assistant = { role: 'axion', content: '', sources: [] };
    let attached = false;
    const attach = () => { if (!attached) { attached = true; removeTyping(); chatMsgs.push(assistant); } };
    try {
      const res = await fetch('/api/v1/chat?stream=1', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ messages: chatMsgs.map(m => ({ role: m.role === 'axion' ? 'model' : 'user', content: m.content })), lang: s.lang, safe: s.safe, stream: true })
      });
      await readEventStream(res, event => {
        if (event.type === 'status') {
          const typing = document.getElementById('typingIndicator');
          if (typing) typing.firstChild.textContent = event.message || 'Searching…';
        }
        if (event.type === 'sources') assistant.sources = event.sources || [];
        if (event.type === 'delta') { attach(); assistant.content += event.text || ''; renderChat(); }
        if (event.type === 'complete') {
          attach();
          if (typeof event.reply === 'string') assistant.content = event.reply;
          if (Array.isArray(event.sources)) assistant.sources = event.sources;
          renderChat();
        }
        if (event.type === 'error') throw new Error(event.error || 'AI request failed');
      });
      if (!attached) { removeTyping(); }
    } catch (err) {
      removeTyping();
      if (attached) assistant.content = (assistant.content ? assistant.content + '\n\n' : '') + 'Error: ' + err.message;
      else chatMsgs.push({ role: 'axion', content: 'Error: ' + err.message });
      renderChat();
    }
  }
  chatSend.addEventListener('click', () => { const v = chatInput.value.trim(); if (v) { chatInput.value = ''; sendChat(v); } });
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = chatInput.value.trim(); if (v) { chatInput.value = ''; sendChat(v); } } });

  /* ── Search utama; default to the All vertical ── */
  async function search(query, type) {
    type = (!type || type === 'site') ? 'all' : type;
    const requestId = ++activeSearchId;
    lastQuery = query;
    const s = window.Axn.getSettings();
    const url = new URL(location.href);
    url.searchParams.set('q', query); url.searchParams.set('type', type);
    history.replaceState({}, '', url);

    if (type === 'ai') {
      if (summaryAbort) summaryAbort.abort();
      resultsBox.innerHTML = ''; resultsBox.className = 'results';
      aiBox.classList.add('hidden');
      aiChat.classList.remove('hidden');
      statusBox.classList.add('hidden');
      document.getElementById('loadMore').style.display = 'none';
      seedChatIfNeeded();
      return;
    }
    aiChat.classList.add('hidden');
    if (type === 'all' || type === 'web') renderAiLoading(); else aiBox.classList.add('hidden');
    showSkeleton();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&safe=${s.safe ? '1' : '0'}&lang=${encodeURIComponent(s.lang)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      if (requestId !== activeSearchId) return;
      if (type === 'all') {
        allResults = []; shown = 0;
        renderAll(data);
        setStatus(`${data.count || 0} ${window.Axn.t('results_count')} "${query}"`);
      } else {
        allResults = data.results || [];
        shown = Math.min(PAGE, allResults.length);
        if (!allResults.length) { resultsBox.className = 'results'; resultsBox.innerHTML = ''; setStatus(`${window.Axn.t('no_results')} "${query}"`); }
        else { setStatus(`${allResults.length} ${window.Axn.t('results_count')} "${query}"`); renderPage(); }
      }
      if (type === 'all' || type === 'web') fetchSummary(query, type === 'all' ? (data.web || []) : (data.results || []));
    } catch (err) {
      if (requestId !== activeSearchId) return;
      resultsBox.className = 'results'; resultsBox.innerHTML = ''; setStatus(err.message);
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) { await window.Axn.addHistory(q); chatSeeded = false; lastSummary = null; search(q, currentType === 'ai' ? 'all' : currentType); }
  });
  tabs.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const type = btn.dataset.type;
    if (type === currentType) return;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    currentType = type;
    if (lastQuery) search(lastQuery, type);
  });

  (function init() {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const requestedType = params.get('type');
    const type = (!requestedType || requestedType === 'site') ? 'all' : requestedType;
    input.value = q;
    currentType = type;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    if (q) { window.Axn.addHistory(q); search(q, type); }
    else { resultsBox.innerHTML = '<div class="spinner"></div>'; setStatus(''); }
  })();
})();
