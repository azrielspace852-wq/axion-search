/* Homepage logic: redirect ke /search?q=, trending chips + riwayat */
(function () {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('query');
  const chipsBox = document.getElementById('trendingChips');

  const TRENDING = ['AI news 2026', 'Node.js 22 features', 'privacy search engine', 'cloudflare tunnel tutorial', 'gemini flash lite', 'open source LLM', 'web scraping legal', 'dark mode design'];

  function renderChips() {
    const hist = (window.Axn?.getHistory() || []).slice(0, 6);
    const items = hist.length ? hist : TRENDING.slice(0, 8);
    chipsBox.innerHTML = items.map(q => `<button class="chip" data-q="${window.Axn.esc(q)}">${window.Axn.esc(q)}</button>`).join('');
    chipsBox.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => go(c.dataset.q)));
  }

  function go(q) {
    if (!q) return;
    window.Axn.addHistory(q);
    location.href = `/search?q=${encodeURIComponent(q)}`;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    go(input.value.trim());
  });

  renderChips();
})();
