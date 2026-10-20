/* ============================================================
 *  AXION Search v5 — Worker shared utilities
 *  Pure, synchronous helpers only (kept under 10ms CPU budget).
 *  All I/O is async and non-blocking.
 * ============================================================ */

export const NSFW_RE = /porn|xxx|sex|nsfw|nude|hentai|onlyfans|brazzers|xnxx|xvideos|pornhub/i;

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function dedupe(arr, key = 'link') {
  const seen = new Set();
  const out = [];
  for (const r of arr) {
    const k = r[key] || r.title;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function applySafeQuery(q, on) {
  return on ? `${q} -porn -xxx -nsfw` : q;
}

export function filterSafe(results, on) {
  if (!on) return results;
  return results.filter(r => !NSFW_RE.test(`${r.title || ''} ${r.link || ''} ${r.snippet || ''}`));
}

export const LANG_NAME = {
  id: 'Bahasa Indonesia', en: 'English', zh: 'Mandarin Chinese',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', es: 'Spanish',
  fr: 'French', de: 'German', hi: 'Hindi'
};

export const SUPPORTED_LANGS = Object.keys(LANG_NAME);

export function normLang(l) {
  const s = String(l || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(s) ? s : 'en';
}

/* Concurrency limiter — guarantees <= `max` in-flight promises at once.
 * Used to respect Cloudflare's 6 concurrent outbound connections cap. */
export function pLimit(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

/* Cache key — stable, lowercase, normalized. */
export function cacheKey(parts) {
  return 'axn:v5:' + parts.map(p => String(p ?? '').toLowerCase().trim()).join(':');
}
