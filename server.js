/* ============================================================
 *  AXION Search v3 — server
 *  Multi-provider meta search + AI summary (grounded, no hallucination)
 *  Multi-language, safeSearch, AXION site priority, rotating AI keys.
 *  Mode SILENT (default): tidak ada output ke console.
 * ============================================================ */
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const cp      = require('cookie-parser');
const path    = require('path');

const app = express();
app.use(cors());
app.use(cp());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SILENT = process.env.SILENT !== '0';
if (SILENT) { console.log = () => {}; console.info = () => {}; console.warn = () => {}; }
// Error TETAP ditulis ke stderr meski SILENT=1 — kalau tidak, mustahil debug.
const logErr = (...a) => process.stderr.write('[axion-err] ' + a.map(x => (x && x.stack) ? x.stack : String(x?.message || x)).join(' ') + '\n');

const PORT = process.env.PORT || 3000;
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'https://axion-search.axn.cc.cd';
const SAFESEARCH_DEFAULT = process.env.SAFESEARCH_DEFAULT !== '0';

const AI_KEYS = [process.env.AI_KEY_1, process.env.AI_KEY_2, process.env.AI_KEY_3].filter(Boolean);
const ALLOWED_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemma-4-31b-it', 'gemma-3-27b-it'];
const DEFAULT_MODEL = ALLOWED_MODELS.includes(process.env.AI_MODEL_DEFAULT) ? process.env.AI_MODEL_DEFAULT : 'gemini-3.5-flash-lite';
let aiKeyIdx = 0;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HDR = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache', 'Pragma': 'no-cache'
};

/* ── Util ─────────────────────────────────────────────────── */
const absolute = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };
const safeJson = (s) => { if (!s) return null; try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/&quot;/g, '"')); } catch { return null; } } };
const blocked = (html = '') => /unusual traffic|captcha|are you a robot|verify you|sorry/i.test(html);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dedupe = (arr, key = 'link') => { const s = new Set(); return arr.filter(r => { const k = r[key] || r.title; if (!k || s.has(k)) return false; s.add(k); return true; }); };
const pickLang = (req) => (req.query.lang || req.cookies?.axn_lang || 'en').slice(0, 2).toLowerCase();

const NSFW = /porn|xxx|sex|nsfw|nude|hentai|onlyfans|brazzers|xnxx|xvideos|pornhub/i;
const applySafe = (q, on) => on ? `${q} -porn -xxx -nsfw` : q;
const filterSafe = (results, on) => on ? results.filter(r => !NSFW.test((r.title || '') + ' ' + (r.link || '') + ' ' + (r.snippet || ''))) : results;

/* ── Deteksi kata kunci AXION ─────────────────────────────── */
const AXION_RE = /(^|\s)(axion|axn|neuralis|axn\.cc|axion-search)(\s|$)/i;
const isAxionQuery = (q) => AXION_RE.test(q);

/* ============================================================
 *  PROVIDER: Web
 * ============================================================ */
