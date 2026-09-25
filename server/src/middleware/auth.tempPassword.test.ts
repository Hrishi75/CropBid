// =============================================================================
// A temporary password buys one thing: the chance to choose a real one
// =============================================================================
// An admin resets the password of somebody locked out and reads it down the
// phone (admin.service.resetUserPassword). What keeps that from being an
// account somebody has spoken aloud is this middleware, not the UI: a session
// holding a temporary password is refused everywhere except the change itself.
//
// Real HTTP against the real middleware, because the claim being tested is
// about requests, and because the allow-list matches on the full path, which a
// hand-built request object would not have.
//
//   1. An ordinary token reaches an ordinary route.
//   2. A token that owes a password change does not, and says so with a code
//      the clients route on.
//   3. It still reaches change-password, /me and logout, which is what it is
//      for.
//   4. The refusal is a 403 and not a 401: a 401 would send the user back to
//      the sign-in screen to type the temporary password again, which is the
//      loop this whole feature exists to end.
//   5. The socket handshake applies the same rule. It takes the same token,
//      and without this a reset account could bid over a socket while being
//      refused on every HTTP route. Review caught it.
// =============================================================================

import express from 'express';
import type { AddressInfo } from 'net';
import { describe, it, expect, afterAll } from 'vitest';

import { authenticate } from './auth';
import { handshakeIdentity } from '../socket';
import { errorHandler } from './errorHandler';
import { generateTokens } from '../utils/jwt';

// The paths the app really mounts, so the allow-list is exercised as written.
const app = express();
app.post('/api/auth/change-password', authenticate, (_req, res) => { res.json({ ok: 'changed' }); });
app.get('/api/auth/me', authenticate, (_req, res) => { res.json({ ok: 'me' }); });
// Not a real route. It exists so the test can prove the allow-list matches on
// the method as well as the path: without a route mounted here Express would
// answer 404 before any middleware ran, and the test would pass on a guard
// that ignored the method entirely.
app.post('/api/auth/me', authenticate, (_req, res) => { res.json({ ok: 'me-post' }); });
app.post('/api/auth/logout', authenticate, (_req, res) => { res.json({ ok: 'out' }); });
app.get('/api/listings', authenticate, (_req, res) => { res.json({ ok: 'listings' }); });
app.post('/api/bids', authenticate, (_req, res) => { res.json({ ok: 'bid' }); });
app.use(errorHandler);

const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => { server.close(); });

const ordinary = generateTokens('u1', 'CONSUMER').accessToken;
const owing = generateTokens('u1', 'CONSUMER', true).accessToken;

async function call(method: string, path: string, token: string) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

describe('an ordinary session', () => {
  it('reaches an ordinary route', async () => {
    expect(await call('GET', '/api/listings', ordinary)).toMatchObject({ status: 200 });
  });
});

describe('a session that owes a password change', () => {
  it('is refused everywhere else, with a code the clients can act on', async () => {
    for (const [method, path] of [['GET', '/api/listings'], ['POST', '/api/bids']] as const) {
      const res = await call(method, path, owing);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  // A 401 would read as "sign in again", which sends them round the loop of
  // typing the temporary password they were just told.
  it('is refused with 403, never 401', async () => {
    expect((await call('GET', '/api/listings', owing)).status).not.toBe(401);
  });

  it('still reaches the change itself, who it is, and the way out', async () => {
    expect(await call('POST', '/api/auth/change-password', owing)).toMatchObject({ status: 200 });
    expect(await call('GET', '/api/auth/me', owing)).toMatchObject({ status: 200 });
    expect(await call('POST', '/api/auth/logout', owing)).toMatchObject({ status: 200 });
  });

  // The allow-list is per method as well as per path: reading the change
  // endpoint is not changing anything.
  it('does not treat the allowed paths as open to any method', async () => {
    const res = await fetch(`${base()}/api/auth/me`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owing}` },
    });
    // Only GET /api/auth/me is allowed, so the POST is refused even though a
    // route is mounted behind it.
    expect(res.status).toBe(403);
  });
});

// The handshake takes the same access token as every route, so the gate has to
// be there too, not only in the Express middleware. Called directly rather than
// through a real socket: a client library for one test is a dependency the
// server does not otherwise need.
describe('the socket handshake', () => {
  it('lets an ordinary session in', () => {
    expect(handshakeIdentity(ordinary)).toMatchObject({ userId: 'u1', role: 'CONSUMER' });
  });

  it('refuses one that owes a password change', () => {
    expect(() => handshakeIdentity(owing)).toThrow('Choose a new password before you carry on');
  });

  it('still refuses a missing or broken token', () => {
    expect(() => handshakeIdentity(undefined)).toThrow('Authentication required');
    expect(() => handshakeIdentity('not-a-token')).toThrow('Invalid token');
  });
});
