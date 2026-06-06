// Dev-only CORS proxy for the Expo *web* preview.
// The prod API pins Access-Control-Allow-Origin to https://cropbid.in, so a
// browser at http://localhost:8081 is blocked. Native apps ignore CORS, so this
// is only needed for the web build. Forwards everything to the prod API and
// replaces the CORS headers with permissive ones.
//
//   node scripts/cors-proxy.mjs   →   http://localhost:8787  ➜  prod API
//
// Then point mobile/.env at it: EXPO_PUBLIC_API_URL=http://localhost:8787/api
import http from 'node:http';
import https from 'node:https';

const TARGET = process.env.PROXY_TARGET ?? 'https://cropbid-api-oyfv.onrender.com';
const PORT = Number(process.env.PROXY_PORT ?? 8787);
const target = new URL(TARGET);

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers['access-control-request-headers'] ??
      'Content-Type,Authorization,X-Client,X-Refresh-Token',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const headers = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;

  const proxyReq = https.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: 443,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const out = { ...proxyRes.headers };
      for (const k of Object.keys(out)) {
        if (k.toLowerCase().startsWith('access-control-')) delete out[k];
      }
      Object.assign(out, cors);
      res.writeHead(proxyRes.statusCode ?? 502, out);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (e) => {
    res.writeHead(502, cors);
    res.end(JSON.stringify({ message: `proxy error: ${e.message}` }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`CORS proxy → ${TARGET} on http://localhost:${PORT}`);
});
