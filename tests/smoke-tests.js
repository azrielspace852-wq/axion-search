const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const pagesConfig = JSON.parse(read('wrangler.pages.jsonc'));
const workerConfig = JSON.parse(read('worker/wrangler.jsonc'));
const worker = read('worker/src/index.js');
const engine = read('worker/src/search-engine.js');
const sdk = read('public/sdk/axion-search-sdk.js');
const redirects = read('public/_redirects');
const pageBinding = read('functions/api/[[path]].js');
const healthBinding = read('functions/health.js');
const shortUrlFunction = read('functions/s/[[path]].js');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

const AxionSDK = require('../public/sdk/axion-search-sdk.js');
const defaultSdk = new AxionSDK();
assert.equal(defaultSdk.apiBase, 'https://api.search.axn.cc.cd');
assert.equal(defaultSdk.siteBase, 'https://search.xxn.cc.cd');
assert.equal(defaultSdk.searchUrl('a b'), 'https://search.xxn.cc.cd/search?q=a%20b');
assert.equal(defaultSdk.shortUrl('a b'), 'https://search.xxn.cc.cd/s/a%20b');
const legacySdk = new AxionSDK({ base: 'https://legacy.example' });
assert.equal(legacySdk.apiBase, 'https://legacy.example');
assert.equal(legacySdk.siteBase, 'https://legacy.example');

assert.equal(pagesConfig.name, 'axion-search-site');
assert.equal(pagesConfig.pages_build_output_dir, './public');
assert.equal(pagesConfig.services[0].binding, 'AXION_SEARCH_API');
assert.equal(pagesConfig.services[0].service, workerConfig.name);
assert.equal(workerConfig.name, 'axion-search-api');
assert.equal(workerConfig.routes[0].pattern, 'api.search.axn.cc.cd');
assert.equal(workerConfig.routes[0].custom_domain, true);
assert.equal(pkg.version, '4.1.0');
assert.equal(lock.packages[''].version, pkg.version);
assert.deepEqual(Object.keys(lock.packages[''].dependencies).sort(), Object.keys(pkg.dependencies).sort());

for (const endpoint of ['/api/v1/search', '/api/v1/tool/search', '/api/v1/chat', '/api/search', '/api/summary', '/health']) {
  assert.ok(worker.includes(endpoint), `Worker route missing: ${endpoint}`);
}
for (const page of ['/search', '/settings', '/privacy', '/safesearch', '/docs', '/changelog', '/roadmap', '/blueprint', '/bible', '/sdk']) {
  assert.ok(redirects.includes(`${page} `), `Pages rewrite missing: ${page}`);
}
assert.ok(pageBinding.includes('context.env.AXION_SEARCH_API') && pageBinding.includes('api.fetch(context.request)'), 'Pages service binding forwarding missing');
assert.ok(pageBinding.includes('export async function onRequest'), 'API Pages Function handler missing');
assert.ok(healthBinding.includes('context.env.AXION_SEARCH_API') && healthBinding.includes('api.fetch(context.request)'), 'Health Pages binding forwarding missing');
assert.ok(shortUrlFunction.includes('Response.redirect') && shortUrlFunction.includes('/search?q='), 'Short search URL redirect missing');
assert.ok(sdk.includes("var DEFAULT_API = 'https://api.search.axn.cc.cd'"));
assert.ok(sdk.includes("var DEFAULT_SITE = 'https://search.xxn.cc.cd'"));
for (const method of ['search', 'summary', 'chat', 'aiToolSearch', 'health', 'searchUrl', 'shortUrl', 'openaiToolSpec']) {
  assert.ok(sdk.includes(`AxionSDK.prototype.${method}`), `SDK method missing: ${method}`);
}
for (const provider of ['webDuckDuckGo', 'webBing', 'webGoogleBasic', 'webYahoo', 'webGoogle', 'webMojeek', 'webBrave', 'imgBing', 'imgDuckDuckGo', 'vidBing', 'vidYouTube', 'newsGoogle', 'newsBing', 'audioITunes']) {
  assert.ok(engine.includes(provider), `Search provider missing: ${provider}`);
}
for (const vertical of ['web:', 'images:', 'videos:', 'news:', 'audio:', 'apps:', 'shop:', 'axion:']) {
  assert.ok(engine.includes(vertical), `Search vertical missing: ${vertical}`);
}
assert.ok(engine.includes('summarizeAI'));
assert.ok(engine.includes('chatAI'));
assert.ok(fs.existsSync(path.join(root, 'public/sitemap.xml')));
assert.ok(fs.existsSync(path.join(root, 'public/robots.txt')));
assert.ok(fs.existsSync(path.join(root, 'archive/legacy/axion-247.yml.disabled')));
for (const file of ['public/index.html', 'public/opensearch.xml', 'public/sitemap.xml', 'public/robots.txt']) {
  assert.ok(!read(file).includes('axion-search.axn.cc.cd'), `Stale site host found in ${file}`);
}
assert.ok(!read('public/index.html').includes('VPN-proxy protected'), 'Cloudflare site must not claim Node-only VPNX proxy is active');

(async () => {
  const originalFetch = global.fetch;
  const seen = [];
  global.fetch = async (url, options = {}) => {
    seen.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await defaultSdk.search('test query', { type: 'images', safe: false, lang: 'id' });
    assert.match(seen[0].url, /^https:\/\/api\.search\.axn\.cc\.cd\/api\/v1\/search\?/);
    const searchUrl = new URL(seen[0].url);
    assert.equal(searchUrl.searchParams.get('q'), 'test query');
    assert.equal(searchUrl.searchParams.get('type'), 'images');
    assert.equal(searchUrl.searchParams.get('safe'), '0');
    assert.equal(searchUrl.searchParams.get('lang'), 'id');
    await defaultSdk.chat([{ role: 'user', content: 'hello' }], { lang: 'id' });
    assert.equal(new URL(seen[1].url).pathname, '/api/v1/chat');
    assert.equal(seen[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(seen[1].options.body).messages, [{ role: 'user', content: 'hello' }]);
  } finally {
    global.fetch = originalFetch;
  }
  console.log('AXION Search smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
