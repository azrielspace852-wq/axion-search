/* ============================================================
 *  AXION Search v4 — server
 *  Multi-provider meta search + AI summary + AI Chat Mode
 *  + Public API v1 (search tool untuk layanan AI eksternal)
 *  + Proxy support (VPNX Docker / HTTP_PROXY) agar tidak diblokir
 *  Default timeout 100 detik. Mode SILENT tetap menulis error ke stderr.
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
const logErr = (...a) => process.stderr.write('[axn-err] ' + a.map(x => (x && x.stack) ? x.stack : String(x?.message || x)).join(' ') + '\n');

const PORT = process.env.PORT || 3000;
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'https://search.xxn.cc.cd';
const SAFESEARCH_DEFAULT = process.env.SAFESEARCH_DEFAULT !== '0';
const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '100000', 10); // default 100 detik
const AI_KEYS = [process.env.AI_KEY_1, process.env.AI_KEY_2, process.env.AI_KEY_3].filter(Boolean);
const ALLOWED_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it', 'gemma-3-27b-it'];
const DEFAULT_MODEL = ALLOWED_MODELS.includes(process.env.AI_MODEL_DEFAULT) ? process.env.AI_MODEL_DEFAULT : 'gemini-2.5-flash';
let aiKeyIdx = 0;

/* ── Proxy (VPNX Docker / HTTP_PROXY) ──────────────────────── */
// VPNX container diekspos sebagai HTTP proxy. Set env HTTPS_PROXY=http://vpnx:8888
// Axios memakai CONNECT tunnel lewat proxy → IP yang dilihat Google/Bing adalah
// IP VPN, bukan IP GitHub Actions → tidak diblokir.
function parseProxy(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    return { protocol: x.protocol.replace(':', ''), host: x.hostname, port: parseInt(x.port || (x.protocol === 'https:' ? 443 : 80), 10), auth: x.username ? { username: x.username, password: x.password } : undefined };
  } catch { return null; }
}
const PROXY = parseProxy(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.VPNX_PROXY || '');
if (PROXY) logErr('using outbound proxy: ' + PROXY.host + ':' + PROXY.port);
const ax = (cfg) => axios({ ...cfg, timeout: cfg.timeout || TIMEOUT, proxy: PROXY || cfg.proxy, validateStatus: cfg.validateStatus });

/* ── Rotating User-Agent pool (mengurangi deteksi bot) ─────── */
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'
];
const hdr = () => ({
  'User-Agent': UA_POOL[Math.floor(Math.random() * UA_POOL.length)],
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Cache-Control': 'no-cache', 'Pragma': 'no-cache'
});

/* ── Util ─────────────────────────────────────────────────── */
const absolute = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };
const safeJson = (s) => { if (!s) return null; try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/&quot;/g, '"')); } catch { return null; } } };
const blocked = (html = '') => /unusual traffic|captcha|are you a robot|verify you are|sorry, you have been|too many requests/i.test(html);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dedupe = (arr, key = 'link') => { const s = new Set(); return arr.filter(r => { const k = r[key] || r.title; if (!k || s.has(k)) return false; s.add(k); return true; }); };
const pickLang = (req) => (req.query.lang || req.cookies?.axn_lang || 'en').slice(0, 2).toLowerCase();
const NSFW = /porn|xxx|sex|nsfw|nude|hentai|onlyfans|brazzers|xnxx|xvideos|pornhub/i;
const applySafe = (q, on) => on ? `${q} -porn -xxx -nsfw` : q;
const filterSafe = (results, on) => on ? results.filter(r => !NSFW.test((r.title || '') + ' ' + (r.link || '') + ' ' + (r.snippet || ''))) : results;

/* ============================================================
 *  PROVIDER: Web (diperkaya — 7 provider, rotasi penuh)
 * ============================================================ */
