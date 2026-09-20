// =============================================================================
// Refresh tokens are stored hashed, and only hashed
// =============================================================================
// The column used to hold the token itself, so anyone who could read the
// database, a backup or a dump held a working session for every signed-in
// user. What has to hold now:
//
//   1. Signing in stores the SHA-256 of the token, never the token.
//   2. Refreshing accepts the real token, and rotates to a new stored hash.
//   3. The stored hash is NOT a credential: presenting it as a token fails,
//      because the JWT signature is checked before anything is compared.
//   4. A token from another account, or from before this change, is refused.
//   5. Logout still clears the column.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('./notification.helpers', () => ({}));

import { prisma } from '../lib/prisma';
import { generateTokens } from '../utils/jwt';
import { hashRefreshToken } from '../utils/refreshToken';
import { login, logout, refresh, signup } from './auth.service';
import bcrypt from 'bcryptjs';

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const userFindUnique = mock(prisma.user.findUnique);
const userFindFirst = mock(prisma.user.findFirst);
const userCreate = mock(prisma.user.create);
const userUpdate = mock(prisma.user.update);

const USER_ID = 'user-1';

async function userRow(extra: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Anita',
    email: 'anita@example.com',
    password: await bcrypt.hash('password123', 4),
    role: 'CONSUMER',
    suspended: false,
    refreshToken: null as string | null,
    passwordResetToken: null,
    passwordResetExpires: null,
    farmerProfile: null,
    buyerProfile: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userUpdate.mockResolvedValue({});
});

// login() finds the account by email or phone; refresh() by the id in the
// token. Point both at the same row.
async function accountIs(row: Record<string, unknown>) {
  userFindUnique.mockResolvedValue(row);
  userFindFirst.mockResolvedValue(row);
}

// What went into the database on the last write.
const stored = () => userUpdate.mock.calls.at(-1)?.[0].data.refreshToken as string | null;

describe('signing in', () => {
  it('stores the hash of the refresh token, not the token', async () => {
    await accountIs(await userRow());

    const result = await login({ identifier: 'anita@example.com', password: 'password123' });

    expect(result.refreshToken).toBeTruthy();
    // The row holds a digest, and the token itself appears nowhere in it.
    expect(stored()).toBe(hashRefreshToken(result.refreshToken));
    expect(stored()).not.toBe(result.refreshToken);
    expect(stored()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('never returns the stored value to the caller', async () => {
    await accountIs(await userRow());
    const result = await login({ identifier: 'anita@example.com', password: 'password123' });
    expect((result.user as Record<string, unknown>).refreshToken).toBeUndefined();
  });
});

// Signing up goes through a different write than signing in
// (createUserAndIssueTokens), so it gets its own test rather than being assumed.
describe('signing up', () => {
  it('stores the hash for a brand new account', async () => {
    userFindFirst.mockResolvedValue(null);
    userCreate.mockResolvedValue(await userRow({ id: 'new-user' }));

    const result = await signup({
      name: 'Anita',
      email: 'new@example.com',
      password: 'password123',
    } as Parameters<typeof signup>[0]);

    expect(stored()).toBe(hashRefreshToken(result.refreshToken));
    expect(stored()).not.toBe(result.refreshToken);
  });
});

describe('refreshing', () => {
  it('accepts the real token against the stored hash, and rotates it', async () => {
    const { refreshToken } = generateTokens(USER_ID, 'CONSUMER');
    await accountIs(await userRow({ refreshToken: hashRefreshToken(refreshToken) }));

    const result = await refresh(refreshToken);

    // Rotated: whatever it handed back is what the row now holds, hashed. (The
    // new token can be byte-identical to the old one when both are minted in
    // the same second, since the payload and expiry are the same; what matters
    // is that the stored value is a digest of what the caller was given.)
    expect(stored()).toBe(hashRefreshToken(result.refreshToken));
    expect(stored()).not.toBe(result.refreshToken);
  });

  // The whole point: what the database holds cannot be presented as a session.
  // refresh() verifies the JWT signature first, and a digest is not a JWT.
  it('refuses the stored hash when it is offered as a token', async () => {
    const { refreshToken } = generateTokens(USER_ID, 'CONSUMER');
    const hash = hashRefreshToken(refreshToken);
    await accountIs(await userRow({ refreshToken: hash }));

    await expect(refresh(hash)).rejects.toMatchObject({ statusCode: 401 });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // Rows written before this change hold a raw token. It no longer matches, so
  // that one session is signed out rather than silently accepted.
  it('refuses a token that is stored in the clear', async () => {
    const { refreshToken } = generateTokens(USER_ID, 'CONSUMER');
    await accountIs(await userRow({ refreshToken }));

    await expect(refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a valid token for a different session', async () => {
    const mine = generateTokens(USER_ID, 'CONSUMER').refreshToken;
    const someoneElse = generateTokens('user-2', 'CONSUMER').refreshToken;
    await accountIs(await userRow({ refreshToken: hashRefreshToken(someoneElse) }));

    await expect(refresh(mine)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses when the account has been logged out', async () => {
    const { refreshToken } = generateTokens(USER_ID, 'CONSUMER');
    await accountIs(await userRow({ refreshToken: null }));

    await expect(refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  // Suspension is still answered before the token match, so a suspended user
  // is told why instead of being told their session is gone.
  it('still reports suspension rather than a revoked token', async () => {
    const { refreshToken } = generateTokens(USER_ID, 'CONSUMER');
    await accountIs(await userRow({ refreshToken: null, suspended: true }));

    await expect(refresh(refreshToken)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('logging out', () => {
  it('clears the column', async () => {
    await logout(USER_ID);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { refreshToken: null } });
  });
});