async function webGoogle(q, safeOn) {
  const url = `https://www.google.com/search?num=20&hl=en&q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.google.com/' }, timeout: 12000, validateStatus: () => true });
  if (blocked(data)) throw new Error('google blocked');
  const $ = cheerio.load(data);
  const out = [];
  $('div.g').each((_, el) => {
    const $a = $(el).find('a').first();
    const link = absolute($a.attr('href'), 'https://www.google.com');
    const title = $(el).find('h3').first().text().trim();
    const snippet = $(el).find('div[data-sncf], .VwiC3b, .IsZvec').first().text().trim() || $(el).find('span.st').text().trim();
    if (title && link && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('google empty');
  return out;
}

async function webBing(q, safeOn, lang = 'en') {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(applySafe(q, safeOn))}&setlang=${lang}&cc=US&count=30`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.bing.com/' }, timeout: 15000 });
  if (blocked(data)) throw new Error('bing blocked');
  const $ = cheerio.load(data);
  const out = [];
  // FIX: selector lama `#b_results > li.b_algo` sudah usang. Coba beberapa
  // varian, lalu fallback ke `h2 a` apa pun yang link-nya eksternal.
  $('#b_results li.b_algo, #b_results .b_algo, li.b_algo').each((_, el) => {
    const $a = $(el).find('h2 a').first();
    const title = $a.text().trim();
    const link = absolute($a.attr('href'), 'https://www.bing.com');
    const snippet = $(el).find('.b_caption p').text().trim() || $(el).find('p').first().text().trim();
    if (title && link) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) {
    $('h2 a, h3 a').each((_, el) => {
      const $a = $(el);
      const title = $a.text().trim();
      const link = absolute($a.attr('href'), 'https://www.bing.com');
      if (title && /^https?:\/\//.test(link) && !/bing\.com|microsoft\.com|msn\.com|live\.com/i.test(link)) {
        const snippet = $a.closest('li, div').find('p').first().text().trim();
        out.push({ title, link, snippet, source: hostOf(link) });
      }
    });
  }
  if (!out.length) throw new Error('bing empty');
  return out;
}

async function webDuckDuckGo(q, safeOn) {
  // FIX: POST harus pakai form body q=... (bukan null). Endpoint html DDG
  // membaca query dari body, bukan dari query string.
  const url = `https://html.duckduckgo.com/html/`;
  const body = new URLSearchParams({ q: applySafe(q, safeOn), kl: 'wt-wt' });
  const { data } = await axios.post(url, body, { headers: { ...HDR, Referer: 'https://duckduckgo.com/', 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
  const $ = cheerio.load(data);
  const out = [];
  $('.result').each((_, el) => {
    const $a = $(el).find('.result__a').first();
    const raw = $a.attr('href') || '';
    const m = raw.match(/uddg=([^&]+)/);
    const link = m ? decodeURIComponent(m[1]) : absolute(raw, 'https://duckduckgo.com');
    const title = $a.text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('ddg empty');
  return out;
}

async function webMojeek(q, safeOn) {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await axios.get(url, { headers: HDR, timeout: 12000 });
  const $ = cheerio.load(data);
  const out = [];
  $('ul.results-standard > li').each((_, el) => {
    const $a = $(el).find('a.ob').first();
    const link = $a.attr('href') || '';
    const title = $a.text().trim();
    const snippet = $(el).find('p.s').text().trim();
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('mojeek empty');
  return out;
}
async function webGoogleBasic(q, safeOn) {
  // Google versi HTML dasar (gbv=1) — jauh lebih jarang diblok daripada
  // google.com/search biasa. Hasil dalam <a href="/url?q=...">.
  const url = `https://www.google.com/search?gbv=1&num=20&hl=en&q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.google.com/' }, timeout: 12000, validateStatus: () => true, maxRedirects: 5 });
  if (blocked(data)) throw new Error('google basic blocked');
  const $ = cheerio.load(data);
  const out = [];
  $('a[href^="/url?q="]').each((_, el) => {
    const $a = $(el);
    const raw = $a.attr('href') || '';
    const m = raw.match(/[?&]q=([^&]+)/);
    const link = m ? decodeURIComponent(m[1]) : '';
    const title = $a.text().trim();
    if (title && /^https?:\/\//.test(link) && !/google\.com|youtube\.com/i.test(link)) {
      const snippet = $a.parent().next('div, span, td').text().trim().slice(0, 300);
      out.push({ title, link, snippet, source: hostOf(link) });
    }
  });
  if (!out.length) throw new Error('google basic empty');
  return out;
}

/* ============================================================
 *  PROVIDER: Images
 * ============================================================ */
async function imgBing(q, safeOn) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(applySafe(q, safeOn))}&first=1`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.bing.com/' }, timeout: 15000 });
  const $ = cheerio.load(data);
  const out = [];
  $('a.iusc').each((_, el) => {
    const meta = safeJson($(el).attr('m'));
    if (!meta) return;
    const src = meta.murl || ''; const thumb = meta.turl || '';
    if (!src) return;
    out.push({ title: (meta.t || '').trim(), link: src, thumb, source: hostOf(src) });
  });
  if (!out.length) throw new Error('bing img empty');
  return out;
}

async function imgDuckDuckGo(q, safeOn) {
  // DDG image JSON endpoint (membutuhkan vqd)
  const vqdHtml = await axios.get(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`, { headers: HDR, timeout: 10000 });
  const vqd = (vqdHtml.data.match(/vqd=['"]([^'"]+)['"]/) || [])[1];
  if (!vqd) throw new Error('ddg vqd fail');
  const url = `https://duckduckgo.com/i.js?o=json&q=${encodeURIComponent(applySafe(q, safeOn))}&vqd=${vqd}&f=,,,&p=${safeOn ? 1 : -1}`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://duckduckgo.com/' }, timeout: 12000 });
  const out = (data.results || []).map(r => ({ title: r.title, link: r.image, thumb: r.thumbnail, source: hostOf(r.image) }));
  if (!out.length) throw new Error('ddg img empty');
  return out;
}

/* ============================================================
 *  PROVIDER: Videos
 * ============================================================ */
async function vidBing(q, safeOn) {
  const url = `https://www.bing.com/videos/search?q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.bing.com/' }, timeout: 15000 });
  const $ = cheerio.load(data);
  const out = [];
  $('.mc_vtvc').each((_, el) => {
    const meta = safeJson($(el).attr('m'));
    if (!meta) return;
    const link = meta.p || meta.vurl || '';
    if (!link) return;
    out.push({ title: (meta.t || '').trim(), link, thumb: meta.imgurl || meta.thumbnailUrl || '', source: meta.pub || meta.provider || hostOf(link), duration: meta.d || '' });
  });
  if (!out.length) throw new Error('bing vid empty');
  return out;
}

async function vidYouTube(q, safeOn) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(applySafe(q, safeOn))}&sp=${safeOn ? 'EgQQARgB' : ''}`;
  const { data } = await axios.get(url, { headers: HDR, timeout: 15000 });
  const m = data.match(/ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s) || data.match(/var ytInitialData\s*=\s*(\{.*?\});/s);
  if (!m) throw new Error('yt parse fail');
  const j = safeJson(m[1]);
  const items = j?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  const out = [];
  for (const it of items) {
    const v = it.videoRenderer; if (!v) continue;
    const vid = v.videoId;
    out.push({
      title: v.title?.runs?.[0]?.text || '',
      link: `https://www.youtube.com/watch?v=${vid}`,
      thumb: v.thumbnail?.thumbnails?.[0]?.url || '',
      source: v.longBylineText?.runs?.[0]?.text || 'YouTube',
      duration: v.lengthText?.simpleText || ''
    });
  }
  if (!out.length) throw new Error('yt empty');
  return out;
}

/* ============================================================
 *  PROVIDER: News (Google News RSS — andal, tanpa key)
 * ============================================================ */
async function newsGoogle(q, safeOn, lang = 'en') {
  const hl = { id: 'id', en: 'en', es: 'es', fr: 'fr', de: 'de', zh: 'zh-Hans', ja: 'ja', ar: 'ar', hi: 'hi', ru: 'ru', pt: 'pt' }[lang] || 'en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(applySafe(q, safeOn))}&hl=${hl}&gl=US&ceid=US:en`;
  const { data } = await axios.get(url, { headers: HDR, timeout: 12000 });
  const $ = cheerio.load(data, { xmlMode: true });
  const out = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
    const pub = $(el).find('pubDate').text().trim();
    if (title && link) out.push({ title, link, snippet, source: pub, date: pub });
  });
  if (!out.length) throw new Error('news empty');
  return out;
}

async function newsBing(q, safeOn) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(applySafe(q, safeOn))}&format=rss`;
  const { data } = await axios.get(url, { headers: HDR, timeout: 12000 });
  const $ = cheerio.load(data, { xmlMode: true });
  const out = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
    if (title && link) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('bing news empty');
  return out;
}

/* ============================================================
 *  PROVIDER: Audio (iTunes Search API — gratis, tanpa key)
 * ============================================================ */
async function audioITunes(q) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=all&limit=30`;
  const { data } = await axios.get(url, { timeout: 12000 });
  const out = (data.results || []).map(r => ({
    title: `${r.trackName || r.collectionName || ''} — ${r.artistName || ''}`.trim(),
    link: r.trackViewUrl || r.collectionViewUrl || '',
    thumb: r.artworkUrl100 || '',
    source: r.kind || r.wrapperType || 'Audio',
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) + 's' : ''
  })).filter(r => r.title && r.link);
  if (!out.length) throw new Error('itunes empty');
  return out;
}

/* ============================================================
 *  PROVIDER: AXION (site:*.axn.cc.cd) — prioritas
 * ============================================================ */
async function axionSearch(q) {
  // Cari di Bing dengan site filter domain AXION
  const url = `https://www.bing.com/search?q=${encodeURIComponent(`site:axn.cc.cd ${q}`)}&count=20`;
  try {
    const { data } = await axios.get(url, { headers: { ...HDR, Referer: 'https://www.bing.com/' }, timeout: 12000 });
    const $ = cheerio.load(data);
    const out = [];
    $('#b_results > li.b_algo').each((_, el) => {
      const $a = $(el).find('h2 a').first();
      const title = $a.text().trim();
      const link = absolute($a.attr('href'), 'https://www.bing.com');
      if (title && link && /axn\.cc\.cd/i.test(link)) {
        out.push({ title, link, snippet: $(el).find('.b_caption p').text().trim(), source: hostOf(link), axion: true });
      }
    });
    return out;
  } catch { return []; }
}

/* ============================================================
 *  ORKESTRATOR: rotasi provider + merge hasil (kaya, dedupe)
 * ============================================================ */
const PROVIDER_MAP = {
  web:    [webDuckDuckGo, webBing, webGoogleBasic, webGoogle, webMojeek],
  images: [imgBing, imgDuckDuckGo],
  videos: [vidBing, vidYouTube],
  news:   [newsGoogle, newsBing],
  audio:  [audioITunes],
  apps:   [(q, s, l) => webBing(`${q} app OR site:play.google.com OR site:apps.apple.com`, s, l), webDuckDuckGo],
  shop:   [(q, s, l) => webBing(`${q} buy OR shop OR price OR jual OR harga`, s, l), webDuckDuckGo],
  axion:  [axionSearch]
};

function rotateStart(len) {
  // Rotasi awal berdasarkan menit + hash sederhana, agar beban terdistribusi
  return Math.floor(Date.now() / 60000) % len;
}

async function runSearch(type, q, opts = {}) {
  const fns = PROVIDER_MAP[type] || PROVIDER_MAP.web;
  const start = rotateStart(fns.length);
  const safeOn = opts.safe ?? SAFESEARCH_DEFAULT;
  const lang = opts.lang || 'en';
  let merged = [];
  let tried = 0;
  // FIX: dulu `tried < 3` — hanya coba 3 provider. Sekarang coba SEMUA,
  // dan error dicatat ke stderr (tidak lagi ditelan bulat-bulat).
  for (let i = 0; i < fns.length && merged.length < 25; i++) {
    const fn = fns[(start + i) % fns.length];
    tried++;
    try {
      const r = await fn(q, safeOn, lang);
      merged = merged.concat(r || []);
      merged = dedupe(merged);
    } catch (e) { logErr(`provider ${fn.name} [${type}] failed:`, e); }
  }
  merged = filterSafe(merged, safeOn);

  // Prioritas AXION: jika query mengandung kata AXION, sisipkan hasil AXION di atas
  if (type === 'web' && isAxionQuery(q)) {
    try {
      const ax = await axionSearch(q);
      if (ax.length) merged = dedupe(ax.concat(merged));
    } catch { /* abaikan */ }
  }
  return { type, query: q, count: merged.length, results: merged.slice(0, 30) };
}

/* ============================================================
 *  AI SUMMARY — grounded, anti-hallucination, rotasi 3 key
 * ============================================================ */
const LANG_NAME = { id: 'Bahasa Indonesia', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', zh: '中文', ja: '日本語', ar: 'العربية', hi: 'हिन्दी', ru: 'Русский', pt: 'Português' };

async function summarizeAI(query, webResults, opts = {}) {
  if (opts.aiOn === false) return null;
  if (!AI_KEYS.length) { const e = new Error('no key'); e.code = 'NO_KEY'; throw e; }
  if (!webResults?.length) return { summary: null, ai: false, reason: 'no_web_results', model: null };
  const model = ALLOWED_MODELS.includes(opts.model) ? opts.model : DEFAULT_MODEL;
  const lang = LANG_NAME[opts.lang] || 'English';
  const ctx = webResults.slice(0, 10).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet || ''}\n${r.link}`).join('\n\n');
  const prompt =
`You are AXION, a search assistant. Answer ONLY using the context below. If the context does not contain the answer, say so explicitly in ${lang} — do NOT invent facts, numbers, or sources. Cite by number like [1]. Reply in ${lang}. Be concise (max 3 short paragraphs).

Query: "${query}"

Context:
${ctx}

Answer in ${lang}:`;

  let lastErr = null;
  for (let attempt = 0; attempt < AI_KEYS.length; attempt++) {
    const key = AI_KEYS[aiKeyIdx % AI_KEYS.length];
    aiKeyIdx++;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const { data } = await axios.post(url,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 600 } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000, validateStatus: s => s < 500 }
      );
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
      if (!text.trim()) { lastErr = new Error('empty'); continue; }
      return { summary: text.trim(), model };
    } catch (e) {
      lastErr = e;
      // 429 / quota → rotasi ke key berikutnya
      if (e?.response?.status === 429 || /quota|resource exhausted/i.test(e?.response?.data?.error?.message || '')) continue;
      throw e;
    }
  }
  throw lastErr || new Error('all keys failed');
}

/* ============================================================
 *  ROUTES
 * ============================================================ */
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const type = (req.query.type || 'web').toString().trim();
  if (!q) return res.status(400).json({ error: 'empty query' });
  const safe = req.query.safe !== undefined ? req.query.safe === '1' : (req.cookies?.axn_safe === '0' ? false : SAFESEARCH_DEFAULT);
  const lang = pickLang(req);
  try {
    const data = await runSearch(type, q, { safe, lang });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'search failed', detail: String(err?.message || err) });
  }
});

app.get('/api/summary', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'empty query' });
  const model = (req.query.model || '').toString();
  const aiOn = req.query.ai !== '0';
  const lang = pickLang(req);
  const safe = req.cookies?.axn_safe === '0' ? false : SAFESEARCH_DEFAULT;
  try {
    const { results } = await runSearch('web', q, { safe, lang });
    const out = await summarizeAI(q, results, { model, aiOn, lang });
    // FIX: kalau web kosong / AI off, balas 200 dengan reason jelas —
    // bukan 500, sehingga UI bisa menampilkan pesan yang informatif.
    if (!out || !out.summary) return res.json({ query: q, summary: null, ai: false, reason: out?.reason || 'ai_off', webCount: results.length });
    res.json({ query: q, ...out });
  } catch (err) {
    logErr('/api/summary error:', err);
    res.status(err?.code === 'NO_KEY' ? 501 : 500).json({ error: err?.code === 'NO_KEY' ? 'AI not configured' : 'summary failed', detail: String(err?.message || err) });
  }
});

// Direct domain search: /search?q=... → halaman hasil pencarian (search.html)
app.get('/search', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/settings', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/safesearch', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'safesearch.html')));
app.get('/docs', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'docs.html')));
app.get('/changelog', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'changelog.html')));
app.get('/roadmap', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'roadmap.html')));
app.get('/blueprint', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'blueprint.html')));
app.get('/bible', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'bible.html')));
app.get('/sdk', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'sdk.html')));

// Sitemap dinamis
app.get('/sitemap.xml', (_req, res) => {
  const pages = ['', '/search', '/settings', '/privacy', '/safesearch', '/docs', '/changelog', '/roadmap', '/blueprint', '/bible', '/sdk'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map(p => `  <url><loc>${PUBLIC_DOMAIN}${p}</loc><changefreq>weekly</changefreq></url>`).join('\n') + `\n</urlset>`;
  res.type('application/xml').send(xml);
});

app.listen(PORT);