async function webGoogle(q, safeOn) {
  const url = `https://www.google.com/search?num=20&hl=en&q=${encodeURIComponent(applySafe(q, safeOn))}&gws_rd=ssl`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://www.google.com/' }, validateStatus: () => true });
  if (blocked(data)) throw new Error('google blocked');
  const $ = cheerio.load(data); const out = [];
  $('div.g, div.MjjYud').each((_, el) => {
    const $a = $(el).find('a[href^="http"]').first();
    const link = $a.attr('href') || '';
    const title = $(el).find('h3').first().text().trim();
    const snippet = $(el).find('div[data-sncf], .VwiC3b, .IsZvec, .ITZIwc').first().text().trim();
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('google empty');
  return out;
}
async function webGoogleBasic(q, safeOn) {
  const url = `https://www.google.com/search?gbv=1&num=20&hl=en&q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://www.google.com/' }, validateStatus: () => true, maxRedirects: 5 });
  if (blocked(data)) throw new Error('google basic blocked');
  const $ = cheerio.load(data); const out = [];
  $('a[href^="/url?q="]').each((_, el) => {
    const $a = $(el); const raw = $a.attr('href') || '';
    const m = raw.match(/[?&]q=([^&]+)/); const link = m ? decodeURIComponent(m[1]) : '';
    const title = $a.text().trim();
    if (title && /^https?:\/\//.test(link) && !/google\.com|youtube\.com/i.test(link)) {
      const snippet = $a.parent().next('div, span, td').text().trim().slice(0, 300);
      out.push({ title, link, snippet, source: hostOf(link) });
    }
  });
  if (!out.length) throw new Error('google basic empty');
  return out;
}
async function webBing(q, safeOn, lang = 'en') {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(applySafe(q, safeOn))}&setlang=${lang}&cc=US&count=30&ensearch=1`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://www.bing.com/' } });
  if (blocked(data)) throw new Error('bing blocked');
  const $ = cheerio.load(data); const out = [];
  $('#b_results li.b_algo, #b_results .b_algo, li.b_algo').each((_, el) => {
    const $a = $(el).find('h2 a').first();
    const title = $a.text().trim();
    const link = absolute($a.attr('href'), 'https://www.bing.com');
    const snippet = $(el).find('.b_caption p, p').first().text().trim();
    if (title && link) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) {
    $('h2 a, h3 a').each((_, el) => {
      const $a = $(el); const title = $a.text().trim();
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
  const body = new URLSearchParams({ q: applySafe(q, safeOn), kl: 'wt-wt' });
  const { data } = await ax({ method: 'post', url: 'https://html.duckduckgo.com/html/', data: body, headers: { ...hdr(), Referer: 'https://duckduckgo.com/', 'Content-Type': 'application/x-www-form-urlencoded' } });
  const $ = cheerio.load(data); const out = [];
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
async function webYahoo(q, safeOn) {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(applySafe(q, safeOn))}&n=20`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://search.yahoo.com/' } });
  const $ = cheerio.load(data); const out = [];
  $('div.algo, li.algo').each((_, el) => {
    const $a = $(el).find('h3 a').first();
    const title = $a.text().trim();
    const raw = $a.attr('href') || '';
    const m = raw.match(/RU=([^/]+)/);
    const link = m ? decodeURIComponent(m[1].replace(/%3a/gi, ':').replace(/%2f/gi, '/')) : raw;
    const snippet = $(el).find('p, .compText').first().text().trim();
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('yahoo empty');
  return out;
}
async function webMojeek(q, safeOn) {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await ax({ method: 'get', url, headers: hdr() });
  const $ = cheerio.load(data); const out = [];
  $('ul.results-standard > li, .result').each((_, el) => {
    const $a = $(el).find('a.ob, a.title').first();
    const link = $a.attr('href') || '';
    const title = $a.text().trim();
    const snippet = $(el).find('p.s, p').first().text().trim();
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('mojeek empty');
  return out;
}
async function webBrave(q, safeOn) {
  // Brave Search API (gratis 2000 query/bulan) — opsional via BRAVE_API_KEY
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('brave no key');
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(applySafe(q, safeOn))}&count=20&safesearch=${safeOn ? 'strict' : 'off'}`;
  const { data } = await ax({ method: 'get', url, headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } });
  const out = (data.web?.results || []).map(r => ({ title: r.title, link: r.url, snippet: r.description, source: hostOf(r.url) }));
  if (!out.length) throw new Error('brave empty');
  return out;
}

/* ============================================================
 *  PROVIDER: Images / Videos / News / Audio
 * ============================================================ */
async function imgBing(q, safeOn) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(applySafe(q, safeOn))}&first=1`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://www.bing.com/' } });
  const $ = cheerio.load(data); const out = [];
  $('a.iusc').each((_, el) => {
    const meta = safeJson($(el).attr('m')); if (!meta) return;
    const src = meta.murl || ''; if (!src) return;
    out.push({ title: (meta.t || '').trim(), link: src, thumb: meta.turl || '', source: hostOf(src) });
  });
  if (!out.length) throw new Error('bing img empty');
  return out;
}
async function imgDuckDuckGo(q, safeOn) {
  const vqdHtml = await ax({ method: 'get', url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, headers: hdr() });
  const vqd = (vqdHtml.data.match(/vqd=['"]([^'"]+)['"]/) || [])[1];
  if (!vqd) throw new Error('ddg vqd fail');
  const url = `https://duckduckgo.com/i.js?o=json&q=${encodeURIComponent(applySafe(q, safeOn))}&vqd=${vqd}&f=,,,&p=${safeOn ? 1 : -1}`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://duckduckgo.com/' } });
  const out = (data.results || []).map(r => ({ title: r.title, link: r.image, thumb: r.thumbnail, source: hostOf(r.image) }));
  if (!out.length) throw new Error('ddg img empty');
  return out;
}
async function vidBing(q, safeOn) {
  const url = `https://www.bing.com/videos/search?q=${encodeURIComponent(applySafe(q, safeOn))}`;
  const { data } = await ax({ method: 'get', url, headers: { ...hdr(), Referer: 'https://www.bing.com/' } });
  const $ = cheerio.load(data); const out = [];
  $('.mc_vtvc').each((_, el) => {
    const meta = safeJson($(el).attr('m')); if (!meta) return;
    const link = meta.p || meta.vurl || ''; if (!link) return;
    out.push({ title: (meta.t || '').trim(), link, thumb: meta.imgurl || meta.thumbnailUrl || '', source: meta.pub || meta.provider || hostOf(link), duration: meta.d || '' });
  });
  if (!out.length) throw new Error('bing vid empty');
  return out;
}
async function vidYouTube(q, safeOn) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(applySafe(q, safeOn))}&sp=${safeOn ? 'EgQQARgB' : ''}`;
  const { data } = await ax({ method: 'get', url, headers: hdr() });
  const m = data.match(/ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s) || data.match(/var ytInitialData\s*=\s*(\{.*?\});/s);
  if (!m) throw new Error('yt parse fail');
  const j = safeJson(m[1]);
  const items = j?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  const out = [];
  for (const it of items) {
    const v = it.videoRenderer; if (!v) continue;
    out.push({ title: v.title?.runs?.[0]?.text || '', link: `https://www.youtube.com/watch?v=${v.videoId}`, thumb: v.thumbnail?.thumbnails?.[0]?.url || '', source: v.longBylineText?.runs?.[0]?.text || 'YouTube', duration: v.lengthText?.simpleText || '' });
  }
  if (!out.length) throw new Error('yt empty');
  return out;
}
async function newsGoogle(q, safeOn, lang = 'en') {
  const hl = { id: 'id', en: 'en', es: 'es', fr: 'fr', de: 'de', zh: 'zh-Hans', ja: 'ja', ar: 'ar', hi: 'hi', ru: 'ru', pt: 'pt' }[lang] || 'en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(applySafe(q, safeOn))}&hl=${hl}&gl=US&ceid=US:en`;
  const { data } = await ax({ method: 'get', url, headers: hdr() });
  const $ = cheerio.load(data, { xmlMode: true }); const out = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim(); const link = $(el).find('link').text().trim();
    const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim(); const pub = $(el).find('pubDate').text().trim();
    if (title && link) out.push({ title, link, snippet, source: pub, date: pub });
  });
  if (!out.length) throw new Error('news empty');
  return out;
}
async function newsBing(q, safeOn) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(applySafe(q, safeOn))}&format=rss`;
  const { data } = await ax({ method: 'get', url, headers: hdr() });
  const $ = cheerio.load(data, { xmlMode: true }); const out = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim(); const link = $(el).find('link').text().trim();
    const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
    if (title && link) out.push({ title, link, snippet, source: hostOf(link) });
  });
  if (!out.length) throw new Error('bing news empty');
  return out;
}
async function audioITunes(q) {
  const { data } = await ax({ method: 'get', url: `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=all&limit=30` });
  const out = (data.results || []).map(r => ({
    title: `${r.trackName || r.collectionName || ''} — ${r.artistName || ''}`.trim(),
    link: r.trackViewUrl || r.collectionViewUrl || '', thumb: r.artworkUrl100 || '',
    source: r.kind || r.wrapperType || 'Audio', duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) + 's' : ''
  })).filter(r => r.title && r.link);
  if (!out.length) throw new Error('itunes empty');
  return out;
}

/* ============================================================
 *  ORKESTRATOR
 * ============================================================ */
const PROVIDER_MAP = {
  web:    [webDuckDuckGo, webBing, webGoogleBasic, webYahoo, webGoogle, webMojeek, webBrave],
  images: [imgBing, imgDuckDuckGo],
  videos: [vidBing, vidYouTube],
  news:   [newsGoogle, newsBing],
  audio:  [audioITunes],
  apps:   [(q, s, l) => webBing(`${q} app OR site:play.google.com OR site:apps.apple.com`, s, l), webDuckDuckGo, webYahoo],
  shop:   [(q, s, l) => webBing(`${q} buy OR shop OR price OR jual OR harga`, s, l), webDuckDuckGo, webYahoo]
};
function rotateStart(len) { return Math.floor(Date.now() / 60000) % len; }
async function runSearch(type, q, opts = {}) {
  const fns = PROVIDER_MAP[type] || PROVIDER_MAP.web;
  const start = rotateStart(fns.length);
  const safeOn = opts.safe ?? SAFESEARCH_DEFAULT;
  const lang = opts.lang || 'en';
  let merged = [];
  for (let i = 0; i < fns.length && merged.length < 30; i++) {
    const fn = fns[(start + i) % fns.length];
    try {
      const r = await fn(q, safeOn, lang);
      merged = dedupe(merged.concat(r || []));
    } catch (e) { logErr(`provider ${fn.name} [${type}] failed:`, e); }
  }
  merged = filterSafe(merged, safeOn);
  return { type, query: q, count: merged.length, results: merged.slice(0, 40) };
}
// Tab "Semua": gabungan web + images + videos + news + audio (paralel)
async function runAllSearch(q, opts = {}) {
  const [web, images, videos, news, audio] = await Promise.allSettled([
    runSearch('web', q, opts), runSearch('images', q, opts), runSearch('videos', q, opts), runSearch('news', q, opts), runSearch('audio', q, opts)
  ]);
  const val = (p) => p.status === 'fulfilled' ? p.value.results : [];
  return { type: 'all', query: q,
    count: val(web).length + val(images).length + val(videos).length + val(news).length + val(audio).length,
    web: val(web).slice(0, 12), images: val(images).slice(0, 8), videos: val(videos).slice(0, 6), news: val(news).slice(0, 6), audio: val(audio).slice(0, 4) };
}

/* ============================================================
 *  AI — summary + chat mode (grounded, rotasi 3 key)
 * ============================================================ */
const LANG_NAME = { id: 'Bahasa Indonesia', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', zh: '中文', ja: '日本語', ar: 'العربية', hi: 'हिन्दी', ru: 'Русский', pt: 'Português' };
async function callGemini(prompt, model) {
  if (!AI_KEYS.length) { const e = new Error('no key'); e.code = 'NO_KEY'; throw e; }
  let lastErr = null;
  for (let attempt = 0; attempt < AI_KEYS.length; attempt++) {
    const key = AI_KEYS[aiKeyIdx % AI_KEYS.length]; aiKeyIdx++;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const { data } = await ax({ method: 'post', url, data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }, headers: { 'Content-Type': 'application/json' }, validateStatus: s => s < 500 });
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
      if (!text.trim()) { lastErr = new Error(data?.error?.message || 'empty'); continue; }
      return text.trim();
    } catch (e) {
      lastErr = e;
      if (e?.response?.status === 429 || /quota|resource exhausted/i.test(e?.response?.data?.error?.message || '')) continue;
      throw e;
    }
  }
  throw lastErr || new Error('all keys failed');
}
async function summarizeAI(query, webResults, opts = {}) {
  if (opts.aiOn === false) return { summary: null, ai: false, reason: 'ai_off', model: null };
  if (!webResults?.length) return { summary: null, ai: false, reason: 'no_web_results', model: null };
  const model = ALLOWED_MODELS.includes(opts.model) ? opts.model : DEFAULT_MODEL;
  const lang = LANG_NAME[opts.lang] || 'English';
  const ctx = webResults.slice(0, 10).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet || ''}\n${r.link}`).join('\n\n');
  const prompt = `You are AXION, a search assistant. Answer ONLY using the context below. If the context does not contain the answer, say so explicitly in ${lang} — do NOT invent facts, numbers, or sources. Cite by number like [1]. Reply in ${lang}. Be concise (max 3 short paragraphs).\nQuery: "${query}"\nContext:\n${ctx}\nAnswer in ${lang}:`;
  const text = await callGemini(prompt, model);
  return { summary: text, model };
}
// AI Chat Mode: terima riwayat percakapan + pencarian ulang untuk pesan terakhir
async function chatAI(messages, opts = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('no messages');
  const model = ALLOWED_MODELS.includes(opts.model) ? opts.model : DEFAULT_MODEL;
  const lang = LANG_NAME[opts.lang] || 'English';
  const lastQ = messages[messages.length - 1].content || '';
  const { results } = await runSearch('web', lastQ, { safe: opts.safe, lang: opts.lang });
  const ctx = results.slice(0, 8).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet || ''}\n${r.link}`).join('\n\n') || '(no web results found — tell the user you could not find sources and answer generally, clearly marking uncertainty)';
  const history = messages.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AXION'}: ${m.content}`).join('\n');
  const prompt = `You are AXION, a helpful search assistant chatting in ${lang}. Use the fresh web context below to answer the user's latest message. Cite sources by number like [1]. If context is insufficient, say so — never invent. Keep replies concise and in ${lang}.\n\nFresh web context:\n${ctx}\n\nConversation:\n${history}\n\nAXION (in ${lang}):`;
  const text = await callGemini(prompt, model);
  return { reply: text, model, sources: results.slice(0, 8), webCount: results.length };
}

