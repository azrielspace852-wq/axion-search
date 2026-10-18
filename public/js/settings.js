/* Settings page logic */
(function () {
  const s = window.Axn.getSettings();
  const themeSelect = document.getElementById('themeSelect');
  const aiOn = document.getElementById('aiOn');
  const safeOn = document.getElementById('safeOn');
  const toast = document.getElementById('saveToast');

  themeSelect.value = s.theme;
  aiOn.checked = !!s.aiOn;
  safeOn.checked = !!s.safe;

  function toastSaved() {
    toast.textContent = window.Axn.t('saved');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1500);
  }
  function persist() {
    const cur = window.Axn.getSettings();
    cur.theme = themeSelect.value;
    cur.aiOn = aiOn.checked;
    cur.safe = safeOn.checked;
    window.Axn.saveSettings(cur);
    window.Axn.applyTheme(cur.theme);
    toastSaved();
  }

  [themeSelect].forEach(el => el.addEventListener('change', persist));
  [aiOn, safeOn].forEach(el => el.addEventListener('change', persist));

  document.getElementById('exportBtn').addEventListener('click', () => window.Axn.exportData());
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    window.Axn.importData(f, ok => {
      if (ok) { location.reload(); } else { alert('Invalid file.'); }
    });
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all search history?')) {
      window.Axn.Store.del('history');
      toastSaved();
    }
  });

  // Search form redirect
  document.getElementById('searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = document.getElementById('query').value.trim();
    if (q) { await window.Axn.addHistory(q); location.href = `/search?q=${encodeURIComponent(q)}`; }
  });
})();
