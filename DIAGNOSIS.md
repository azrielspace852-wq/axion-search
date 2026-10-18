# AXION Search v4.1 — Cloudflare Deployment Diagnostics

## Production architecture

- Website: `https://search.xxn.cc.cd` (Cloudflare Pages)
- API: `https://api.search.axn.cc.cd` (Cloudflare Worker service `axion-search-api`)
- Pages binding: `AXION_SEARCH_API` → `axion-search-api`
- Pages forwards `/api/*` and `/health` using service bindings; the frontend uses same-origin `/api/*` requests. External clients use the API hostname.

## Verification order

1. Deploy Worker first: `npx wrangler deploy --config worker/wrangler.jsonc`.
2. Check Worker health: `GET https://api.search.axn.cc.cd/health`. Confirm `platform` is `cloudflare-workers` and `ok` is `true`.
3. Verify `AI_KEY_1` (and optional `AI_KEY_2` / `AI_KEY_3`) are configured as Worker secrets. Health intentionally reports only whether an AI key is present, never the value.
4. Deploy Pages: `npx wrangler pages deploy ./public --project-name axion-search-site --config wrangler.pages.jsonc`.
5. Verify Pages → Settings → Bindings: binding name `AXION_SEARCH_API`, service `axion-search-api`; redeploy Pages after any binding change.
6. Test `GET https://search.xxn.cc.cd/health` and `GET https://search.xxn.cc.cd/api/v1/search?q=test&type=web&safe=1&lang=en`.
7. Test the external API directly with `GET https://api.search.axn.cc.cd/api/v1/search?q=test&type=web&safe=1&lang=en`.
8. Test an AI summary only after search works: `GET https://api.search.axn.cc.cd/api/summary?q=test&lang=en`.

## Symptom → likely cause

| Symptom | Check |
|---|---|
| Pages `/api/...` returns 503 about missing binding | Configure `AXION_SEARCH_API` as a Pages Service binding and redeploy. |
| Pages `/health` works but API host fails | Check Worker deployment, custom domain, DNS, and SSL state. |
| API host works but browser SDK shows CORS error | Ensure the deployed Worker version is current; API responses allow public CORS for the documented public endpoints. |
| Search is empty | Inspect provider availability/HTML changes and test more than one vertical; provider sites may block or change markup. |
| Search works but AI says not configured | Add at least `AI_KEY_1` as a Worker secret and redeploy if necessary. |
| Summary returns no answer but search has no results | This is an upstream provider issue rather than an AI key issue; first obtain web results. |
| Local Pages requests cannot reach Worker binding | Start `npm run dev:api`; run Pages dev with `--service AXION_SEARCH_API=axion-search-api`. |

## Runtime caveats

Cloudflare Workers uses native `fetch()` and does not automatically honor the legacy `HTTP_PROXY`, `HTTPS_PROXY`, or `VPNX_PROXY` variables. Those remain usable only by the retained Express server (`npm run start:legacy`). Search results depend on external provider availability and selectors; the application falls back across providers but cannot guarantee third-party uptime.
