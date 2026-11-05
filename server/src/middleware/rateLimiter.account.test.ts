// =============================================================================
// Sign-in guesses are rationed per account, whatever address they come from
// =============================================================================
// authLimiter keys on (ip + account), so every new address got a fresh fifteen
// tries at the same account. Worse on the phone lane: three wrong codes delete
// the code, a new one could be asked for at once, and /phone/verify names no
// account at all, so its limit was per address only. What has to hold:
//
//   1. Both routes actually mount their limiter (the bug was a route without).
//   2. Thirty wrong passwords an hour per account, then refused; a successful
//      sign-in costs nothing; another account is untouched.
//   3. Five codes an hour per number, then refused, and neither a different
//      fallback email nor a different spelling of the number buys more.
// =============================================================================

import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'net';
import { describe, it, expect, afterEach } from 'vitest';

import { loginAccountLimiter, phoneCodeLimiter, phoneKey } from './rateLimiter';
import authRoutes from '../routes/auth.routes';

// The exported limiters keep one store for the life of the process, so every
// test uses its own account names and no two tests share a bucket. Real HTTP,
// and every request from a different forwarded address, which is the attack.
async function serve(limiter: RequestHandler, status: (body: any) => number) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.post('/x', limiter, (req, res) => {
    res.status(status(req.body)).json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  let n = 0;
  return {
    // Every request from a different address, which is the attack.
    post: (body: unknown) =>
      fetch(`http://127.0.0.1:${port}/x`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(++n / 250)}.${n % 250}` },
        body: JSON.stringify(body),
      }).then((r) => r.status),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

function chainOf(path: string) {
  const layer = (authRoutes as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  expect(layer).toBeDefined();
  return layer.route.stack.map((s: any) => s.handle);
}

describe('the sign-in routes', () => {
  it('mount the per-account limiters ahead of their handlers', () => {
    expect(chainOf('/login')[0]).toBe(loginAccountLimiter);
    expect(chainOf('/phone/start')[0]).toBe(phoneCodeLimiter);
  });
});

describe('loginAccountLimiter', () => {
  it('refuses the 31st wrong password for one account, from any address', async () => {
    const s = await serve(loginAccountLimiter, () => 401);
    open.push(s);
    const body = { identifier: 'victim-a@example.com', password: 'guess' };
    for (let i = 0; i < 30; i++) expect(await s.post(body)).toBe(401);
    expect(await s.post(body)).toBe(429);
    // Same account, different case: still the same bucket.
    expect(await s.post({ ...body, identifier: 'VICTIM-A@example.com' })).toBe(429);
    // Another account is untouched.
    expect(await s.post({ ...body, identifier: 'bystander-a@example.com' })).toBe(401);
  });

  it('never counts a successful sign-in', async () => {
    const s = await serve(loginAccountLimiter, () => 200);
    open.push(s);
    const body = { identifier: 'regular-b@example.com', password: 'right' };
    for (let i = 0; i < 40; i++) expect(await s.post(body)).toBe(200);
  });
});

describe('phoneCodeLimiter', () => {
  it('sends five codes an hour per number, then refuses', async () => {
    const s = await serve(phoneCodeLimiter, () => 200);
    open.push(s);
    for (let i = 0; i < 5; i++) expect(await s.post({ phone: '9811100001' })).toBe(200);
    expect(await s.post({ phone: '9811100001' })).toBe(429);
    expect(await s.post({ phone: '9811100002' })).toBe(200);
  });

  it('gives no fresh allowance for a different fallback email or spelling', async () => {
    const s = await serve(phoneCodeLimiter, () => 200);
    open.push(s);
    for (let i = 0; i < 5; i++) {
      expect(await s.post({ phone: '98111 00003', email: `a${i}@example.com` })).toBe(200);
    }
    expect(await s.post({ phone: '9811100003', email: 'new@example.com' })).toBe(429);
    expect(await s.post({ phone: '98111-00003' })).toBe(429);
  });
});

describe('phoneKey', () => {
  it('keys on the number alone, never the email', () => {
    expect(phoneKey({ phone: '98111 00009', email: 'x@example.com' })).toBe(phoneKey({ phone: '9811100009' }));
    expect(phoneKey({ email: 'x@example.com' })).toBe('');
    expect(phoneKey({ phone: '  ' })).toBe('');
    expect(phoneKey(undefined)).toBe('');
  });
});
