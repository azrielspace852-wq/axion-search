/* Homepage v5: redirect to /search, history dropdown on focus, personalization */
(function () {
  window.Axn.ready.then(() => {
    const form = document.getElementById('searchForm');
    const input = document.getElementById('query');
    const chipsBox = document.getElementById('trendingChips');
    const persoTitle = document.getElementById('persoTitle');
    const dropdown = document.getElementById('historyDropdown');
    const TRENDING = ['AI news 2026', 'Cloudflare Workers tutorial', 'privacy search engine', 'open source LLM', 'dark mode design', 'Node.js 22 features', 'web search API comparison', 'AXION Labs creator'];

    function go(q) {
      if (!q) return;
      window.Axn.addHistory(q);
      location.href = `/search?q=${encodeURIComponent(q)}`;
    }

    async function renderChips() {
      const hist = (await window.Axn.getHistory() || []).slice(0, 8);
      const items = hist.length ? hist : TRENDING.slice(0, 8);
      if (persoTitle && hist.length) persoTitle.textContent = window.Axn.t('history_title');
      chipsBox.innerHTML = items.map(q => `<button class="chip" data-q="${window.Axn.esc(q)}">${window.Axn.esc(q)}</button>`).join('');
      chipsBox.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => go(c.dataset.q)));
    }

    async function renderDropdown() {
      const hist = (await window.Axn.getHistory() || []).slice(0, 8);
      if (!hist.length) { dropdown.classList.remove('show'); return; }
      dropdown.innerHTML = `
        <div class="hd-title">${window.Axn.t('history_title')}</div>
        ${hist.map(q => `<div class="hd-item" data-q="${window.Axn.esc(q)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>${window.Axn.esc(q)}</span>
        </div>`).join('')}`;
      dropdown.querySelectorAll('.hd-item').forEach(it => it.addEventListener('click', () => go(it.dataset.q)));
      dropdown.classList.add('show');
    }
    function hideDropdown() { setTimeout(() => dropdown.classList.remove('show'), 150); }

    input.addEventListener('focus', renderDropdown);
    input.addEventListener('click', renderDropdown);
    input.addEventListener('blur', hideDropdown);
    input.addEventListener('input', () => { if (input.value.trim()) dropdown.classList.remove('show'); else renderDropdown(); });
    document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) dropdown.classList.remove('show'); });
    form.addEventListener('submit', e => { e.preventDefault(); go(input.value.trim()); });

    renderChips();
  });
})();
