// =============================================================================
// Phone-code sign-up makes a shopper, whoever asks
// =============================================================================
// The code lane used to take an intendedRole from the partner door and create
// a FARMER or BUYER on the spot, before anyone had reviewed them. A new account
// is a shopper now on every sign-up path, and a reviewer's approval is the only
// thing that grants a partner role (CLAUDE.md section 4).
//
// Both steps are pinned. Step 1 must write CONSUMER onto the challenge whatever
// the request carried. Step 2 must create CONSUMER even from a row that says
// otherwise, because a row written before this rule lives for a few minutes
// after the deploy that introduced it.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    phoneChallenge: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('./otpDelivery.service', () => ({
  deliverOtp: vi.fn(),
  OtpDeliveryError: class OtpDeliveryError extends Error {},
}));

vi.mock('./audit.service', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../lib/prisma';
import { startPhoneSignIn, verifyPhoneSignIn } from './auth.service';
import { deliverOtp } from './otpDelivery.service';
import { hashPhoneOtp } from '../utils/phoneOtp';

const CODE = '483920';
const PHONE = '+919822011223';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // a number we have never seen
  vi.mocked(prisma.phoneChallenge.deleteMany).mockResolvedValue({ count: 1 } as any);
  vi.mocked(prisma.phoneChallenge.updateMany).mockResolvedValue({ count: 1 } as any);
  vi.mocked(prisma.phoneChallenge.update).mockResolvedValue({} as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);
});

describe('startPhoneSignIn', () => {
  it('writes CONSUMER onto the challenge even when an old client asks for FARMER', async () => {
    vi.mocked(prisma.phoneChallenge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.phoneChallenge.upsert).mockResolvedValue({ id: 'ch-1' } as any);
    vi.mocked(deliverOtp).mockResolvedValue({ channel: 'console', sentTo: PHONE } as any);

    // The service no longer takes a role; this is what an older web build sends.
    await startPhoneSignIn({ phone: PHONE, intendedRole: 'FARMER' } as any);

    const args = vi.mocked(prisma.phoneChallenge.upsert).mock.calls[0][0] as any;
    expect(args.create.intendedRole).toBe('CONSUMER');
    expect(args.update.intendedRole).toBe('CONSUMER');
  });
});

describe('verifyPhoneSignIn', () => {
  for (const intendedRole of ['FARMER', 'BUYER'] as const) {
    it(`creates a CONSUMER from a challenge written with ${intendedRole} before the rule`, async () => {
      vi.mocked(prisma.phoneChallenge.findUnique).mockResolvedValue({
        id: 'ch-1',
        phone: PHONE,
        codeHash: hashPhoneOtp(CODE),
        intendedRole,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      } as any);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'user-1', name: 'Ravi Kale', phone: PHONE, role: 'CONSUMER',
      } as any);

      const result = await verifyPhoneSignIn({ challengeId: 'ch-1', code: CODE, name: 'Ravi Kale' });

      expect(result.created).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'CONSUMER' }) }),
      );
    });
  }
});
