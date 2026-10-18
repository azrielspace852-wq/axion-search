# AXION Search v4.1

AXION Search is a privacy-focused, multi-provider meta search engine with a browser UI, optional grounded AI summaries, AI chat, multiple search verticals, 11 interface/answer languages, SafeSearch, localStorage-based preferences, JSON import/export, OpenSearch integration, and a zero-dependency JavaScript SDK.

## Production architecture

- **Website / Cloudflare Pages:** `https://search.xxn.cc.cd`
- **Public API / Cloudflare Worker:** `https://api.search.axn.cc.cd`
- **Internal connection:** the Pages Functions service binding named `AXION_SEARCH_API` targets the Worker service `axion-search-api`. Browser UI calls `/api/*` on the site origin; Pages forwards those requests to the Worker through the binding. External SDK users can call the API hostname directly.
- **No Express server is needed in production.** `server.js` remains as a legacy Node deployment option and is not used by the Pages/Workers deployment.

## Preserved features

- Rotating provider set for web search: DuckDuckGo, Bing, Google (regular and basic), Yahoo, Mojeek, and optional Brave Search API.
- Images: Bing and DuckDuckGo. Videos: Bing and YouTube. News: Google News RSS and Bing News RSS. Audio: iTunes. Apps and shop verticals are also supported.
- AI-generated, source-grounded summaries and AI chat that searches for context before responding; three rotating Google AI Studio keys; supported model allowlist and model selection.
- 11 languages: Indonesian, English, Spanish, French, German, Chinese, Japanese, Arabic, Hindi, Russian, and Portuguese.
- Dark/light theme, SafeSearch, local browser settings/history, JSON preferences export/import, AXION ecosystem search and priority, search shortcuts, sitemap, robots, OpenSearch, documentation and SDK pages.
- Existing API routes remain supported, including `/api/search`, `/api/summary`, `/api/v1/search`, `/api/v1/chat`, and `/api/v1/tool/search`.

## Deploy to Cloudflare

### 1. Create the Worker

From the repository root:

```bash
npm install
npx wrangler login
npx wrangler deploy --config worker/wrangler.jsonc
```

This deploys the API as `axion-search-api`. In Cloudflare, attach the custom domain `api.search.axn.cc.cd` to that Worker (the Worker config already declares it as a custom-domain route).

Set AI keys as **Worker secrets**, not in source control:

```bash
npx wrangler secret put AI_KEY_1 --config worker/wrangler.jsonc
npx wrangler secret put AI_KEY_2 --config worker/wrangler.jsonc
npx wrangler secret put AI_KEY_3 --config worker/wrangler.jsonc
# Optional: add Brave as another web-search provider
npx wrangler secret put BRAVE_API_KEY --config worker/wrangler.jsonc
```

`AI_KEY_1` is sufficient; `AI_KEY_2` and `AI_KEY_3` are optional fallbacks. `BRAVE_API_KEY` is optional. Other non-secret defaults (`SAFESEARCH_DEFAULT`, `TIMEOUT_MS`, `AI_MODEL_DEFAULT`, `SILENT`) are in `worker/wrangler.jsonc`.

### 2. Create the Pages site and service binding

Deploy the site:

```bash
npx wrangler pages deploy ./public --project-name axion-search-site --config wrangler.pages.jsonc
```

Ensure the Pages project is named `axion-search-site` and the custom domain is `search.xxn.cc.cd`. The Pages config defines `AXION_SEARCH_API` as a Service binding to the Worker `axion-search-api`. If the binding is managed in the dashboard instead, add **Settings → Bindings → Service binding** with variable name `AXION_SEARCH_API` and Worker service `axion-search-api`, then redeploy Pages.

The Worker must be deployed before Pages so the referenced service is available. Configure DNS/custom domains in the Cloudflare dashboard for both requested hostnames.

### 3. Optional GitHub auto-deploy

The workflow `.github/workflows/deploy-cloudflare.yml` deploys the Worker first and Pages second on pushes to `main`. Add these repository secrets:

