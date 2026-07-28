// =============================================================================
// auth.service password-flow tests — forgot / reset / change password
// =============================================================================
// Prisma, the mailer, and the audit log are mocked so these run without a
// database. What's pinned down here is the security contract:
//   - unknown emails never learn whether an account exists
//   - only the SHA-256 hash of the reset token ever reaches the database
//   - reset consumes the token and revokes every session
//   - change-password demands the current password even when authenticated
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('./email.service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./audit.service', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import { sendPasswordResetEmail } from './email.service';
import { requestPasswordReset, resetPassword, changePassword } from './auth.service';
import { hashResetToken } from '../utils/resetToken';
import { ApiError } from '../utils/ApiError';

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const mockUpdate = vi.mocked(prisma.user.update);
const mockSendReset = vi.mocked(sendPasswordResetEmail);

const baseUser = {
  id: 'user-1',
  name: 'Rajesh',
  email: 'rajesh@cropbid.test',
  role: 'FARMER',
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue(baseUser);
  // clearAllMocks wipes recorded calls but keeps implementations, so both
  // lookups get an explicit "no match" default — otherwise a test that stubs
  // one of them silently changes the meaning of the next one.
  mockFindUnique.mockResolvedValue(null);
  mockFindFirst.mockResolvedValue(null);
});

describe('requestPasswordReset', () => {
  it('does nothing for an unknown email (no enumeration signal)', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  it('uses the exact-case account when one exists, without the fallback', async () => {
    // Legacy rows can differ from each other by case alone. An exact hit must
    // win outright, or an arbitrary case-variant could receive the reset link.
    mockFindUnique.mockResolvedValue(baseUser);

    await requestPasswordReset('rajesh@cropbid.test');

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockSendReset).toHaveBeenCalled();
  });

  it('finds the account when the address is typed in a different case', async () => {
    mockFindFirst.mockResolvedValue(baseUser);

    await requestPasswordReset('  Rajesh@CropBid.test ');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'Rajesh@CropBid.test', mode: 'insensitive' } },
      }),
    );
    expect(mockSendReset).toHaveBeenCalled();
  });

  it('stores only the token hash; the raw token goes in the emailed link', async () => {
    mockFindFirst.mockResolvedValue(baseUser);

    await requestPasswordReset('rajesh@cropbid.test');

    // What was written to the database…
    const updateData = mockUpdate.mock.calls[0][0].data as any;
    const storedHash = updateData.passwordResetToken as string;
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(updateData.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());

    // …versus what was emailed.
    const resetUrl = mockSendReset.mock.calls[0][2];
    const rawToken = new URL(resetUrl).searchParams.get('token')!;
    expect(rawToken).not.toBe(storedHash);            // raw token never stored
    expect(hashResetToken(rawToken)).toBe(storedHash); // but its hash is
  });
});

describe('resetPassword', () => {
  it('rejects an invalid or expired token with a 400', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(resetPassword('bad-token', 'NewPassw0rd')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('looks the user up by token hash AND unexpired expiry', async () => {
    mockFindFirst.mockResolvedValue(baseUser);

    await resetPassword('some-raw-token', 'NewPassw0rd');

    const where = mockFindFirst.mock.calls[0][0]!.where as any;
    expect(where.passwordResetToken).toBe(hashResetToken('some-raw-token'));
    expect(where.passwordResetExpires.gt).toBeInstanceOf(Date);
  });

  it('hashes the new password, consumes the token, and revokes all sessions', async () => {
    mockFindFirst.mockResolvedValue(baseUser);

    await resetPassword('some-raw-token', 'NewPassw0rd');

    const updateData = mockUpdate.mock.calls[0][0].data as any;
    expect(updateData.password).not.toBe('NewPassw0rd'); // never plain text
    expect(await bcrypt.compare('NewPassw0rd', updateData.password)).toBe(true);
    expect(updateData.passwordResetToken).toBeNull();    // single-use
    expect(updateData.passwordResetExpires).toBeNull();
    expect(updateData.refreshToken).toBeNull();          // log out everywhere
  });
});

describe('changePassword', () => {
  it('rejects when the current password is wrong', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseUser,
      password: await bcrypt.hash('RealPassw0rd', 4),
    });

    await expect(
      changePassword('user-1', 'WrongPassw0rd', 'NewPassw0rd'),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      changePassword('ghost', 'AnyPassw0rd', 'NewPassw0rd'),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('updates the password and clears any pending reset token', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseUser,
      password: await bcrypt.hash('RealPassw0rd', 4),
    });

    await changePassword('user-1', 'RealPassw0rd', 'NewPassw0rd');

    const updateData = mockUpdate.mock.calls[0][0].data as any;
    expect(await bcrypt.compare('NewPassw0rd', updateData.password)).toBe(true);
    expect(updateData.passwordResetToken).toBeNull();
    expect(updateData.passwordResetExpires).toBeNull();
  });
});
