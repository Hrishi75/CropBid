// =============================================================================
// auth.service buyer OTP tests — verifying and resending the signup code
// =============================================================================
// The code is only six digits, so the guarantees that make it safe are not in
// the code itself but in the rules around it: it expires, it survives a fixed
// number of wrong guesses, it works exactly once, and a resend replaces it
// rather than adding a second live code. Each of those is a test here.
//
// The other half is what happens at the moment of success: the account is
// created from the PARKED details (with the password hash carried across, never
// re-hashed), and the identifiers are re-checked because ten minutes is long
// enough for someone else to have registered them.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pendingSignup: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('./email.service', () => ({
  sendSignupOtpEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { prisma } from '../lib/prisma';
import { verifyBuyerSignup, resendBuyerSignupOtp } from './auth.service';
import { sendSignupOtpEmail } from './email.service';
import { ApiError } from '../utils/ApiError';
import {
  hashSignupOtp,
  SIGNUP_OTP_MAX_ATTEMPTS,
  SIGNUP_OTP_RESEND_COOLDOWN_MS,
} from '../utils/signupOtp';

const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockUserCreate = vi.mocked(prisma.user.create);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockPendingFindUnique = vi.mocked(prisma.pendingSignup.findUnique);
const mockPendingUpdate = vi.mocked(prisma.pendingSignup.update);
const mockPendingDelete = vi.mocked(prisma.pendingSignup.delete);
const mockSendOtp = vi.mocked(sendSignupOtpEmail);

const CODE = '483920';
const HASHED_PASSWORD = '$2b$12$abcdefghijklmnopqrstuv';

// A pending row as it sits in the database: code hashed, password already
// bcrypted by startBuyerSignup, ten minutes left to live.
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pending-1',
    email: 'buyer@cropbid.test',
    phone: '+919876543210',
    name: 'Rajesh',
    password: HASHED_PASSWORD,
    role: 'BUYER',
    country: 'India',
    currency: 'INR',
    language: 'EN',
    codeHash: hashSignupOtp(CODE),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    lastSentAt: new Date(Date.now() - SIGNUP_OTP_RESEND_COOLDOWN_MS - 1000),
    createdAt: new Date(),
    ...overrides,
  } as any;
}

const createdUser = {
  id: 'user-1',
  name: 'Rajesh',
  phone: '+919876543210',
  email: 'buyer@cropbid.test',
  password: HASHED_PASSWORD,
  refreshToken: null,
  passwordResetToken: null,
  passwordResetExpires: null,
  role: 'BUYER',
  farmerProfile: null,
  buyerProfile: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Nothing already registered, unless a test says otherwise.
  mockUserFindUnique.mockResolvedValue(null as any);
  mockUserFindFirst.mockResolvedValue(null as any);
  mockUserCreate.mockResolvedValue(createdUser);
  mockUserUpdate.mockResolvedValue(createdUser);
  mockPendingUpdate.mockResolvedValue(pendingRow({ attempts: 1 }));
  mockPendingDelete.mockResolvedValue({} as any);
  mockSendOtp.mockResolvedValue(undefined);
});

