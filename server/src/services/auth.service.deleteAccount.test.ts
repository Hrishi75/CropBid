// =============================================================================
// Deleting a seller account takes the bank details with it
// =============================================================================
// A seller with settled deals cannot be erased: the other party is entitled to
// the record of a deal they were part of, so the profile row survives and its
// personal fields are scrubbed instead. /privacy states that bank details are
// among them, which makes this a published promise rather than an internal
// detail, and the scrub is a hand-written list of columns: exactly the kind of
// list a new column gets left out of.
//
// A payout account left behind on an anonymised profile is the worst of both
// outcomes: the name is gone, and the bank account is still there.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => {
  const tx = {
    user: { delete: vi.fn(), update: vi.fn() },
    farmerProfile: { update: vi.fn() },
    buyerProfile: { deleteMany: vi.fn() },
    bid: { deleteMany: vi.fn(), updateMany: vi.fn() },
    listing: { deleteMany: vi.fn(), updateMany: vi.fn() },
    agentConfig: { updateMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    address: { deleteMany: vi.fn() },
    negotiation: { updateMany: vi.fn(), deleteMany: vi.fn() },
    requirement: { deleteMany: vi.fn(), updateMany: vi.fn() },
    requirementOffer: { deleteMany: vi.fn() },
    wallet: { deleteMany: vi.fn() },
    walletEntry: { deleteMany: vi.fn() },
    equipmentEnquiry: { deleteMany: vi.fn() },
    agriInputEnquiry: { deleteMany: vi.fn() },
    phoneChallenge: { deleteMany: vi.fn() },
    pendingSignup: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn(), updateMany: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      transaction: { count: vi.fn() },
      listing: { findMany: vi.fn(() => Promise.resolve([])) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

vi.mock('./otpDelivery.service', () => ({
  deliverOtp: vi.fn(() => Promise.resolve({ channel: 'whatsapp' })),
  OtpDeliveryError: class extends Error {},
}));
vi.mock('./notification.helpers', () => ({}));
vi.mock('./imageStorage', () => ({ removeImage: vi.fn() }));

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { deleteAccount } from './auth.service';

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).__tx;

const PASSWORD = 'password123';

beforeEach(async () => {
  vi.clearAllMocks();
  mock(prisma.user.findUnique).mockResolvedValue({
    id: 'seller-1',
    role: 'FARMER',
    password: await bcrypt.hash(PASSWORD, 4),
    avatar: null,
    farmerProfile: {
      id: 'profile-1',
      userId: 'seller-1',
      payoutUpiId: 'ramesh@okhdfc',
      payoutAccountName: 'Ramesh Patil',
      payoutAccountNumber: '50100123456789',
      payoutIfsc: 'HDFC0001234',
    },
  });
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) fn.mockResolvedValue({ count: 0 });
  }
});

describe('anonymising a seller who has settled deals', () => {
  beforeEach(() => {
    // No money in flight, but a deal on the record: the row has to survive.
    mock(prisma.transaction.count).mockResolvedValueOnce(0).mockResolvedValueOnce(3);
  });

  it('clears every payout column, not just the old bankDetails blob', async () => {
    await deleteAccount('seller-1', PASSWORD);

    const scrubbed = tx.farmerProfile.update.mock.calls.at(-1)?.[0].data;
    expect(scrubbed).toMatchObject({
      payoutUpiId: null,
      payoutAccountName: null,
      payoutAccountNumber: null,
      payoutIfsc: null,
    });
  });
});

describe('deleting a seller with nothing settled', () => {
  it('drops the row outright, payout details and all', async () => {
    mock(prisma.transaction.count).mockResolvedValue(0);

    await deleteAccount('seller-1', PASSWORD);

    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'seller-1' } });
    expect(tx.farmerProfile.update).not.toHaveBeenCalled();
  });
});