/* ============================================================
 *  ROUTES
 * ============================================================ */
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now(), proxy: !!PROXY, timeout: TIMEOUT }));

/* ── Public API v1 (CORS-enabled) — untuk browser & layanan AI eksternal ── */
// Search tool untuk layanan AI eksternal (OpenAI-compatible tool result)
app.get('/api/v1/tool/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'empty query' });
  const safe = req.query.safe !== undefined ? req.query.safe === '1' : SAFESEARCH_DEFAULT;
  const lang = (req.query.lang || 'en').toString().slice(0, 2);
  try {
    const { results } = await runSearch('web', q, { safe, lang });
    res.json({ query: q, results: results.slice(0, 10).map(r => ({ title: r.title, url: r.link, snippet: r.snippet, source: r.source })) });
  } catch (err) { logErr('tool/search:', err); res.status(500).json({ error: 'search failed', detail: String(err?.message || err) }); }
});
app.get('/api/v1/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const type = (req.query.type || 'web').toString().trim();
  if (!q) return res.status(400).json({ error: 'empty query' });
  const safe = req.query.safe !== undefined ? req.query.safe === '1' : SAFESEARCH_DEFAULT;
  const lang = (req.query.lang || 'en').toString().slice(0, 2);
  try {
    const data = type === 'all' ? await runAllSearch(q, { safe, lang }) : await runSearch(type, q, { safe, lang });
    res.json(data);
  } catch (err) { logErr('v1/search:', err); res.status(500).json({ error: 'search failed', detail: String(err?.message || err) }); }
});
app.post('/api/v1/chat', async (req, res) => {
  const messages = req.body?.messages;
  const model = (req.body?.model || '').toString();
  const lang = (req.body?.lang || 'en').toString().slice(0, 2);
  const safe = req.body?.safe !== undefined ? !!req.body.safe : SAFESEARCH_DEFAULT;
  try {
    const out = await chatAI(messages, { model, lang, safe });
    res.json(out);
  } catch (err) { logErr('v1/chat:', err); res.status(err?.code === 'NO_KEY' ? 501 : 500).json({ error: err?.code === 'NO_KEY' ? 'AI not configured' : 'chat failed', detail: String(err?.message || err) }); }
});

