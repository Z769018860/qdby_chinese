const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPSTREAM_BASE = 'https://z1g-warreport.qookkagames.com/publish/BattleReplay_';
const MAX_BYTES = 20_000_000;

function replayUuid(context) {
  const fromParams = context?.params?.uuid;
  if (fromParams) return String(fromParams).toLowerCase();
  try {
    const path = new URL(context.request.url).pathname;
    const match = path.match(/\/api\/morimens\/replay\/([0-9a-f-]{36})\/?$/i);
    return String(match?.[1] || '').toLowerCase();
  } catch {
    return '';
  }
}

function responseHeaders(upstream) {
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Morimens-Replay-Source', 'public-warreport');
  for (const key of ['etag', 'last-modified']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  return headers;
}

export default async function onRequest(context) {
  const request = context.request;
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const uuid = replayUuid(context);
  if (!UUID_RE.test(uuid)) {
    return new Response('Invalid replay UUID', { status: 400 });
  }

  const target = `${UPSTREAM_BASE}${uuid}.json`;
  // Replay objects are several MB. Buffering them in the function (arrayBuffer) can exceed the edge runtime's limits (HTTP 545),
  // so the body is streamed straight through, and Range requests are forwarded so the page can fall back to small chunks.
  const range = request.headers.get('range');
  const upstreamHeaders = { Accept: 'application/json,application/octet-stream;q=0.9,*/*;q=0.8' };
  if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.Range = range;
  let upstream;
  try {
    upstream = await fetch(target, { method, redirect: 'follow', headers: upstreamHeaders });
  } catch (error) {
    return new Response(`Replay upstream fetch failed: ${error?.message || error}`, { status: 502 });
  }

  const headers = responseHeaders(upstream);
  for (const key of ['content-range', 'accept-ranges', 'content-length']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  if (!upstream.ok) {
    return new Response(method === 'HEAD' ? null : `Replay upstream returned ${upstream.status}`, {
      status: upstream.status,
      headers,
    });
  }

  const declaredLength = Number(upstream.headers.get('content-length') || 0);
  if (!range && declaredLength && declaredLength > MAX_BYTES) {
    return new Response('Replay object too large', { status: 413 });
  }
  if (method === 'HEAD') {
    return new Response(null, { status: upstream.status, headers });
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
