// =============================================================================
// auth.service signup tests — duplicate phone/email handling
// =============================================================================
// Phone is the primary identifier (required, unique); email is optional but
// also unique when present. Two signups for the same phone (or email) can both
// pass the findUnique pre-check; the unique index decides the race. Both the
// pre-check loser and the race loser must see the same 409, never a raw Prisma
// error surfacing as a 500.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { signup } from './auth.service';
import { ApiError } from '../utils/ApiError';

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
const mockUpdate = vi.mocked(prisma.user.update);

const input = {
  name: 'Rajesh',
  phone: '+919876543210',
  email: 'rajesh@cropbid.test',
  password: 'Sup3rSecret',
  role: 'FARMER' as const,
};

const createdUser = {
  id: 'user-1',
  name: input.name,
  phone: input.phone,
  email: input.email,
  password: 'hashed',
  refreshToken: null,
  role: 'FARMER',
  farmerProfile: null,
  buyerProfile: null,
} as any;

// signup looks up phone first, then email — resolve per lookup so a test can
// make exactly one of them collide.
function existingAccounts({ phone = false, email = false }) {
  mockFindUnique.mockImplementation((async (args: any) =>
    (args?.where?.phone && phone) || (args?.where?.email && email) ? createdUser : null) as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue(createdUser);
});

describe('signup', () => {
  it('rejects a phone that already has an account (pre-check)', async () => {
    existingAccounts({ phone: true });

    await expect(signup(input)).rejects.toMatchObject(
      new ApiError(409, 'An account with this phone number already exists'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an email that already has an account (pre-check)', async () => {
    existingAccounts({ email: true });

    await expect(signup(input)).rejects.toMatchObject(
      new ApiError(409, 'An account with this email already exists'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips the email pre-check when no email is given', async () => {
    existingAccounts({ email: true }); // would collide IF it were checked
    mockCreate.mockResolvedValue(createdUser);

    const result = await signup({ ...input, email: undefined });

    expect(result.accessToken).toBeTruthy();
    expect(mockFindUnique).toHaveBeenCalledTimes(1); // phone only
  });

  it('maps a unique-constraint race on phone (P2002) to a 409', async () => {
    existingAccounts({}); // pre-checks passed…
    mockCreate.mockRejectedValue(
      // …but a concurrent signup won the unique index race.
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on phone', {
        code: 'P2002',
        clientVersion: '0.0.0',
        meta: { target: ['phone'] },
      }),
    );

    await expect(signup(input)).rejects.toMatchObject(
      new ApiError(409, 'An account with this phone number already exists'),
    );
  });

  it('maps a unique-constraint race on email (P2002) to a 409', async () => {
    existingAccounts({});
    mockCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on email', {
        code: 'P2002',
        clientVersion: '0.0.0',
        meta: { target: ['email'] },
      }),
    );

    await expect(signup(input)).rejects.toMatchObject(
      new ApiError(409, 'An account with this email already exists'),
    );
  });

  it('lets a P2002 on a different unique column bubble instead of claiming a duplicate contact', async () => {
    existingAccounts({});
    mockCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on passwordResetToken', {
        code: 'P2002',
        clientVersion: '0.0.0',
        meta: { target: ['passwordResetToken'] },
      }),
    );

    await expect(signup(input)).rejects.toThrow('Unique constraint failed on passwordResetToken');
  });

  it('lets other database errors bubble unchanged', async () => {
    existingAccounts({});
    mockCreate.mockRejectedValue(new Error('connection lost'));

    await expect(signup(input)).rejects.toThrow('connection lost');
  });

  it('returns tokens and strips sensitive fields on success', async () => {
    existingAccounts({});
    mockCreate.mockResolvedValue(createdUser);

    const result = await signup(input);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
  });
});

// Buyers are the one role that cannot be phone-only. The controller's schema
// rejects the request first, but the rule is repeated in the service so it
// holds for every caller — and so a blank-ish email can never slip through as
// an account with no reachable address.
describe('signup buyer email requirement', () => {
  const buyer = { ...input, role: 'BUYER' as const };

  it('rejects a buyer with no email before touching the database', async () => {
    existingAccounts({});

    await expect(signup({ ...buyer, email: undefined })).rejects.toMatchObject(
      new ApiError(400, 'Email is required for buyer accounts'),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a buyer whose email is only whitespace', async () => {
    existingAccounts({});

    await expect(signup({ ...buyer, email: '   ' })).rejects.toMatchObject(
      new ApiError(400, 'Email is required for buyer accounts'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts a buyer with an email, storing it trimmed', async () => {
    existingAccounts({});
    mockCreate.mockResolvedValue(createdUser);

    const result = await signup({ ...buyer, email: '  buyer@cropbid.test  ' });

    expect(result.accessToken).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'buyer@cropbid.test' }),
      }),
    );
  });
});
