// =============================================================================
// Buying mode: a seller acts as a buyer only with an approved buyer profile
// =============================================================================
// A local shop that has also been approved to buy keeps one account and sends
// X-Act-As: BUYER while in buying mode (middleware/auth). The header must be
// worth nothing on its own: the database decides.
//
// Real HTTP against the real middleware and a real requireRole, because the
// claim is that every existing buyer-only route opens for an approved seller in
// buying mode and for nobody else.
//
//   1. Without the header, a seller is a seller: buyer routes refuse it.
//   2. With the header and an APPROVED buyer profile, buyer routes let it in,
//      as BUYER, with its real role kept as accountRole.
//   3. With the header and a PENDING buyer profile, or none, it is refused
//      with a code the app routes on, not quietly treated as a seller.
//   4. Seller routes refuse it while it is in buying mode: one side at a time.
//   5. A shopper cannot use the header at all.
//   6. Anything but BUYER is a bad request.
// =============================================================================

import express from 'express';
import type { AddressInfo } from 'net';
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('../lib/prisma', () => ({
  prisma: { buyerProfile: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { authenticate } from './auth';
import { requireRole } from './roleGuard';
import { errorHandler } from './errorHandler';
import { generateTokens } from '../utils/jwt';

const app = express();
app.get('/buyer-only', authenticate, requireRole('BUYER'), (req, res) => {
  res.json({ role: req.user!.role, accountRole: req.user!.accountRole ?? null });
});
app.get('/seller-only', authenticate, requireRole('FARMER'), (_req, res) => { res.json({ ok: true }); });
app.use(errorHandler);

const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => { server.close(); });

const seller = generateTokens('shop1', 'FARMER').accessToken;
const shopper = generateTokens('home1', 'CONSUMER').accessToken;

async function call(path: string, token: string, actAs?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (actAs !== undefined) headers['x-act-as'] = actAs;
  const res = await fetch(`${base()}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => findUnique.mockReset());

describe('buying mode', () => {
  it('leaves a seller a seller without the header', async () => {
    expect((await call('/buyer-only', seller)).status).toBe(403);
    expect((await call('/seller-only', seller)).status).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('lets an approved seller onto buyer routes as a buyer', async () => {
    findUnique.mockResolvedValue({ status: 'APPROVED' });
    const r = await call('/buyer-only', seller, 'BUYER');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ role: 'BUYER', accountRole: 'FARMER' });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'shop1' } }));
  });

  it('refuses a seller whose buyer application is still pending', async () => {
    findUnique.mockResolvedValue({ status: 'PENDING' });
    const r = await call('/buyer-only', seller, 'BUYER');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('BUYER_MODE_NOT_APPROVED');
  });

  it('refuses a seller with no buyer application at all', async () => {
    findUnique.mockResolvedValue(null);
    const r = await call('/buyer-only', seller, 'BUYER');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('BUYER_MODE_NOT_APPROVED');
  });

  it('closes the seller side while buying', async () => {
    findUnique.mockResolvedValue({ status: 'APPROVED' });
    expect((await call('/seller-only', seller, 'BUYER')).status).toBe(403);
  });

  it('gives a shopper nothing', async () => {
    const r = await call('/buyer-only', shopper, 'BUYER');
    expect(r.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses any mode but BUYER', async () => {
    expect((await call('/buyer-only', seller, 'ADMIN')).status).toBe(400);
  });
});
