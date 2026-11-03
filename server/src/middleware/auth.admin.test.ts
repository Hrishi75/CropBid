// =============================================================================
// An admin token is checked against the account on every request
// =============================================================================
// An access token keeps the role it was minted with for its five minutes. The
// check lives in authenticate(), not requireRole, because some reads grant
// platform-wide access from the role alone with no requireRole in front of them
// (GET /transactions, a deal's detail, analytics). So the test route below has
// no requireRole at all: it is the shape those routes have.
// =============================================================================

import express from 'express';
import type { AddressInfo } from 'net';
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { authenticate } from './auth';
import { errorHandler } from './errorHandler';
import { generateTokens } from '../utils/jwt';

const app = express();
app.get('/any', authenticate, (req, res) => { res.json({ role: req.user!.role }); });
app.use(errorHandler);

const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => { server.close(); });

const admin = generateTokens('ops1', 'ADMIN').accessToken;
const farmer = generateTokens('farm1', 'FARMER').accessToken;

async function call(token: string) {
  const res = await fetch(`${base()}/any`, { headers: { authorization: `Bearer ${token}` } });
  return res.status;
}

beforeEach(() => findUnique.mockReset());

describe('admin tokens', () => {
  it('let a current admin through', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', suspended: false });
    expect(await call(admin)).toBe(200);
  });

  it('refuse an account that is no longer an admin, on a route with no requireRole', async () => {
    findUnique.mockResolvedValue({ role: 'CONSUMER', suspended: false });
    expect(await call(admin)).toBe(403);
  });

  it('refuse a suspended admin', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', suspended: true });
    expect(await call(admin)).toBe(403);
  });

  it('refuse an account that is gone', async () => {
    findUnique.mockResolvedValue(null);
    expect(await call(admin)).toBe(403);
  });

  it('cost every other role nothing', async () => {
    expect(await call(farmer)).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
