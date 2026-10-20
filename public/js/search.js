/* Search results v5: tabs [AI][All] far left, default tab = All on submit.
 * Tier-2 client cache (IndexedDB) prevents redundant network requests.
 * Backend auto-selects AI model — no model param is sent. */
(function () {
  window.Axn.ready.then(() => {
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
    let lastQuery = '';
    let lastSummary = null;
    let chatMsgs = [];
    let chatSeeded = false;
    let allResults = [];
    let shown = 0;
    const PAGE = 10;
    const CACHE_TTL = 300000; // 5 minutes — Tier 2 client cache
    const esc = (s) => window.Axn.esc(s);
    const prettyUrl = (u) => window.Axn.prettyUrl(u);
    const DB = window.Axn.Store;

    function setStatus(text) { statusBox.textContent = text; statusBox.classList.remove('hidden'); }
    function showSkeleton() {
      resultsBox.className = 'results';
      resultsBox.innerHTML = Array(5).fill('<div class="result"><div class="skeleton" style="height:14px;width:40%;margin-bottom:8px;"></div><div class="skeleton" style="height:20px;width:70%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:90%;"></div></div>').join('');
    }

    /* ── Tier 2 client cache ─────────────────────────────── */
    async function cacheGet(key) {
      const row = await DB.get('cache_' + key);
      if (row && row.ts && Date.now() - row.ts < CACHE_TTL) return row.data;
      return null;
    }
    function cachePut(key, data) { DB.set('cache_' + key, { ts: Date.now(), data }, CACHE_TTL + 60000); }

    /* ── AI Summary ──────────────────────────────────────── */
    function renderAiLoading() {
      const s = window.Axn.getSettings();
      aiBox.classList.remove('hidden');
      aiModelLabel.textContent = '';
      aiBody.innerHTML = `<span class="ai-loading">${esc(window.Axn.t(s.aiOn ? 'ai_thinking' : 'ai_off'))}</span>`;
    }
    function renderAi(data) {
      if (!data || !data.summary) { aiBox.classList.add('hidden'); lastSummary = null; return; }
      lastSummary = data;
      aiBox.classList.remove('hidden');
      aiModelLabel.textContent = data.model || '';
      aiBody.textContent = data.summary;
    }
    async function fetchSummary(q) {
      const s = window.Axn.getSettings();
      if (!s.aiOn) { aiBox.classList.add('hidden'); return; }
      renderAiLoading();
      const cacheKey = `summary:${s.lang}:${q}`;
      try {
        const cached = await cacheGet(cacheKey);
        if (cached) { renderAi(cached); return; }
        const res = await fetch(`/api/v1/summary?q=${encodeURIComponent(q)}&lang=${s.lang}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
        if (data.summary) cachePut(cacheKey, data);
        renderAi(data);
      } catch (err) {
        aiBody.innerHTML = `<span class="ai-error">${esc(err.message)}</span>`;
      }
    }
    aiBox.addEventListener('click', () => {
      if (!lastQuery) return;
      const aiTab = tabs.querySelector('[data-type="ai"]');
      if (aiTab) aiTab.click();
    });

    /* ── Renderers ───────────────────────────────────────── */
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
            ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="${esc(r.title || '')}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="thumb thumb-placeholder">&#9835;</div>'}
          </a>
          <div class="meta"><a class="t" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.title || 'No title')}</a>
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
          inner = `<div class="all-grid">` + items.map(r => `<div class="card"><a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer"><img src="${esc(r.thumb || r.link)}" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:110px;object-fit:cover;display:block;"/></a><div class="meta" style="padding:6px 9px;font-size:11.5px;">${esc((r.title || '').slice(0, 60))}</div></div>`).join('') + `</div>`;
        }
        return `<div class="all-group"><h3>${title}</h3>${inner}</div>`;
      };
      const html = group(window.Axn.t('tab_web'), data.web, 'list') + group(window.Axn.t('tab_images'), data.images, 'grid') + group(window.Axn.t('tab_videos'), data.videos, 'grid') + group(window.Axn.t('tab_news'), data.news, 'list') + group(window.Axn.t('tab_audio'), data.audio, 'grid');
      resultsBox.innerHTML = html || `<div class="status">${esc(window.Axn.t('no_results'))}</div>`;
    }
    function renderPage() {
      const slice = allResults.slice(0, shown);
      if (['web', 'news', 'apps', 'shop'].includes(currentType)) renderWeb(slice); else renderGrid(slice);
      document.getElementById('loadMore').style.display = allResults.length > shown ? 'block' : 'none';
    }
    document.getElementById('loadMoreBtn').addEventListener('click', () => { shown += PAGE; renderPage(); });

    /* ── AI Mode: chat ───────────────────────────────────── */
    function renderChat() {
      chatMessages.innerHTML = chatMsgs.map(m => {
        if (m.role === 'user') return `<div class="chat-msg user">${esc(m.content)}</div>`;
        const src = m.sources && m.sources.length ? `<div class="chat-sources">${m.sources.slice(0, 5).map((s, i) => `<a href="${esc(s.link || s.url)}" target="_blank" rel="noopener">[${i + 1}] ${esc((s.title || '').slice(0, 40))}</a>`).join('')}</div>` : '';
        return `<div class="chat-msg axion">${esc(m.content)}${src}</div>`;
      }).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    function showTyping() {
      const d = document.createElement('div'); d.className = 'chat-typing'; d.id = 'typingIndicator';
      d.innerHTML = `${esc(window.Axn.t('ai_typing'))} <span></span><span></span><span></span>`;
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
      try {
        const res = await fetch('/api/v1/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatMsgs.map(m => ({ role: m.role === 'axion' ? 'model' : 'user', content: m.content })), lang: s.lang, safe: s.safe })
        });
        const data = await res.json().catch(() => ({}));
        removeTyping();
        if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
        chatMsgs.push({ role: 'axion', content: data.reply || '(empty)', sources: data.sources });
        renderChat();
      } catch (err) {
        removeTyping();
        chatMsgs.push({ role: 'axion', content: 'Error: ' + err.message });
        renderChat();
      }
    }
    chatSend.addEventListener('click', () => { const v = chatInput.value.trim(); if (v) { chatInput.value = ''; sendChat(v); } });
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = chatInput.value.trim(); if (v) { chatInput.value = ''; sendChat(v); } } });

    /* ── Search main ─────────────────────────────────────── */
    async function search(query, type) {
      lastQuery = query;
      const s = window.Axn.getSettings();
      const url = new URL(location.href);
      url.searchParams.set('q', query); url.searchParams.set('type', type);
      history.replaceState({}, '', url);
      if (type === 'ai') {
        resultsBox.innerHTML = ''; resultsBox.className = 'results';
        aiBox.classList.add('hidden');
        aiChat.classList.remove('hidden');
        statusBox.classList.add('hidden');
        document.getElementById('loadMore').style.display = 'none';
        seedChatIfNeeded();
        return;
      }
      aiChat.classList.add('hidden');
      showSkeleton();
      if (type === 'all' || type === 'web') fetchSummary(query); else aiBox.classList.add('hidden');
      const cacheKey = `search:${type}:${s.safe ? 1 : 0}:${s.lang}:${query}`;
      try {
        const cached = await cacheGet(cacheKey);
        let data = cached;
        if (!data) {
          const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&type=${type}&safe=${s.safe ? '1' : '0'}&lang=${s.lang}`);
          data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
          cachePut(cacheKey, data);
        }
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
      } catch (err) {
        resultsBox.className = 'results'; resultsBox.innerHTML = ''; setStatus(err.message);
      }
    }

    /* On submit: default active tab = All (point 13) */
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      window.Axn.addHistory(q);
      chatSeeded = false; lastSummary = null;
      currentType = 'all';
      tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.type === 'all'));
      search(q, 'all');
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

    // Re-render status text when language switches instantly
    document.addEventListener('axn:langchange', () => {
      if (lastQuery && statusBox.textContent) {
        if (currentType === 'all') setStatus(`${(allResults.length) || 0} ${window.Axn.t('results_count')} "${lastQuery}"`);
      }
    });

    (function init() {
      const params = new URLSearchParams(location.search);
      const q = params.get('q') || '';
      const type = params.get('type') || 'all';
      input.value = q;
      currentType = type;
      tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
      if (q) { window.Axn.addHistory(q); search(q, type); }
      else { resultsBox.innerHTML = '<div class="spinner"></div>'; setStatus(''); }
    })();
  });
})();
