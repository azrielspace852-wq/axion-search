/* ============================================================
 *  AXION Search v3 — shared frontend core
 *  i18n (11 bahasa), theme, cookies, localStorage, import/export
 *  Default: English. Semua data user disimpan di localStorage.
 * ============================================================ */
(function () {
  'use strict';

  /* ── i18n dictionary ── */
  const I18N = {
    search_ph:       { en:'Search the web…', id:'Telusuri web…', es:'Buscar en la web…', fr:'Rechercher sur le web…', de:'Web durchsuchen…', zh:'搜索网页…', ja:'ウェブ検索…', ar:'ابحث في الويب…', hi:'वेब खोजें…', ru:'Поиск в интернете…', pt:'Pesquisar na web…' },
    search_btn:      { en:'Search', id:'Cari', es:'Buscar', fr:'Rechercher', de:'Suchen', zh:'搜索', ja:'検索', ar:'بحث', hi:'खोजें', ru:'Найти', pt:'Pesquisar' },
    tab_web:         { en:'Web', id:'Web', es:'Web', fr:'Web', de:'Web', zh:'网页', ja:'ウェブ', ar:'ويب', hi:'वेब', ru:'Веб', pt:'Web' },
    tab_images:      { en:'Images', id:'Gambar', es:'Imágenes', fr:'Images', de:'Bilder', zh:'图片', ja:'画像', ar:'صور', hi:'छवियाँ', ru:'Изображения', pt:'Imagens' },
    tab_videos:      { en:'Videos', id:'Video', es:'Vídeos', fr:'Vidéos', de:'Videos', zh:'视频', ja:'動画', ar:'فيديوهات', hi:'वीडियो', ru:'Видео', pt:'Vídeos' },
    tab_news:        { en:'News', id:'Berita', es:'Noticias', fr:'Actualités', de:'News', zh:'新闻', ja:'ニュース', ar:'أخبار', hi:'समाचार', ru:'Новости', pt:'Notícias' },
    tab_audio:       { en:'Audio', id:'Audio', es:'Audio', fr:'Audio', de:'Audio', zh:'音频', ja:'音声', ar:'صوت', hi:'ऑडियो', ru:'Аудио', pt:'Áudio' },
    tab_apps:        { en:'Apps', id:'Aplikasi', es:'Apps', fr:'Applications', de:'Apps', zh:'应用', ja:'アプリ', ar:'تطبيقات', hi:'ऐप्स', ru:'Приложения', pt:'Apps' },
    tab_shop:        { en:'Shop', id:'Toko', es:'Tienda', fr:'Boutique', de:'Shop', zh:'购物', ja:'ショップ', ar:'تسوق', hi:'दुकान', ru:'Магазин', pt:'Loja' },
    tab_axion:       { en:'AXION', id:'AXION', es:'AXION', fr:'AXION', de:'AXION', zh:'AXION', ja:'AXION', ar:'AXION', hi:'AXION', ru:'AXION', pt:'AXION' },
    ai_summary:      { en:'AI Summary', id:'Ringkasan AI', es:'Resumen IA', fr:'Résumé IA', de:'KI-Zusammenfassung', zh:'AI 摘要', ja:'AI 要約', ar:'ملخص الذكاء الاصطناعي', hi:'AI सारांश', ru:'AI-резюме', pt:'Resumo IA' },
    ai_thinking:     { en:'Composing summary…', id:'Menyusun ringkasan…', es:'Componiendo resumen…', fr:'Composition du résumé…', de:'Zusammenfassung wird erstellt…', zh:'正在生成摘要…', ja:'要約を作成中…', ar:'جارٍ تكوين الملخص…', hi:'सारांश बनाया जा रहा है…', ru:'Составление резюме…', pt:'Compondo resumo…' },
    ai_off:          { en:'AI is off. Enable in Settings.', id:'AI nonaktif. Aktifkan di Settings.', es:'IA desactivada. Actívala en Ajustes.', fr:'IA désactivée. Activez-la dans Paramètres.', de:'KI aus. In Einstellungen aktivieren.', zh:'AI 已关闭，可在设置中开启。', ja:'AI はオフです。設定で有効に。', ar:'الذكاء الاصطناعي مطفأ. فعّله في الإعدادات.', hi:'AI बंद है। सेटिंग्स में चालू करें।', ru:'AI выключен. Включите в настройках.', pt:'IA desativada. Ative em Configurações.' },
    settings:        { en:'Settings', id:'Pengaturan', es:'Ajustes', fr:'Paramètres', de:'Einstellungen', zh:'设置', ja:'設定', ar:'الإعدادات', hi:'सेटिंग्स', ru:'Настройки', pt:'Configurações' },
    privacy:         { en:'Privacy', id:'Privasi', es:'Privacidad', fr:'Confidentialité', de:'Datenschutz', zh:'隐私', ja:'プライバシー', ar:'الخصوصية', hi:'गोपनीयता', ru:'Конфиденциальность', pt:'Privacidade' },
    docs:            { en:'Docs', id:'Dokumentasi', es:'Documentación', fr:'Documentation', de:'Dokumentation', zh:'文档', ja:'ドキュメント', ar:'الوثائق', hi:'दस्तावेज़', ru:'Документация', pt:'Documentação' },
    trending:        { en:'Trending now', id:'Sedang tren', es:'Tendencias', fr:'Tendances', de:'Trends', zh:'热门趋势', ja:'トレンド', ar:'الرائجة', hi:'ट्रेंडिंग', ru:'В тренде', pt:'Em alta' },
    no_results:      { en:'No results for', id:'Tidak ada hasil untuk', es:'Sin resultados para', fr:'Aucun résultat pour', de:'Keine Ergebnisse für', zh:'没有找到结果', ja:'結果がありません', ar:'لا توجد نتائج لـ', hi:'कोई परिणाम नहीं', ru:'Нет результатов для', pt:'Sem resultados para' },
    results_count:   { en:'results for', id:'hasil untuk', es:'resultados para', fr:'résultats pour', de:'Ergebnisse für', zh:'条结果，关于', ja:'件の結果', ar:'نتيجة لـ', hi:'परिणाम', ru:'результатов для', pt:'resultados para' },
    theme:           { en:'Theme', id:'Tema', es:'Tema', fr:'Thème', de:'Design', zh:'主题', ja:'テーマ', ar:'السمة', hi:'थीम', ru:'Тема', pt:'Tema' },
    dark:            { en:'Dark', id:'Gelap', es:'Oscuro', fr:'Sombre', de:'Dunkel', zh:'深色', ja:'ダーク', ar:'داكن', hi:'डार्क', ru:'Тёмная', pt:'Escuro' },
    light:           { en:'Light', id:'Terang', es:'Claro', fr:'Clair', de:'Hell', zh:'浅色', ja:'ライト', ar:'فاتح', hi:'लाइट', ru:'Светлая', pt:'Claro' },
    language:        { en:'Language', id:'Bahasa', es:'Idioma', fr:'Langue', de:'Sprache', zh:'语言', ja:'言語', ar:'اللغة', hi:'भाषा', ru:'Язык', pt:'Idioma' },
    ai_enable:       { en:'Enable AI summary', id:'Aktifkan ringkasan AI', es:'Activar resumen IA', fr:'Activer le résumé IA', de:'KI-Zusammenfassung aktivieren', zh:'启用 AI 摘要', ja:'AI 要約を有効化', ar:'تفعيل ملخص الذكاء الاصطناعي', hi:'AI सारांश चालू करें', ru:'Включить AI-резюме', pt:'Ativar resumo IA' },
    ai_model:        { en:'AI model', id:'Model AI', es:'Modelo IA', fr:'Modèle IA', de:'KI-Modell', zh:'AI 模型', ja:'AI モデル', ar:'نموذج الذكاء الاصطناعي', hi:'AI मॉडल', ru:'AI-модель', pt:'Modelo IA' },
    safesearch:      { en:'SafeSearch', id:'SafeSearch', es:'SafeSearch', fr:'SafeSearch', de:'SafeSearch', zh:'安全搜索', ja:'セーフサーチ', ar:'البحث الآمن', hi:'सेफसर्च', ru:'Безопасный поиск', pt:'SafeSearch' },
    safesearch_desc: { en:'Filter explicit content', id:'Saring konten eksplisit', es:'Filtrar contenido explícito', fr:'Filtrer le contenu explicite', de:'Explizite Inhalte filtern', zh:'过滤露骨内容', ja:'不適切なコンテンツをフィルタ', ar:'تصفية المحتوى الصريح', hi:'स्पष्ट सामग्री फ़िल्टर करें', ru:'Фильтр откровенного контента', pt:'Filtrar conteúdo explícito' },
    export_data:     { en:'Export data', id:'Ekspor data', es:'Exportar datos', fr:'Exporter les données', de:'Daten exportieren', zh:'导出数据', ja:'データをエクスポート', ar:'تصدير البيانات', hi:'डेटा निर्यात करें', ru:'Экспорт данных', pt:'Exportar dados' },
    import_data:     { en:'Import data', id:'Impor data', es:'Importar datos', fr:'Importer les données', de:'Daten importieren', zh:'导入数据', ja:'データをインポート', ar:'استيراد البيانات', hi:'डेटा आयात करें', ru:'Импорт данных', pt:'Importar dados' },
    clear_history:   { en:'Clear search history', id:'Hapus riwayat pencarian', es:'Borrar historial', fr:'Effacer l\'historique', de:'Verlauf löschen', zh:'清除搜索历史', ja:'検索履歴を消去', ar:'مسح سجل البحث', hi:'खोज इतिहास साफ़ करें', ru:'Очистить историю', pt:'Limpar histórico' },
    saved:           { en:'Saved', id:'Tersimpan', es:'Guardado', fr:'Enregistré', de:'Gespeichert', zh:'已保存', ja:'保存しました', ar:'تم الحفظ', hi:'सहेजा गया', ru:'Сохранено', pt:'Salvo' },
    home_tagline:    { en:'Private, fast, and AI-powered meta search — no tracking, no ads.', id:'Mesin pencari meta privat, cepat, dan bertenaga AI — tanpa pelacak, tanpa iklan.', es:'Búsqueda meta privada, rápida y con IA — sin rastreo, sin anuncios.', fr:'Recherche méta privée, rapide et propulsée par IA — sans suivi, sans pub.', de:'Private, schnelle Meta-Suche mit KI — kein Tracking, keine Werbung.', zh:'私密、快速、AI 驱动的元搜索引擎 — 无追踪、无广告。', ja:'プライベートで高速な AI 搭載メタ検索 — 追跡なし、広告なし。', ar:'بحث فعلي خاص وسريع مدعوم بالذكاء الاصطناعي — لا تتبع ولا إعلانات.', hi:'निजी, तेज़ और AI-संचालित मेटा खोज — कोई ट्रैकिंग नहीं, कोई विज्ञापन नहीं।', ru:'Приватный быстрый метапоиск с ИИ — без отслеживания и рекламы.', pt:'Meta-busca privada, rápida e com IA — sem rastreamento, sem anúncios.' },
    feat1_t: { en:'Multi-provider', id:'Multi-provider', es:'Multi-proveedor', fr:'Multi-fournisseurs', de:'Multi-Provider', zh:'多源聚合', ja:'マルチプロバイダー', ar:'مقدمون متعددون', hi:'मल्टी-प्रोवाइडर', ru:'Мультипровайдер', pt:'Multi-provedor' },
    feat1_d: { en:'Rotates across engines for rich, reliable results.', id:'Rotasi lintas mesin untuk hasil kaya & andal.', es:'Rota entre motores para resultados ricos.', fr:'Rotation entre moteurs pour des résultats riches.', de:'Rotiert über Suchmaschinen für reiche Ergebnisse.', zh:'多引擎轮换，结果丰富可靠。', ja:'複数エンジンをローテーション。', ar:'يدور بين المحركات لنتائج غنية.', hi:'समृद्ध परिणामों के लिए इंजनों में रोटेशन।', ru:'Ротация движков для богатых результатов.', pt:'Roda entre motores para resultados ricos.' },
    feat2_t: { en:'AI summary', id:'Ringkasan AI', es:'Resumen IA', fr:'Résumé IA', de:'KI-Zusammenfassung', zh:'AI 摘要', ja:'AI 要約', ar:'ملخص الذكاء الاصطناعي', hi:'AI सारांश', ru:'AI-резюме', pt:'Resumo IA' },
    feat2_d: { en:'Grounded answers — never hallucinates.', id:'Jawaban berbasis fakta — tidak pernah mengarang.', es:'Respuestas fundamentadas — nunca inventa.', fr:'Réponses fondées — n\'invente jamais.', de:'Fundierte Antworten — halluziniert nie.', zh:'基于事实的回答，绝不虚构。', ja:'事実に基づく回答 — 幻覚なし。', ar:'إجابات مستندة — لا يختلق أبداً.', hi:'आधारित उत्तर — कभी गलत नहीं।', ru:'Обоснованные ответы — без галлюцинаций.', pt:'Respostas fundamentadas — nunca inventa.' },
    feat3_t: { en:'11 languages', id:'11 bahasa', es:'11 idiomas', fr:'11 langues', de:'11 Sprachen', zh:'11 种语言', ja:'11言語', ar:'11 لغة', hi:'11 भाषाएँ', ru:'11 языков', pt:'11 idiomas' },
    feat3_d: { en:'Interface & AI reply in your language.', id:'Antarmuka & AI menjawab dalam bahasamu.', es:'Interfaz e IA en tu idioma.', fr:'Interface et IA dans votre langue.', de:'Oberfläche & KI in deiner Sprache.', zh:'界面与 AI 均使用您的语言。', ja:'UI も AI もあなたの言語で。', ar:'الواجهة والذكاء الاصطناعي بلغتك.', hi:'इंटरफ़ेस और AI आपकी भाषा में।', ru:'Интерфейс и ИИ на вашем языке.', pt:'Interface e IA no seu idioma.' },
    feat4_t: { en:'Your data, your device', id:'Data Anda, perangkat Anda', es:'Tus datos, tu dispositivo', fr:'Vos données, votre appareil', de:'Ihre Daten, Ihr Gerät', zh:'数据只在您的设备', ja:'データはあなたのデバイスに', ar:'بياناتك، جهازك', hi:'आपका डेटा, आपका डिवाइस', ru:'Ваши данные — ваше устройство', pt:'Seus dados, seu dispositivo' },
    feat4_d: { en:'Stored locally. Export & import anytime.', id:'Tersimpan lokal. Ekspor & impor kapan saja.', es:'Guardado localmente. Exporta e importa.', fr:'Stocké localement. Export/import.', de:'Lokal gespeichert. Export/Import.', zh:'本地存储，随时可导入导出。', ja:'ローカル保存。エクスポート/インポート可能。', ar:'محفوظ محلياً. صدّر واستورد.', hi:'स्थानीय रूप से संग्रहीत। निर्यात/आयात।', ru:'Хранится локально. Экспорт/импорт.', pt:'Armazenado localmente. Exportar/importar.' }
  };

  const LANGS = [
    { code: 'en', name: 'English' }, { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' }, { code: 'zh', name: '中文' },
    { code: 'ja', name: '日本語' }, { code: 'ar', name: 'العربية' },
    { code: 'hi', name: 'हिन्दी' }, { code: 'ru', name: 'Русский' },
    { code: 'pt', name: 'Português' }
  ];

  /* ── Storage (localStorage, namespace axn_) ── */
  const Store = {
    get(k, def) {
      try { const v = localStorage.getItem('axn_' + k); return v === null ? def : JSON.parse(v); }
      catch { return def; }
    },
    set(k, v) { try { localStorage.setItem('axn_' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('axn_' + k); } catch {} }
  };

  /* ── Settings (default) ── */
  const DEFAULT_SETTINGS = { theme: 'dark', lang: 'en', aiOn: true, aiModel: 'gemini-3.5-flash-lite', safe: true };
  function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {})); }
  function saveSettings(s) {
    Store.set('settings', s);
    // Sync ke cookie agar server juga tahu (seperti mesin pencari umumnya)
    document.cookie = `axn_lang=${s.lang}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `axn_safe=${s.safe ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `axn_theme=${s.theme}; path=/; max-age=31536000; SameSite=Lax`;
  }

  /* ── Search history ── */
  function addHistory(q) {
    const h = Store.get('history', []);
    const nh = [q, ...h.filter(x => x !== q)].slice(0, 50);
    Store.set('history', nh);
  }
  function getHistory() { return Store.get('history', []); }

  /* ── Theme & lang apply ── */
  function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }
  function t(key, lang) {
    const s = getSettings();
    const l = lang || s.lang || 'en';
    const entry = I18N[key];
    if (!entry) return key;
    return entry[l] || entry.en || key;
  }
  function applyI18n() {
    const s = getSettings();
    document.documentElement.lang = s.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k, s.lang);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph');
      if (k) el.placeholder = t(k, s.lang);
    });
  }

  /* ── Import / Export ── */
  function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('axn_')) data[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify({ app: 'axion-search', version: 3, exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `axion-search-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importData(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        if (j && j.data) {
          Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith('axn_')) localStorage.setItem(k, v); });
          cb && cb(true);
        } else cb && cb(false);
      } catch { cb && cb(false); }
    };
    reader.readAsText(file);
  }

  /* ── Common: inject topbar actions (theme toggle, lang) if present ── */
  function initCommon() {
    const s = getSettings();
    applyTheme(s.theme);
    applyI18n();

    // Theme toggle button
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.innerHTML = s.theme === 'dark'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      btn.addEventListener('click', () => {
        const cur = getSettings();
        cur.theme = cur.theme === 'dark' ? 'light' : 'dark';
        saveSettings(cur);
        applyTheme(cur.theme);
        initCommon(); // re-render icons
      });
    });

    // Language select
    document.querySelectorAll('[data-lang-select]').forEach(sel => {
      sel.innerHTML = LANGS.map(l => `<option value="${l.code}" ${l.code === s.lang ? 'selected' : ''}>${l.name}</option>`).join('');
      sel.addEventListener('change', () => {
        const cur = getSettings();
        cur.lang = sel.value;
        saveSettings(cur);
        applyI18n();
        location.reload();
      });
    });
  }

  /* ── Escape HTML ── */
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const prettyUrl = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname !== '/' ? x.pathname : ''); } catch { return u; } };

  /* ── Expose ── */
  window.Axn = { t, getSettings, saveSettings, Store, addHistory, getHistory, applyTheme, applyI18n, exportData, importData, initCommon, esc, prettyUrl, LANGS, DEFAULT_SETTINGS };

  document.addEventListener('DOMContentLoaded', initCommon);
  // Jika script dimuat setelah DOM ready (defer/module), langsung jalankan
  if (document.readyState !== 'loading') initCommon();
})();
