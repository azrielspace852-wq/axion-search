# AXION Search v5 

**Private, fast, AI-powered meta search engine** — no tracking, no ads, no scraping.

| | |
|---|---|
| **Frontend (Pages)** | `https://search.axn.cc.cd` — Cloudflare Pages |
| **Backend (Worker API)** | `https://api.search.axn.cc.cd` — Cloudflare Workers |
| **License** | CC BY-NC-ND 4.0 |
| **Live** | https://search.axn.cc.cd |

---

##  Features

-  **API-based search (no scraping)** — unified abstraction over **Brave Search API**, **SerpDive (Krill mode)**, and **Tavily**. Because Tavily & SerpDive are LLM-optimized and return raw URLs, the same layer feeds both standard Web Search and the AI-grounded pipeline.
-  **Grounded AI** — Google AI Studio, **3 API keys rotated round-robin**, models `gemma-4-31b-it` and `gemma-4-26b-a4b-it` **auto-rotated server-side** (no user model selection). Citations, never hallucinates. AI chat mode with follow-ups.
-  **Cloudflare-native** — Pages + Workers connected via **Service Bindings** (zero external HTTP overhead). No Cloudflare Tunnel, no GitHub Actions, no VPN proxy, no Express server.
-  **Strict limits respected** — ≤10ms CPU (all I/O async/non-blocking), ≤50 subrequests, ≤6 concurrent outbound connections (concurrency pool capped at 4), aggressive batching & caching.
-  **Multi-tier caching** — Tier 1 edge (Cache API + KV), Tier 2 client (IndexedDB, 5 min). Repeated queries never hit the providers twice.
-  **IndexedDB storage** — all user data (settings, history, cache) in IndexedDB (replaced localStorage). One-click JSON export/import. Legacy localStorage auto-migrated.
-  **10 languages** — Indonesian, English, Mandarin, Japanese, Korean, Arabic (RTL), Spanish, French, German, Hindi. Instant DOM-wide switching.
-  **Flawless dark / light** — smooth transitions, accessible eye-friendly palette.
-  **Tabs reimagined** — **AI** and **All** relocated to the far left; submitting a query defaults to the **All** tab. Verticals: Web · Images · Videos · News · Audio · Apps · Shop.
-  **Growth & support** — Donate link in Settings (`https://axion-hub.axn.cc.cd/donate`), "Buy me a coffee" popup (first visit + every 10 days), "Join AXION Labs as a Creator" popup (first visit + every 15 days).
-  **Consent-first** — mandatory onboarding/consent screen. Declining blocks access for the current session only (new tab/session can try again). Transparent Privacy Policy listing every third-party API.
-  **Rebuilt SDK** — zero-dependency UMD for Node.js, vanilla browser JS, and external AI agents (OpenAI-compatible tool spec).

---

##  Architecture

```
Browser (search.axn.cc.cd — Cloudflare Pages)
   │  fetch('/api/v1/...')
   ▼
Pages Function  functions/api/[[path]].js
   │  Service Binding  env.AXION_API.fetch()   (internal, no egress)
   ▼
Cloudflare Worker  axion-search-api  (api.search.axn.cc.cd)
   ├─ providers.js   Brave / SerpDive (Krill) / Tavily / iTunes
   ├─ search.js      orchestrator · concurrency limiter · dedupe · SafeSearch
   ├─ cache.js       Tier 1: Cache API → KV (fire-and-forget writes)
   ├─ ai.js          Google AI Studio · 3-key round-robin · 2-model rotation
   └─ index.js       router · CORS · /v1/search, /v1/summary, /v1/chat, /v1/tool/search, /health
```

### Repository layout