- `CLOUDFLARE_API_TOKEN` with permission to deploy Workers and Pages.
- `CLOUDFLARE_ACCOUNT_ID` for the target Cloudflare account.

AI keys remain in the Worker secret store and do not need to be copied into GitHub Actions.

## Local development

Install the existing project dependencies first. Run the Worker in one terminal:

```bash
npm run dev:api
```

Run Pages in a second terminal:

```bash
npm run dev:pages
```

`dev:pages` supplies the local service binding to the `axion-search-api` Worker. If local Wrangler versions do not resolve that binding automatically, run `npx wrangler pages dev ./public --config wrangler.pages.jsonc --service AXION_SEARCH_API=axion-search-api` while the API Worker is running.

For the retained legacy Node server only, `npm run start:legacy` starts Express on port 3000 and reads `.env`. This is not the production Cloudflare architecture.

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/search?q=...&type=web&safe=1&lang=id` | Public search API. Types: `web`, `images`, `videos`, `news`, `audio`, `apps`, `shop`, `axion`, `all`. |
| GET | `/api/v1/tool/search?q=...` | Compact search result format for AI tool/function calling. |
| POST | `/api/v1/chat` | Grounded chat; body includes `messages`, optional `model`, `lang`, and `safe`. |
| GET | `/api/search?q=...` | Legacy-compatible search endpoint. |
| GET | `/api/summary?q=...&model=gemini-2.5-flash&lang=id` | Grounded AI summary. |
| GET | `/health` | Worker health and configuration status, excluding secrets. |

API base URL: `https://api.search.axn.cc.cd`. Site URLs such as `/search` and `/s/<query>` belong to `https://search.xxn.cc.cd`.

## SDK

SDK file: `https://search.xxn.cc.cd/sdk/axion-search-sdk.js`.

```html
<script src="https://search.xxn.cc.cd/sdk/axion-search-sdk.js"></script>
<script>
  const axn = new AxionSDK();
  const results = await axn.search('neural networks', { type: 'web', lang: 'en' });
  const summary = await axn.summary('what is AXION?', { lang: 'en' });
  const chat = await axn.chat([{ role: 'user', content: 'Explain AXION' }]);
</script>
```

To override hosts explicitly:

```js
const axn = new AxionSDK({
  apiBase: 'https://api.search.axn.cc.cd',
  siteBase: 'https://search.xxn.cc.cd',
  timeout: 45000
});
```

## Runtime differences and compatibility notes

Cloudflare Workers uses its native `fetch()` runtime, not Express listening on a TCP port. The provider scraper, result orchestration, SafeSearch logic, AI summary/chat, and legacy API paths are carried into the Worker. Requests to providers run concurrently and results are merged in rotating provider order to keep the request responsive.

The old Node deployment supports `HTTP_PROXY`/`HTTPS_PROXY`/VPNX proxy configuration. Cloudflare Workers does not transparently consume those environment variables through native `fetch()`, so the Cloudflare runtime uses Cloudflare egress instead. The legacy Node entry point and archived tunnel/VPNX files are retained for compatibility; the Cloudflare production deployment does not run the old GitHub Actions tunnel loop.

## Files

```text
public/                         Static site deployed to Pages
functions/api/[[path]].js       Pages -> Worker Service binding proxy
functions/health.js             Pages -> Worker health proxy
functions/s/[[path]].js         Search shortcut redirect
wrangler.pages.jsonc             Pages config + AXION_SEARCH_API binding
worker/src/index.js              Fetch-based API Worker entry point
worker/src/search-engine.js      Provider scraper, orchestration, grounded AI
worker/wrangler.jsonc             API Worker config + custom domain
public/sdk/axion-search-sdk.js    Updated JS SDK (separate API/site origins)
server.js                        Retained legacy Express runtime
archive/legacy/                   Archived Tunnel/VPNX runtime assets
```

## License

MIT.
