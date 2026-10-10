# DIAGNOSIS — AXION Search v3
## Masalah: (1) Tab Web selalu kosong; (2) AI tidak pernah menjawab

**Kedua gejala ini memiliki SATU akar penyebab yang sama.** API key Gemini
tidak pernah dipakai sama sekali — kode berhenti lebih awal.

---

## BUKTI (uji langsung dari server, query "cara masak nasi goreng")

| Provider | Dipakai oleh | Hasil uji | Status |
|---|---|---|---|
| `webGoogle` (google.com/search) | web | HTTP 302 → halaman "sorry", `div.g` = 0 | ❌ BLOCKED |
| `webBing` (bing.com/search) | web, apps, shop, axion | HTTP 200 tapi **0 link eksternal, 0 `b_algo`, 0 `<h2>`, 0 `<cite>`** — halaman shell tanpa hasil | ❌ KOSONG (selector `#b_results > li.b_algo` usang + Bing kasih halaman terdegradasi ke IP datacenter) |
| `webDuckDuckGo` (html.duckduckgo.com) | web | `axios.post(url, null)` — POST tanpa body. Dari IP ini kebetulan jalan (8 hasil), tapi dari IP GitHub Actions sering di-challenge | ⚠️ RAPUH |
| `webMojeek` (mojeek.com) | web | **HTTP 403** | ❌ BLOCKED |
| `imgBing` (bing.com/images) | images | HTTP 200, **73 elemen `iusc`** | ✅ JALAN → tab Foto muncul |
| `vidYouTube` / `vidBing` | videos | YouTube scraping jalan | ✅ JALAN → tab Video muncul |
| `audioITunes` (JSON API) | audio | API JSON terbuka | ✅ JALAN → tab Audio muncul |

**Kenapa foto/video/audio MUNCUL tapi web TIDAK?**
Karena foto punya fallback `imgDuckDuckGo` (JSON `i.js`) dan `imgBing` (halaman
images Bing TIDAK terdegradasi), video punya fallback YouTube, dan audio pakai
API JSON iTunes yang tidak pernah diblok. **Tab web TIDAK punya sumber JSON
yang andal — keempatnya scraping HTML, dan semuanya gagal/diblok dari IP
datacenter (GitHub Actions / Cloudflare Tunnel egress).**

---

## BUG kode yang memperparah (pasti, bukan spekulasi)

### Bug 1 — `runSearch` hanya coba maksimal 3 provider, lalu error ditelan bulat-bulat
```js
for (let i = 0; i < fns.length && merged.length < 25 && tried < 3; i++) {
  ...
  try { ... } catch { /* lanjut ke provider berikutnya */ }   // ← error HILANG
}
```
`catch {}` kosong + `SILENT=1` (yang mematikan `console.error` juga) = **tidak
ada log sama sekali**. Pemilik tidak pernah tahu provider mana yang gagal.

### Bug 2 — `SILENT=1` mematikan `console.error`
```js
if (SILENT) { console.log=...; console.info=...; console.warn=...; console.error=...; }
```
Error ikut dibungkam. Wajib untuk GitHub Actions, tapi error harus tetap
tertulis ke stderr lewat saluran terpisah.

### Bug 3 — `webDuckDuckGo` POST tanpa body
```js
await axios.post(url, null, { headers: {...} })   // body = null
```
Endpoint `html.duckduckgo.com/html/` mengharapkan POST form `q=...`. Mengirim
`null` membuat DDG mengabaikan query (kebetulan dari IP ini masih balik hasil
karena q ada di URL, tapi tidak dijamin).

### Bug 4 — AI tidak menjawab = AKIBAT LANGSUNG dari web kosong
Di `/api/summary`:
```js
const { results } = await runSearch('web', q, { safe, lang });   // results = []
const out = await summarizeAI(q, results, ...);
```
Di `summarizeAI` BARIS PERTAMA:
```js
if (!webResults?.length) { const e = new Error('no result'); e.code='NO_RESULT'; throw e; }
```
Karena web selalu kosong, `summarizeAI` langsung `throw 'no result'` sebelum
pernah menyentuh `AI_KEY_1/2/3`. **API key tidak pernah dipakai.** Endpoint
balas HTTP 500 `{error:'summary failed', detail:'no result'}`, dan frontend
menampilkan teks merah kecil "no result" — yang terlihat oleh user sebagai
"AI tidak menjawab".

### Bug 5 (sekunder, perlu diverifikasi) — nama model
`ALLOWED_MODELS = ['gemini-3.1-flash-lite','gemini-3.5-flash-lite','gemma-4-31b-it','gemma-3-27b-it']`.
Jika salah satu nama tidak dikenali Google Generative Language API, permintaan
gagal (404). Tapi ini tidak akan pernah tercapai selama Bug 4 belum diperbaiki.
Tes: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$AI_KEY_1"`.

---

## CARA MEMPERBAIKI (ringkas)
1. Ganti urutan provider web: DDG (POST benar) di urutan pertama, tambah
   Google basic-HTML `?gbv=1` sebagai fallback, turunkan prioritas Bing web.
2. Naikkan `tried < 3` → `tried < fns.length` (coba SEMUA provider).
3. Jangan `catch {}` kosong — tulis error ke stderr meski `SILENT=1`.
4. Di `/api/summary`, jika web kosong, balas `{summary:null, ai:false,
   reason:'no_web_results'}` (HTTP 200) bukan 500, sehingga UI menampilkan
   pesan yang jelas.
5. Setelah web jalan, tes endpoint `/api/summary?q=test` langsung untuk
   memastikan model name & API key valid.

File `server.fixed.js` berisi semua perbaikan di atas (drop-in replacement).