```
├── README.md
├── LICENSE                        # CC BY-NC-ND 4.0
├── functions/api/[[path]].js      # Pages Function → Service Binding to Worker
├── public/                        # Pages static output (set as build output dir)
│   ├── _routes.json               # only /api/* invokes the Function
│   ├── index.html  search.html  settings.html  privacy.html
│   ├── safesearch.html  docs.html  changelog.html  roadmap.html
│   ├── blueprint.html  bible.html  sdk.html
│   ├── css/style.css              # full UI/UX overhaul (dark/light)
│   ├── js/
│   │   ├── i18n.js                # 10-language translations
│   │   ├── db.js                  # IndexedDB layer + localStorage migration
│   │   ├── app.js                 # core: theme, i18n apply, consent, popups, sidebar
│   │   ├── home.js  search.js  settings.js
│   ├── sdk/axion-search-sdk.js    # canonical SDK (UMD, zero-dep)
│   ├── opensearch.xml  robots.txt  sitemap.xml
└── worker/                        # Cloudflare Worker (backend API)
    ├── wrangler.toml
    ├── package.json
    └── src/  index.js  search.js  providers.js  ai.js  cache.js  util.js
```

---

## 🚀 Deployment

### 1. Backend — Cloudflare Worker

```bash
cd worker
npm install
npx wrangler kv namespace create AXION_KV      # paste the id into wrangler.toml
# Secrets (Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets,
# or via CLI). Migrated from GitHub Secrets — nothing lives in GitHub anymore.
npx wrangler secret put BRAVE_API_KEY
npx wrangler secret put SERPDIVE_API_KEY
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put AI_KEY_1
npx wrangler secret put AI_KEY_2
npx wrangler secret put AI_KEY_3
npx wrangler deploy
```

The worker is routed to `api.search.axn.cc.cd/*` (zone `axn.cc.cd`) — see `worker/wrangler.toml`.

### 2. Frontend — Cloudflare Pages

- Create a Pages project connected to this repo.
- **Build output directory:** `public` (no build command — static).
- **Functions:** `functions/` is auto-detected.
- **Service binding** (Pages → Settings → Functions → Service bindings):
  - Variable name: `AXION_API` → Service: `axion-search-api`.
  - With the binding set, `/api/*` calls are internal. If unbound, the Function falls back to `https://api.search.axn.cc.cd` automatically.
- Custom domain: `search.axn.cc.cd`.

### 3. Local development

```bash
cd worker && npx wrangler dev        # API on localhost:8787
# Serve public/ with any static server; point SDK base to http://localhost:8787.
```

---

## 🔌 Public API

All endpoints are CORS-enabled. Prefix `/api` is accepted for backward compatibility.

```
GET  /api/v1/search?q=...&type=web|images|videos|news|audio|apps|shop|all&safe=1&lang=en
GET  /api/v1/summary?q=...&lang=en                 # grounded AI summary (model auto-selected)
POST /api/v1/chat          { messages:[{role,content}], lang, safe }
GET  /api/v1/tool/search?q=...&safe=1&lang=en      # compact results for AI agents
GET  /health
```

---

##  SDK

```html
<script src="/sdk/axion-search-sdk.js"></script>
<script>
  const axn = new AxionSDK({ base: 'https://api.search.axn.cc.cd' });
  await axn.search('kucing', { type: 'web', lang: 'id' });
  await axn.summary('kucing', { lang: 'id' });
  await axn.chat([{ role: 'user', content: 'Apa itu AXION?' }], { lang: 'id' });
  axn.openaiToolSpec();   // drop into your AI agent's tools array
</script>
```

Node.js: `const AxionSDK = require('./public/sdk/axion-search-sdk.js')`. Full docs on the [SDK page](https://search.axn.cc.cd/sdk).

---

##  Privacy & Consent

AXION Search does not build profiles or sell data. Queries are forwarded to third-party search APIs (Brave, SerpDive, Tavily, iTunes) and Google AI Studio (AI features only) without personal identifiers. A mandatory consent screen is shown on first visit; declining blocks the current session only. Full details in `public/privacy.html` and on the site.

---

##  License

**Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0).** See `LICENSE`. You may share this work for non-commercial purposes with attribution; no derivatives, no commercial use.

---

*Built for the AXION ecosystem · AXION Neuralis · AXION AI · AXION Labs*
