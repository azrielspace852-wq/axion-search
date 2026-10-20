/* ============================================================
 *  AXION Search v5 — Cloudflare Pages Function (Service Binding)
 *
 *  The Pages frontend (search.axn.cc.cd) calls /api/* on its own
 *  origin. This Function forwards the request to the backend
 *  Worker (axion-search-api) via a Cloudflare Service Binding
 *  (env.AXION_API) — internal, zero external HTTP overhead.
 *
 *  If the binding is not configured (e.g. local preview), it
 *  falls back to a direct fetch of the public API domain.
 *
 *  Pages → Settings → Functions → Service bindings:
 *     Variable name: AXION_API   Service: axion-search-api
 * ============================================================ */

const API_ORIGIN = 'https://api.search.axn.cc.cd';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const sub = (params.path || []).join('/');
  const target = `${API_ORIGIN}/api/${sub}${url.search}`;

  const init = {
    method: request.method,
    headers: request.headers
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  if (env && env.AXION_API && typeof env.AXION_API.fetch === 'function') {
    // Service Binding — internal invocation, no outbound connection cost.
    return env.AXION_API.fetch(target, init);
  }
  // Fallback: direct HTTPS to the API worker.
  return fetch(target, init);
}
