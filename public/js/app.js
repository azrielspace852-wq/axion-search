/* ============================================================
 *  AXION Search v5 — shared frontend core
 *  - Storage: IndexedDB (replaces localStorage — point 12)
 *  - i18n: 10 languages, instant DOM re-render + RTL (point 14)
 *  - Theme: dark/light with smooth transitions (point 13)
 *  - Consent / onboarding gate (point 17)
 *  - Growth popups: coffee (10d) + creator (15d) (point 14)
 *  - Sidebar navigation (hamburger + swipe)
 * ============================================================ */
(function () {
  'use strict';
  const DB = window.AxnDB;
  const { LANGS, I18N } = window.AxnI18n;

  const DEFAULT_SETTINGS = { theme: 'dark', lang: 'en', aiOn: true, safe: true };
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let readyResolve;
  const ready = new Promise(res => { readyResolve = res; });

  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const prettyUrl = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname !== '/' ? x.pathname : ''); } catch { return u; } };

  function t(key, lang) {
    const l = lang || settings.lang || 'en';
    const entry = I18N[key]; if (!entry) return key;
    return entry[l] || entry.en || key;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function applyI18n() {
    const langMeta = LANGS.find(l => l.code === settings.lang) || LANGS[0];
    document.documentElement.lang = settings.lang;
    document.documentElement.dir = langMeta.dir;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n'); if (k) el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph'); if (k) el.placeholder = t(k);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const k = el.getAttribute('data-i18n-title'); if (k) el.title = t(k);
    });
    document.dispatchEvent(new CustomEvent('axn:langchange', { detail: { lang: settings.lang } }));
  }

  async function saveSettings(s) {
    settings = s;
    await DB.set('axn_settings', s);
    // Functional cookies kept for edge compatibility; source of truth is IndexedDB.
    document.cookie = `axn_lang=${s.lang}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `axn_safe=${s.safe ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `axn_theme=${s.theme}; path=/; max-age=31536000; SameSite=Lax`;
    applyTheme(s.theme);
    applyI18n();
  }

  async function addHistory(q) {
    const h = await DB.get('axn_history', []);
    await DB.set('axn_history', [q, ...h.filter(x => x !== q)].slice(0, 50));
  }
  async function getHistory() { return DB.get('axn_history', []); }

  async function exportData() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify({ app: 'axion-search', version: 5, exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `axion-search-data-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function importData(file, cb) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const j = JSON.parse(reader.result);
        const ok = j && j.data ? await DB.importAll(j.data) : false;
        cb && cb(ok);
      } catch { cb && cb(false); }
    };
    reader.readAsText(file);
  }

  /* ── Sidebar navigation ─────────────────────────────────── */
  const NAV_ITEMS = [
    { href: '/', key: 'home', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
    { href: '/settings', key: 'settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
    { href: '/docs', key: 'docs', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
    { href: '/sdk', key: 'sdk', icon: 'M16 18l6-6-6-6 M8 6l-6 6 6 6' },
    { href: '/privacy', key: 'privacy', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { href: '/safesearch', key: 'safesearch', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4' },
    { href: '/roadmap', key: 'roadmap', icon: 'M3 3v18h18 M7 14l4-4 4 4 5-5' },
    { href: '/changelog', key: 'changelog', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' }
  ];

  function buildSidebar() {
    const overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; overlay.id = 'sidebarOverlay';
    const aside = document.createElement('aside'); aside.className = 'sidebar'; aside.id = 'sidebar';
    aside.innerHTML = `<div class="sidebar-head"><span class="logo">AXION<span>Search</span></span><button class="icon-btn" id="sidebarClose" aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <nav class="sidebar-nav">${NAV_ITEMS.map(n => `<a href="${n.href}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${n.icon}"/></svg><span data-i18n="${n.key}">${t(n.key)}</span></a>`).join('')}</nav>
      <div class="sidebar-foot"><a class="donate-link" href="https://axion-hub.axn.cc.cd/donate" target="_blank" rel="noopener" data-i18n="donate">Donate</a></div>`;
    document.body.appendChild(overlay); document.body.appendChild(aside);
    const close = () => { aside.classList.remove('open'); overlay.classList.remove('show'); };
    overlay.addEventListener('click', close);
    document.getElementById('sidebarClose').addEventListener('click', close);
    document.addEventListener('click', e => {
      if (e.target.closest('[data-menu-toggle]')) { e.preventDefault(); aside.classList.add('open'); overlay.classList.add('show'); }
    });
    // swipe right edge → open
    let touchX = null;
    document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', e => {
      if (touchX !== null && e.changedTouches[0].clientX - touchX > 70 && touchX < 30) { aside.classList.add('open'); overlay.classList.add('show'); }
      touchX = null;
    }, { passive: true });
  }

  /* ── Modal helper (consent + growth popups) ─────────────── */
  function showModal(html) {
    const wrap = document.createElement('div'); wrap.className = 'modal-overlay'; wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    return {
      close: () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); },
      el: wrap
    };
  }

  /* ── Consent / onboarding gate (point 17) ───────────────── */
  function showBlocked() {
    document.body.classList.add('consent-blocked');
    const m = showModal(`
      <div class="modal-icon blocked-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <h2 data-i18n="blocked_title">${t('blocked_title')}</h2>
      <p data-i18n="blocked_body">${t('blocked_body')}</p>`);
  }

  async function checkConsent() {
    if (sessionStorage.getItem('axn_declined')) { showBlocked(); return false; }
    const accepted = await DB.get('axn_consent_accepted');
    if (accepted) return true;
    return new Promise(resolve => {
      const m = showModal(`
        <div class="modal-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h2 data-i18n="consent_title">${t('consent_title')}</h2>
        <p data-i18n="consent_body">${t('consent_body')}</p>
        <p class="modal-links"><a href="/privacy" data-i18n="privacy_policy">${t('privacy_policy')}</a></p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="consentAccept" data-i18n="accept">${t('accept')}</button>
          <button class="btn btn-ghost" id="consentDecline" data-i18n="decline">${t('decline')}</button>
        </div>`);
      m.el.querySelector('#consentAccept').addEventListener('click', async () => {
        await DB.set('axn_consent_accepted', true);
        m.close(); resolve(true); setTimeout(checkGrowthPopups, 800);
      });
      m.el.querySelector('#consentDecline').addEventListener('click', () => {
        sessionStorage.setItem('axn_declined', '1');
        m.close(); showBlocked(); resolve(false);
      });
    });
  }

  /* ── Growth popups (point 14) ─────────────────────────────
   *  "Buy me a coffee" — first visit + every 10 days.
   *  "Join AXION Labs as a Creator" — first visit + every 15 days.
   *  One popup at a time; coffee takes priority when both are due. */
  const DAY = 86400000;
  async function checkGrowthPopups() {
    const now = Date.now();
    const coffeeLast = await DB.get('popup_coffee_ts');
    const creatorLast = await DB.get('popup_creator_ts');
    const coffeeDue = !coffeeLast || (now - coffeeLast) >= 10 * DAY;
    const creatorDue = !creatorLast || (now - creatorLast) >= 15 * DAY;

    const showCreator = () => {
      DB.set('popup_creator_ts', now);
      const m = showModal(`
        <div class="modal-icon creator-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
        </div>
        <h2 data-i18n="creator_title">${t('creator_title')}</h2>
        <p data-i18n="creator_body">${t('creator_body')}</p>
        <div class="modal-actions">
          <a class="btn btn-primary" href="https://axion-hub.axn.cc.cd/creator" target="_blank" rel="noopener" data-i18n="creator_cta">${t('creator_cta')}</a>
          <button class="btn btn-ghost" id="creatorLater" data-i18n="later">${t('later')}</button>
        </div>`);
      m.el.querySelector('#creatorLater').addEventListener('click', () => m.close());
    };

    if (coffeeDue) {
      DB.set('popup_coffee_ts', now);
      const m = showModal(`
        <div class="modal-icon coffee-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
        </div>
        <h2 data-i18n="coffee_title">${t('coffee_title')}</h2>
        <p data-i18n="coffee_body">${t('coffee_body')}</p>
        <div class="modal-actions">
          <a class="btn btn-primary" href="https://axion-hub.axn.cc.cd/donate" target="_blank" rel="noopener" data-i18n="coffee_cta">${t('coffee_cta')}</a>
          <button class="btn btn-ghost" id="coffeeLater" data-i18n="later">${t('later')}</button>
        </div>`);
      m.el.querySelector('#coffeeLater').addEventListener('click', () => { m.close(); if (creatorDue) setTimeout(showCreator, 400); });
      m.el.querySelector('.btn-primary').addEventListener('click', () => { m.close(); if (creatorDue) setTimeout(showCreator, 400); });
    } else if (creatorDue) {
      showCreator();
    }
  }

  /* ── Topbar controls (delegated, bound once) ────────────── */
  function initControls() {
    // Theme toggle
    document.addEventListener('click', e => {
      if (e.target.closest('[data-theme-toggle]')) {
        const cur = settings.theme === 'dark' ? 'light' : 'dark';
        saveSettings({ ...settings, theme: cur });
      }
    });
    // Language select
    document.querySelectorAll('select[data-lang-select]').forEach(sel => {
      sel.innerHTML = LANGS.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
      sel.value = settings.lang;
      sel.addEventListener('change', () => saveSettings({ ...settings, lang: sel.value }));
    });
    document.addEventListener('axn:langchange', () => {
      document.querySelectorAll('select[data-lang-select]').forEach(sel => { sel.value = settings.lang; });
    });
  }

  /* ── Boot ───────────────────────────────────────────────── */
  (async function init() {
    const stored = await DB.get('axn_settings', {});
    settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    applyTheme(settings.theme);
    applyI18n();
    buildSidebar();
    initControls();
    window.Axn = {
      ready, t, esc, prettyUrl,
      getSettings: () => settings,
      saveSettings, addHistory, getHistory,
      exportData, importData, Store: DB,
      LANGS
    };
    readyResolve();
    const ok = await checkConsent();
    if (ok) checkGrowthPopups();
  })();
})();
