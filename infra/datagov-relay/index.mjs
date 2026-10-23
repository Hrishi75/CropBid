// =============================================================================
// data.gov.in relay: an AWS Lambda in Mumbai (ap-south-1)
// =============================================================================
// data.gov.in refuses connections from the API's Lightsail box, which is in
// the US (measured 2026-10-23: "Connection refused" from there, a normal reply
// from an Indian connection to the same address). This function runs in
// Mumbai and forwards the API's mandi-feed requests, so the request reaches
// data.gov.in from an Indian address. README.md beside it is the setup.
//
// It forwards one thing only: a GET of /resource/<id> on api.data.gov.in,
// with the query passed through untouched (the API key is in it). Anything
// without the shared secret is refused before any upstream call is made, so
// the function cannot be used as an open proxy or run up anybody's bill.
//
// Replies are gzipped: the largest page is about 3.8 MB of JSON and growing,
// against a 6 MB ceiling on a Lambda function URL reply, and gzip takes it to
// about 220 KB. Node's fetch on the API side decompresses it on its own.
//
// Nothing here logs the URL, because the query carries the API key.
// =============================================================================

import { gzipSync } from 'node:zlib';
import { createHash, timingSafeEqual } from 'node:crypto';

const UPSTREAM = 'https://api.data.gov.in';
const RESOURCE_PATH = /^\/resource\/[0-9a-f-]{36}$/;
// Under the API's own 45 s per request, so the API sees our 504 rather than
// abandoning the call, and under the function's 60 s timeout.
const UPSTREAM_TIMEOUT_MS = 40_000;
const SECRET = process.env.RELAY_SECRET ?? '';

// At most this many forwarded requests an hour per running copy, counted only
// after the secret is checked, so a stranger cannot spend it. With reserved
// concurrency 2 that is under 300 x 2 x 24 x 30 = 432,000 a month, inside the
// 1,000,000 free. Normal use is a sweep of about 37 every two hours. The API
// treats the 429 like data.gov.in's own: it waits and tries once more later.
const MAX_PER_HOUR = 300;
let windowStart = 0;
let forwarded = 0;
function overHourlyCap() {
  const now = Date.now();
  if (now - windowStart >= 60 * 60 * 1000) { windowStart = now; forwarded = 0; }
  forwarded += 1;
  return forwarded > MAX_PER_HOUR;
}

// Compared as hashes so the comparison takes the same time whatever the
// length of what was sent.
const digest = (s) => createHash('sha256').update(s).digest();
const sameSecret = (given) => timingSafeEqual(digest(given), digest(SECRET));

const reply = (statusCode, message) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message }),
});

export const handler = async (event) => {
  // Fails closed: a function deployed without its secret refuses everything.
  if (SECRET.length < 32) return reply(503, 'relay not configured');
  if (event.requestContext?.http?.method !== 'GET') return reply(405, 'GET only');
  if (!sameSecret(event.headers?.['x-relay-secret'] ?? '')) return reply(403, 'forbidden');
  if (!RESOURCE_PATH.test(event.rawPath ?? '')) return reply(404, 'not found');
  if (overHourlyCap()) {
    console.warn(`[relay] over ${MAX_PER_HOUR} requests this hour; refusing until the hour turns`);
    return reply(429, 'relay hourly limit reached');
  }

  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  let res;
  let body;
  try {
    res = await fetch(`${UPSTREAM}${event.rawPath}${query}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    body = await res.text();
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timed out' : (err?.cause?.code ?? err?.message ?? 'failed');
    console.warn(`[relay] upstream ${reason}`);
    return reply(err?.name === 'TimeoutError' ? 504 : 502, `upstream ${reason}`);
  }

  return {
    statusCode: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'content-encoding': 'gzip',
    },
    isBase64Encoded: true,
    body: gzipSync(body).toString('base64'),
  };
};
