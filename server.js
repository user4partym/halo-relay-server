// Halo Relay — user's own CORS relay for the Halo Admin Page.
// Forwards ONLY to https://www.halo-voice.com/admin-api/* and /ruoyi-api/*
// Halo's server sends Access-Control-Allow-Origin TWICE, which browsers
// reject. This relay strips those headers and returns a SINGLE one,
// so the Halo Admin Page (hosted on another origin) can call Halo.
// SECURITY: token/password are NEVER logged and NEVER stored. The relay
// holds no credentials of its own. Only the two Halo API prefixes above
// are allowed — this is not an open proxy.
// Forwarding uses global fetch (honours the host's proxy env when present;
// on Render it goes direct). No automatic retry: a retried POST could
// double-send coins, so a failed upstream call is reported as 502.
const http = require('http');

const PORT = process.env.PORT || 10000;
const UPSTREAM = 'https://www.halo-voice.com';
const MAX_BODY = 5 * 1024 * 1024; // 5 MB, same as the Halo panel limit
const ALLOWED_PREFIXES = ['/admin-api/', '/ruoyi-api/'];

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ua, language, Accept, X-Requested-With');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, status, obj) {
  corsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Preflight: answer immediately, single CORS header only.
  if (req.method === 'OPTIONS') {
    corsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, { ok: true, service: 'halo-relay', upstream: UPSTREAM });
    return;
  }

  // Accept both /relay/admin-api/... and /admin-api/... forms.
  let targetPath = url.pathname;
  if (targetPath.startsWith('/relay/')) targetPath = targetPath.slice('/relay'.length);
  if (!ALLOWED_PREFIXES.some((p) => targetPath.startsWith(p))) {
    sendJson(res, 404, { code: 404, msg: 'Only /admin-api/* and /ruoyi-api/* are proxied' });
    return;
  }

  // Read body (with size limit). Never log it — it may contain a token/password.
  const chunks = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { tooBig = true; return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (tooBig) { sendJson(res, 413, { code: 413, msg: 'Body too large' }); return; }
    const body = Buffer.concat(chunks);
    try {
      const upstreamUrl = UPSTREAM + targetPath + url.search;
      const headers = { connection: 'close' };
      // Forward only the headers Halo needs. Never forward cookies/host.
      for (const h of ['authorization', 'content-type', 'ua', 'language', 'accept']) {
        if (req.headers[h]) headers[h] = req.headers[h];
      }
      const upstreamRes = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      const outBody = Buffer.from(await upstreamRes.arrayBuffer());
      // Set OUR single CORS header. Do NOT copy Halo's CORS headers
      // (it sends Access-Control-Allow-Origin twice, which browsers reject).
      corsHeaders(res);
      const ct = upstreamRes.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.writeHead(upstreamRes.status);
      res.end(outBody);
      // Minimal log: method + path + status only. No token, no body.
      console.log(new Date().toISOString(), req.method, targetPath, upstreamRes.status);
    } catch (e) {
      console.log(new Date().toISOString(), req.method, targetPath, 'UPSTREAM_ERROR');
      sendJson(res, 502, { code: 502, msg: 'Upstream Halo server did not answer' });
    }
  });
});

server.listen(PORT, () => {
  console.log('halo-relay listening on port ' + PORT);
});