describe('verifyBuyerSignup', () => {
  it('creates the account from the parked details on the right code', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());

    const result = await verifyBuyerSignup({ pendingId: 'pending-1', code: CODE });

    expect(result.accessToken).toBeTruthy();
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'buyer@cropbid.test',
          phone: '+919876543210',
          name: 'Rajesh',
          role: 'BUYER',
        }),
      }),
    );
  });

  it('carries the stored hash across instead of re-hashing it', async () => {
    // Re-hashing a bcrypt hash would produce a password nobody can ever log in
    // with — the user would type the right thing and be told it is wrong.
    mockPendingFindUnique.mockResolvedValue(pendingRow());

    await verifyBuyerSignup({ pendingId: 'pending-1', code: CODE });

    const { data } = mockUserCreate.mock.calls[0][0] as any;
    expect(data.password).toBe(HASHED_PASSWORD);
  });

  it('strips sensitive fields from the returned user', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());

    const result = await verifyBuyerSignup({ pendingId: 'pending-1', code: CODE });

    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('passwordResetToken');
  });

  it('deletes the pending row so the code cannot be used twice', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());

    await verifyBuyerSignup({ pendingId: 'pending-1', code: CODE });

    expect(mockPendingDelete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('rejects an unknown pending id', async () => {
    mockPendingFindUnique.mockResolvedValue(null as any);

    await expect(
      verifyBuyerSignup({ pendingId: 'nope', code: CODE }),
    ).rejects.toMatchObject(new ApiError(400, 'This code has expired. Please start again.'));
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('rejects an expired code and clears the row', async () => {
    mockPendingFindUnique.mockResolvedValue(
      pendingRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: CODE }),
    ).rejects.toMatchObject(new ApiError(400, 'This code has expired. Please start again.'));
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockPendingDelete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('counts a wrong code against the attempt cap and says how many are left', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());
    mockPendingUpdate.mockResolvedValue(pendingRow({ attempts: 1 }));

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: '000000' }),
    ).rejects.toMatchObject(
      new ApiError(400, 'That code is incorrect. 4 attempts left.'),
    );
    expect(mockPendingUpdate).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: { attempts: { increment: 1 } },
    });
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('singularises the last remaining attempt', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow({ attempts: 3 }));
    mockPendingUpdate.mockResolvedValue(pendingRow({ attempts: 4 }));

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: '000000' }),
    ).rejects.toMatchObject(new ApiError(400, 'That code is incorrect. 1 attempt left.'));
  });

  it('ends the flow when the final attempt is burned', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow({ attempts: 4 }));
    mockPendingUpdate.mockResolvedValue(pendingRow({ attempts: 5 }));

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: '000000' }),
    ).rejects.toMatchObject(
      new ApiError(400, 'Too many incorrect codes. Please start again.'),
    );
    expect(mockPendingDelete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('refuses a row already at the attempt cap, even with the right code', async () => {
    // Otherwise the cap is only a speed bump: guess five times, then walk in
    // with the code once it finally arrives.
    mockPendingFindUnique.mockResolvedValue(
      pendingRow({ attempts: SIGNUP_OTP_MAX_ATTEMPTS }),
    );

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: CODE }),
    ).rejects.toMatchObject(
      new ApiError(400, 'Too many incorrect codes. Please start again.'),
    );
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('re-checks the email, which may have been registered while the code sat unused', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());
    mockUserFindFirst.mockResolvedValue(createdUser);

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: CODE }),
    ).rejects.toMatchObject(
      new ApiError(409, 'An account with this email already exists'),
    );
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('re-checks the phone too', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());
    mockUserFindUnique.mockResolvedValue(createdUser);

    await expect(
      verifyBuyerSignup({ pendingId: 'pending-1', code: CODE }),
    ).rejects.toMatchObject(
      new ApiError(409, 'An account with this phone number already exists'),
    );
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

describe('resendBuyerSignupOtp', () => {
  it('issues a NEW code rather than resending the old one', async () => {
    // An abandoned attempt's code must stop working the moment another is asked
    // for, or every resend leaves one more live code in an inbox.
    const row = pendingRow();
    mockPendingFindUnique.mockResolvedValue(row);

    await resendBuyerSignupOtp({ pendingId: 'pending-1' });

    const { data } = mockPendingUpdate.mock.calls[0][0] as any;
    expect(data.codeHash).not.toBe(row.codeHash);
    const [, , code] = mockSendOtp.mock.calls[0];
    expect(data.codeHash).toBe(hashSignupOtp(code));
  });

  it('sends to the parked address, not one supplied by the caller', async () => {
    mockPendingFindUnique.mockResolvedValue(pendingRow());

    await resendBuyerSignupOtp({ pendingId: 'pending-1' });

    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    expect(mockSendOtp.mock.calls[0][0]).toBe('buyer@cropbid.test');
  });

  it('enforces the cooldown', async () => {
    mockPendingFindUnique.mockResolvedValue(
      pendingRow({ lastSentAt: new Date(Date.now() - 10_000) }),
    );

    await expect(resendBuyerSignupOtp({ pendingId: 'pending-1' })).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('does NOT reset the attempt counter', async () => {
    // Resetting it would hand an attacker a fresh five guesses every minute
    // against a code sitting in someone else's inbox.
    mockPendingFindUnique.mockResolvedValue(pendingRow({ attempts: 4 }));

    await resendBuyerSignupOtp({ pendingId: 'pending-1' });

    const { data } = mockPendingUpdate.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty('attempts');
  });

  it('rejects an unknown pending id', async () => {
    mockPendingFindUnique.mockResolvedValue(null as any);

    await expect(resendBuyerSignupOtp({ pendingId: 'nope' })).rejects.toMatchObject(
      new ApiError(400, 'This code has expired. Please start again.'),
    );
    expect(mockSendOtp).not.toHaveBeenCalled();
  });
});
