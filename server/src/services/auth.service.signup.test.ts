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
import { Prisma } from '../generated/prisma/client';
import { signup, startBuyerSignup } from './auth.service';
import { sendSignupOtpEmail } from './email.service';
import { ApiError } from '../utils/ApiError';

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const mockCreate = vi.mocked(prisma.user.create);
const mockUpdate = vi.mocked(prisma.user.update);
const mockPendingUpsert = vi.mocked(prisma.pendingSignup.upsert);
const mockPendingDeleteMany = vi.mocked(prisma.pendingSignup.deleteMany);
const mockPendingDelete = vi.mocked(prisma.pendingSignup.delete);
const mockSendOtp = vi.mocked(sendSignupOtpEmail);

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
// make exactly one of them collide. Phone is an exact findUnique; email is
// matched case-insensitively, which Prisma can only express as findFirst.
function existingAccounts({ phone = false, email = false }) {
  mockFindUnique.mockImplementation((async (args: any) =>
    args?.where?.phone && phone ? createdUser : null) as any);
  mockFindFirst.mockImplementation((async () => (email ? createdUser : null)) as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue(createdUser);
  mockPendingUpsert.mockResolvedValue({ id: 'pending-1' } as any);
  mockPendingDeleteMany.mockResolvedValue({ count: 0 } as any);
  mockPendingDelete.mockResolvedValue({} as any);
  mockSendOtp.mockResolvedValue(undefined);
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

// Buyers no longer come through signup() at all — they go through
// startBuyerSignup and are created once the emailed code comes back. The rule
// is enforced in the service, not just at the controller, so an unverified
// buyer cannot be created through a second door.
describe('signup buyer rejection', () => {
  const buyer = { ...input, role: 'BUYER' as const };

  it('refuses to create a buyer directly, before touching the database', async () => {
    existingAccounts({});

    await expect(signup(buyer)).rejects.toMatchObject(
      new ApiError(400, 'Buyer accounts must verify their email address first'),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses even when the buyer supplied a perfectly good email', async () => {
    existingAccounts({});
    mockCreate.mockResolvedValue(createdUser);

    await expect(signup({ ...buyer, email: 'buyer@cropbid.test' })).rejects.toMatchObject(
      new ApiError(400, 'Buyer accounts must verify their email address first'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// Buyers are the one role that cannot be phone-only: the email is where the
// code goes. The controller's schema rejects a missing one first, but the rule
// is repeated in the service so it holds for every caller — and so a blank-ish
// email can never slip through as an account with no reachable address.
describe('startBuyerSignup', () => {
  const buyer = { ...input, role: 'BUYER' as const };

  it('rejects a buyer with no email before touching the database', async () => {
    existingAccounts({});

    await expect(startBuyerSignup({ ...buyer, email: undefined })).rejects.toMatchObject(
      new ApiError(400, 'Email is required for buyer accounts'),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockPendingUpsert).not.toHaveBeenCalled();
  });

  it('rejects a buyer whose email is only whitespace', async () => {
    existingAccounts({});

    await expect(startBuyerSignup({ ...buyer, email: '   ' })).rejects.toMatchObject(
      new ApiError(400, 'Email is required for buyer accounts'),
    );
    expect(mockPendingUpsert).not.toHaveBeenCalled();
  });

  it('refuses a non-buyer role', async () => {
    existingAccounts({});

    await expect(startBuyerSignup({ ...buyer, role: 'FARMER' })).rejects.toMatchObject(
      new ApiError(400, 'Only buyer accounts use email verification'),
    );
    expect(mockPendingUpsert).not.toHaveBeenCalled();
  });

  it('parks a mixed-case email lowercased, so it is one signup not two', async () => {
    existingAccounts({});

    await startBuyerSignup({ ...buyer, email: 'Asha@Farm.IN' });

    expect(mockPendingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'asha@farm.in' } }),
    );
  });

  it('rejects an email that differs from an existing account only by case', async () => {
    existingAccounts({ email: true });

    await expect(startBuyerSignup({ ...buyer, email: 'ASHA@farm.in' })).rejects.toMatchObject(
      new ApiError(409, 'An account with this email already exists'),
    );
    // The duplicate check must be the case-insensitive one, or an older
    // mixed-case row slips past it.
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'asha@farm.in', mode: 'insensitive' } },
      }),
    );
    // No code should reach an address that already has an account.
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('rejects a phone that already has an account, without emailing a code', async () => {
    existingAccounts({ phone: true });

    await expect(startBuyerSignup(buyer)).rejects.toMatchObject(
      new ApiError(409, 'An account with this phone number already exists'),
    );
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('creates NO user row — the whole point of verifying first', async () => {
    existingAccounts({});

    await startBuyerSignup(buyer);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stores the password bcrypt-hashed, never in plaintext', async () => {
    existingAccounts({});

    await startBuyerSignup(buyer);

    const { create } = mockPendingUpsert.mock.calls[0][0] as any;
    expect(create.password).not.toBe(input.password);
    expect(create.password).toMatch(/^\$2[aby]\$/);
  });

  it('emails a 6-digit code and returns the pending id', async () => {
    existingAccounts({});

    const result = await startBuyerSignup({ ...buyer, email: '  buyer@cropbid.test  ' });

    expect(result.pendingId).toBe('pending-1');
    expect(result.email).toBe('buyer@cropbid.test');
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    const [to, , code] = mockSendOtp.mock.calls[0];
    expect(to).toBe('buyer@cropbid.test');
    expect(code).toMatch(/^[0-9]{6}$/);
  });

  it('stores only the hash of the code, not the code itself', async () => {
    existingAccounts({});

    await startBuyerSignup(buyer);

    const { create } = mockPendingUpsert.mock.calls[0][0] as any;
    const [, , code] = mockSendOtp.mock.calls[0];
    expect(create.codeHash).not.toBe(code);
    expect(create.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drops the pending row when the email fails, so no orphan holds a dead code', async () => {
    existingAccounts({});
    mockSendOtp.mockRejectedValue(new Error('smtp down'));

    await expect(startBuyerSignup(buyer)).rejects.toThrow('smtp down');
    expect(cleanupCall()).toBeDefined();
  });

  it('scopes the failure cleanup to its OWN code, not just the row id', async () => {
    // The upsert keys on email, so two concurrent submissions for one address
    // share a row. An unscoped delete would let a failed send in THIS request
    // tear out the row belonging to a concurrent one — whose buyer already has
    // a working code in their inbox and would be told it had expired.
    existingAccounts({});
    mockSendOtp.mockRejectedValue(new Error('smtp down'));

    await expect(startBuyerSignup(buyer)).rejects.toThrow('smtp down');

    const where = cleanupCall();
    expect(where.id).toBe('pending-1');
    // The codeHash guard is the whole point — without it the delete is unscoped.
    expect(where.codeHash).toMatch(/^[0-9a-f]{64}$/);
    const { create } = mockPendingUpsert.mock.calls[0][0] as any;
    expect(where.codeHash).toBe(create.codeHash);
  });
});

// startBuyerSignup calls deleteMany twice on the failure path — once to sweep
// expired rows, once to clean up its own. Pick the cleanup out by shape rather
// than by call order, so the assertion doesn't silently start checking the
// prune if the sweep ever moves.
function cleanupCall(): any {
  const call = mockPendingDeleteMany.mock.calls
    .map((c) => (c[0] as any)?.where)
    .find((w) => w && 'codeHash' in w);
  return call;
}
