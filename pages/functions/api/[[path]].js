export async function onRequest(context) {
  const api = context.env.AXION_SEARCH_API;
  if (!api || typeof api.fetch !== 'function') {
    return Response.json({ error: 'AXION_SEARCH_API service binding is not configured' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  return api.fetch(context.request);
}
