export async function onRequest(context) {
  const url = new URL(context.request.url);
  const raw = url.pathname.slice('/s/'.length);
  let query = raw;
  try { query = decodeURIComponent(raw); } catch { /* preserve the raw path if malformed */ }
  return Response.redirect(`${url.origin}/search?q=${encodeURIComponent(query)}`, 302);
}
