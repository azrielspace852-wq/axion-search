/* Search results page logic */
(function () {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('query');
  const resultsBox = document.getElementById('results');
  const statusBox = document.getElementById('status');
  const tabs = document.getElementById('tabs');
  const aiBox = document.getElementById('aiSummary');
  const aiBody = document.getElementById('aiBody');
  const aiModelLabel = document.getElementById('aiModelLabel');
  const aiToggleBtn = document.getElementById('aiToggleBtn');
  let currentType = 'web';
  let lastQuery = '';
  let allResults = [];
  let shown = 0;
  const PAGE = 10;

  const esc = (s) => window.Axn.esc(s);
  const prettyUrl = (u) => window.Axn.prettyUrl(u);

  aiToggleBtn.addEventListener('click', () => location.href = '/settings');

  function setStatus(text) { statusBox.textContent = text; statusBox.classList.remove('hidden'); }
  function showLoader() {
    resultsBox.className = 'results';
    resultsBox.innerHTML = '<div class="spinner"></div>';
    statusBox.classList.add('hidden');
    document.getElementById('loadMore').style.display = 'none';
  }
  function showSkeleton() {
    resultsBox.className = 'results';
    resultsBox.innerHTML = Array(5).fill('<div class="result"><div class="skeleton" style="height:14px;width:40%;margin-bottom:8px;"></div><div class="skeleton" style="height:20px;width:70%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:90%;"></div></div>').join('');
  }

  /* ── AI Summary ── */
  function renderAiLoading() {
    const s = window.Axn.getSettings();
    if (!s.aiOn) {
      aiBox.classList.remove('hidden');
      aiBody.innerHTML = `<span class="ai-loading">${esc(window.Axn.t('ai_off'))}</span>`;
      aiModelLabel.textContent = '';
      return;
    }
    aiBox.classList.remove('hidden');
    aiModelLabel.textContent = s.aiModel;
    aiBody.innerHTML = `<span class="ai-loading">${esc(window.Axn.t('ai_thinking'))}</span>`;
  }
  function renderAi(data) {
    if (!data || !data.summary) { aiBox.classList.add('hidden'); return; }
    aiBox.classList.remove('hidden');
    aiModelLabel.textContent = data.model || '';
    aiBody.textContent = data.summary;
  }
  function hideAi() { aiBox.classList.add('hidden'); aiBody.innerHTML = ''; }

  async function fetchSummary(q) {
    if (!q) return;
    const s = window.Axn.getSettings();
    renderAiLoading();
    if (!s.aiOn) return;
    try {
      const res = await fetch(`/api/summary?q=${encodeURIComponent(q)}&model=${encodeURIComponent(s.aiModel)}&ai=1&lang=${s.lang}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      renderAi(data);
    } catch (err) {
      aiBody.innerHTML = `<span class="ai-error">${esc(err.message)}</span>`;
    }
  }

  /* ── Renderers ── */
  function renderWeb(items) {
    resultsBox.className = 'results';
    const frag = document.createDocumentFragment();
    items.forEach(r => {
      const div = document.createElement('div');
      div.className = 'result';
      div.innerHTML = `
        <div class="url">${esc(prettyUrl(r.link))}${r.axion ? ' <span class="axion-tag">AXION</span>' : ''}</div>
        <a class="title" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
        <div class="snippet">${esc(r.snippet || '')}</div>`;
      frag.appendChild(div);
    });
    resultsBox.innerHTML = '';
    resultsBox.appendChild(frag);
  }

  function renderGrid(items, kind) {
    resultsBox.className = 'results grid';
    const frag = document.createDocumentFragment();
    items.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card';
      const thumb = r.thumb || (kind === 'audio' ? '' : r.link);
      card.innerHTML = `
        <a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">
          ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="${esc(r.title || '')}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:40px;color:var(--muted);">♪</div>'}
        </a>
        <div class="meta">
          <a class="t" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer" style="color:var(--text);text-decoration:none;">${esc(r.title || 'No title')}</a>
          <div class="s">${esc(r.source || '')}${r.duration ? ' · ' + esc(r.duration) : ''}</div>
        </div>`;
      frag.appendChild(card);
    });
    resultsBox.innerHTML = '';
    resultsBox.appendChild(frag);
  }

  function renderPage() {
    const slice = allResults.slice(0, shown);
    if (currentType === 'web' || currentType === 'news' || currentType === 'apps' || currentType === 'shop' || currentType === 'axion') renderWeb(slice);
    else renderGrid(slice, currentType);
    document.getElementById('loadMore').style.display = allResults.length > shown ? 'block' : 'none';
  }

  document.getElementById('loadMoreBtn').addEventListener('click', () => { shown += PAGE; renderPage(); });

  /* ── Search ── */
  async function search(query, type) {
    lastQuery = query;
    showSkeleton();
    const s = window.Axn.getSettings();
    const url = new URL(location.href);
    url.searchParams.set('q', query);
    url.searchParams.set('type', type);
    history.replaceState({}, '', url);
    if (type === 'web') fetchSummary(query); else hideAi();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}&safe=${s.safe ? '1' : '0'}&lang=${s.lang}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      allResults = data.results || [];
      shown = Math.min(PAGE, allResults.length);
      if (!allResults.length) {
        resultsBox.className = 'results';
        resultsBox.innerHTML = '';
        setStatus(`${window.Axn.t('no_results')} "${query}"`);
      } else {
        setStatus(`${allResults.length} ${window.Axn.t('results_count')} "${query}"`);
        renderPage();
      }
    } catch (err) {
      resultsBox.className = 'results';
      resultsBox.innerHTML = '';
      setStatus(err.message);
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) { window.Axn.addHistory(q); search(q, currentType); }
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

  /* Init dari URL */
  (function init() {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const type = params.get('type') || 'web';
    input.value = q;
    currentType = type;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    if (q) { window.Axn.addHistory(q); search(q, type); }
    else { showLoader(); setStatus(''); }
  })();
})();
