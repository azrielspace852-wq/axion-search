/* Settings page v5 — AI model selection removed (backend auto-routes, point 10).
 * Donate link added (point 14). All storage via IndexedDB. */
(function () {
  window.Axn.ready.then(() => {
    const s = window.Axn.getSettings();
    const themeSelect = document.getElementById('themeSelect');
    const langSelect = document.getElementById('langSelect');
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
      toastSaved();
    }
    themeSelect.addEventListener('change', persist);
    aiOn.addEventListener('change', persist);
    safeOn.addEventListener('change', persist);

    document.getElementById('exportBtn').addEventListener('click', () => window.Axn.exportData());
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      window.Axn.importData(f, ok => { if (ok) location.reload(); else alert('Invalid file.'); });
    });
    document.getElementById('clearBtn').addEventListener('click', async () => {
      if (confirm(window.Axn.t('clear_history') + '?')) {
        await window.Axn.Store.del('axn_history');
        toastSaved();
      }
    });

    document.getElementById('searchForm').addEventListener('submit', e => {
      e.preventDefault();
      const q = document.getElementById('query').value.trim();
      if (q) { window.Axn.addHistory(q); location.href = `/search?q=${encodeURIComponent(q)}`; }
    });
  });
})();
