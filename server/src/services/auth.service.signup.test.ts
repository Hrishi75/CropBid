// =============================================================================
// auth.service signup tests — duplicate-email handling
// =============================================================================
// Two signups for the same email can both pass the findUnique pre-check; the
// unique index decides the race. Both the pre-check loser and the race loser
// must see the same 409, never a raw Prisma error surfacing as a 500.
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
  email: 'rajesh@cropbid.test',
  password: 'Sup3rSecret',
  role: 'FARMER' as const,
};

const createdUser = {
  id: 'user-1',
  name: input.name,
  email: input.email,
  password: 'hashed',
  refreshToken: null,
  role: 'FARMER',
  farmerProfile: null,
  buyerProfile: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue(createdUser);
});

describe('signup', () => {
  it('rejects an email that already has an account (pre-check)', async () => {
    mockFindUnique.mockResolvedValue(createdUser);

    await expect(signup(input)).rejects.toMatchObject(
      new ApiError(409, 'An account with this email already exists'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('maps a unique-constraint race on email (P2002) to the same 409', async () => {
    mockFindUnique.mockResolvedValue(null); // pre-check passed…
    mockCreate.mockRejectedValue(
      // …but a concurrent signup won the unique index race.
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

  it('lets a P2002 on a different unique column bubble instead of claiming the email exists', async () => {
    mockFindUnique.mockResolvedValue(null);
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
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockRejectedValue(new Error('connection lost'));

    await expect(signup(input)).rejects.toThrow('connection lost');
  });

  it('returns tokens and strips sensitive fields on success', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(createdUser);

    const result = await signup(input);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
  });
});