/* ── Legacy API (kompatibel frontend & SDK lama) ── */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const type = (req.query.type || 'web').toString().trim();
  if (!q) return res.status(400).json({ error: 'empty query' });
  const safe = req.query.safe !== undefined ? req.query.safe === '1' : (req.cookies?.axn_safe === '0' ? false : SAFESEARCH_DEFAULT);
  const lang = pickLang(req);
  try {
    const data = type === 'all' ? await runAllSearch(q, { safe, lang }) : await runSearch(type, q, { safe, lang });
    res.json(data);
  } catch (err) { logErr('api/search:', err); res.status(500).json({ error: 'search failed', detail: String(err?.message || err) }); }
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
    if (!out || !out.summary) return res.json({ query: q, summary: null, ai: false, reason: out?.reason || 'ai_off', webCount: results.length });
    res.json({ query: q, ...out });
  } catch (err) { logErr('api/summary:', err); res.status(err?.code === 'NO_KEY' ? 501 : 500).json({ error: err?.code === 'NO_KEY' ? 'AI not configured' : 'summary failed', detail: String(err?.message || err) }); }
});

/* ── Direct search URL: /s/<query> & /search?q= (browser & OpenSearch) ── */
app.get('/s/:q', (req, res) => { const q = decodeURIComponent(req.params.q || ''); res.redirect(302, `/search?q=${encodeURIComponent(q)}`); });
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

/* ── Sitemap + OpenSearch di root domain ── */
app.get('/sitemap.xml', (_req, res) => {
  const pages = ['', '/search', '/settings', '/privacy', '/safesearch', '/docs', '/changelog', '/roadmap', '/blueprint', '/bible', '/sdk'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map(p => `  <url><loc>${PUBLIC_DOMAIN}${p}</loc><changefreq>weekly</changefreq></url>`).join('\n') + `\n</urlset>`;
  res.type('application/xml').send(xml);
});
app.get('/opensearch.xml', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'opensearch.xml')));

app.listen(PORT, () => logErr(`AXION Search v4 listening on :${PORT} proxy=${!!PROXY} timeout=${TIMEOUT}ms`));
