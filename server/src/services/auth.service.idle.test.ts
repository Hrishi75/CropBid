// =============================================================================
// auth.service idle-session tests — the 15-minute inactivity timeout
// =============================================================================
// The refresh token IS the inactivity window: it is rotated on every refresh,
// so a session slides forward while the user is active and dies once they stop.
// What's pinned down here:
//   - the token lifetimes that make the sliding window work at all (the access
//     token MUST outlive its window by less than the idle timeout, or an active
//     user gets logged out mid-session)
//   - an aged-out token is reported as SESSION_IDLE, not "invalid", so the
//     login screen can explain itself
//   - a merely-old-but-unexpired token still refreshes, i.e. staying active
//     really does keep the session alive
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('./audit.service', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import { refresh } from './auth.service';
import { generateTokens } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { config } from '../config';

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);

const MINUTE = 60 * 1000;

// Mint a refresh token as if it had been issued `minutesAgo` in the past, by
// running generateTokens against a faked clock. Real signing, real expiry —
// only "now" moves.
function refreshTokenIssuedMinutesAgo(minutesAgo: number): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() - minutesAgo * MINUTE));
  const { refreshToken } = generateTokens('user-1', 'FARMER');
  vi.useRealTimers();
  return refreshToken;
}

function farmerRow(refreshToken: string) {
  return {
    id: 'user-1',
    name: 'Asha',
    role: 'FARMER',
    suspended: false,
    refreshToken,
    password: 'hashed',
    passwordResetToken: null,
    passwordResetExpires: null,
    farmerProfile: null,
    buyerProfile: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('token lifetimes', () => {
  it('expires the refresh token exactly one idle window after issue', () => {
    const { refreshToken } = generateTokens('user-1', 'FARMER');
    const { iat, exp } = jwt.decode(refreshToken) as { iat: number; exp: number };

    expect(exp - iat).toBe(config.auth.idleTimeoutMinutes * 60);
  });

  it('expires the access token well before the idle window closes', () => {
    const { accessToken } = generateTokens('user-1', 'FARMER');
    const { iat, exp } = jwt.decode(accessToken) as { iat: number; exp: number };

    expect(exp - iat).toBe(config.auth.accessTokenMinutes * 60);

    // The whole scheme rests on this gap: an active user must hit a 401 and
    // re-arm the sliding window with time to spare. If the access token ever
    // reached the idle timeout, both tokens would die together and every
    // session would end at 15 minutes regardless of activity.
    expect(config.auth.accessTokenMinutes).toBeLessThan(config.auth.idleTimeoutMinutes);
  });
});

describe('refresh — inactivity timeout', () => {
  it('rejects a refresh token that aged past the idle window as SESSION_IDLE', async () => {
    const stale = refreshTokenIssuedMinutesAgo(config.auth.idleTimeoutMinutes + 1);

    // The DB still holds this token — it was never revoked, the user just left.
    mockFindUnique.mockResolvedValue(farmerRow(stale) as any);

    await expect(refresh(stale)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_IDLE',
    });

    // Expiry is decided from the token alone; no session lookup is needed.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not label a forged token as an idle timeout', async () => {
    const forged = jwt.sign({ userId: 'user-1' }, 'not-the-refresh-secret', { expiresIn: '15m' });

    await expect(refresh(forged)).rejects.toMatchObject({ statusCode: 401 });
    await expect(refresh(forged)).rejects.toSatisfy(
      (err: ApiError) => err.code === undefined,
    );
  });

  it('still refreshes an old-but-unexpired token, sliding the window forward', async () => {
    const nearlyStale = refreshTokenIssuedMinutesAgo(config.auth.idleTimeoutMinutes - 1);
    mockFindUnique.mockResolvedValue(farmerRow(nearlyStale) as any);
    mockUpdate.mockResolvedValue({} as any);

    const result = await refresh(nearlyStale);

    // Rotated: the stored token is replaced with a brand new one, which is what
    // restarts the 15-minute clock.
    expect(result.refreshToken).not.toBe(nearlyStale);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { refreshToken: result.refreshToken },
      }),
    );
  });
});
