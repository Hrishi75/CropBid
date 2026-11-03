// =============================================================================
// requireRole('ADMIN') checks the database, not only the token
// =============================================================================
// An access token keeps the role it was minted with for its five minutes, so a
// demoted or suspended admin used to keep refunds, password resets and payout
// reads until it ran out. Other roles still trust the token: no lookup.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
vi.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { requireRole } from './roleGuard';

function run(role: string, allowed: string[] = ['ADMIN']): Promise<unknown> {
  return new Promise((resolve) => {
    const req = { user: { userId: 'u1', role } } as any;
    try {
      requireRole(...allowed)(req, {} as any, (err?: unknown) => resolve(err ?? 'ok'));
    } catch (err) {
      resolve(err);
    }
  });
}

beforeEach(() => findUnique.mockReset());

describe('requireRole and admin tokens', () => {
  it('lets a current admin through', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', suspended: false });
    expect(await run('ADMIN')).toBe('ok');
  });

  it('refuses a token whose account is no longer an admin', async () => {
    findUnique.mockResolvedValue({ role: 'CONSUMER', suspended: false });
    expect(await run('ADMIN')).toMatchObject({ statusCode: 403 });
  });

  it('refuses a suspended admin', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', suspended: true });
    expect(await run('ADMIN')).toMatchObject({ statusCode: 403 });
  });

  it('refuses an admin token for an account that is gone', async () => {
    findUnique.mockResolvedValue(null);
    expect(await run('ADMIN')).toMatchObject({ statusCode: 403 });
  });

  it('checks an admin on a mixed route too', async () => {
    findUnique.mockResolvedValue({ role: 'FARMER', suspended: false });
    expect(await run('ADMIN', ['FARMER', 'ADMIN'])).toMatchObject({ statusCode: 403 });
  });

  it('does not look up anyone else', async () => {
    expect(await run('FARMER', ['FARMER', 'ADMIN'])).toBe('ok');
    expect(findUnique).not.toHaveBeenCalled();
  });
});
