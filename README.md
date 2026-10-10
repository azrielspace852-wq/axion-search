# AXION Search v3 ⚡

Private, fast, AI-powered **meta search engine** — no tracking, no ads, no accounts.
Runs **24/7 on GitHub Actions** behind a **Cloudflare Tunnel**, despite the 6-hour job limit.

**Live**: https://axion-search.axn.cc.cd

## Features
- 🔄 **Multi-provider rotation** — Google → Bing → DuckDuckGo → Mojeek (web), Bing/DDG (images), Bing/YouTube (videos), Google News/Bing (news), iTunes (audio), plus Apps & Shop verticals. Results merged & de-duplicated for richness.
- 🤖 **Grounded AI summary** — 3 rotating API keys, 4 selectable models (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemma-4-31b-it`, `gemma-3-27b-it`), on/off toggle. Temperature 0.1, citations, never hallucinates.
- 🌐 **11 languages** (UI + AI reply), default English.
- 🌙 **Dark / light theme**, SafeSearch toggle (on by default).
- 💾 **All user data in localStorage** + functional cookies. One-click JSON export/import for device migration.
- 🔍 **AXION priority** — queries mentioning AXION surface `*.axn.cc.cd` first; dedicated AXION tab.
- 📄 Separate pages: home, search, settings, privacy, safesearch, docs, changelog, roadmap, blueprint, bible (draft), sdk.
- 🧭 `sitemap.xml`, `robots.txt`, OpenSearch (set as default browser engine), JS SDK.
- 🤐 **Fully silent** — nothing printed to logs; secrets never echoed.

## Quick deploy (5 minutes)
1. Push this repo to GitHub.
2. Create Cloudflare Tunnel **named `axion-search`**, hostname `axion-search.axn.cc.cd` → `http://localhost:3000`. Download `cert.pem` & `<UUID>.json`.
3. Add **GitHub Secrets** (Settings → Secrets and variables → Actions):

   | Secret | Content |
   |---|---|
   | `CLOUDFLARED_CERT_PEM` | full content of `cert.pem` |
   | `TUNNEL_CREDENTIALS_JSON` | full content of `<UUID>.json` |
   | `TUNNEL_UUID` | the tunnel UUID |
   | `AI_KEY_1` / `AI_KEY_2` / `AI_KEY_3` | 3 Google AI Studio keys (rotated) |
   | `AI_MODEL_DEFAULT` | e.g. `gemini-3.5-flash-lite` |
   | `GH_PAT` | PAT with `repo` + `workflow` scope (self-chaining) |

4. Actions → **axion-247** → Run workflow. It self-chains forever. Cron every 30 min = safety net.

## How 24/7 works
Each job (`timeout-minutes: 350`, under the 6h cap):
1. Waits (health-poll) until the previous job's origin is down.
2. Starts `cloudflared tunnel run axion-search` (HA — overlap is safe) + `node server.js`.
3. At minute 290, dispatches the **next** job in the background via `GH_PAT`.
4. Serves until minute 345, then is killed at 350. Next job takes over in seconds.

If the chain ever breaks, the `*/30 * * * *` cron health-checks the site and spins up a fresh job.

## Local dev
```bash
cp .env.example .env   # fill AI_KEY_1..3
npm install
npm start              # http://localhost:3000
```

## API
```
GET /api/search?q=...&type=web|images|videos|news|audio|apps|shop|axion&safe=1&lang=en
GET /api/summary?q=...&model=gemini-3.5-flash-lite&lang=en
GET /health
```
Direct search URL: `https://axion-search.axn.cc.cd/search?q=...` (full results page + AI summary).

## Structure
```
.github/workflows/axion-247.yml   # 24/7 self-chaining workflow
cloudflared/config.yaml.template  # tunnel config (UUID injected from secret)
server.js                         # Express + provider orchestrator + AI
public/
  index.html  search.html  settings.html  privacy.html  safesearch.html
  docs.html  changelog.html  roadmap.html  blueprint.html  bible.html  sdk.html
  css/style.css   js/app.js (i18n/storage/theme)  js/home.js  js/search.js  js/settings.js
  sdk/axion-search-sdk.js   opensearch.xml   robots.txt
```

## License
MIT — built for the AXION ecosystem.
