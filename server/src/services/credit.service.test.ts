// =============================================================================
// Business credit applications, against a real Postgres
// =============================================================================
// What has to hold: a buyer cannot overwrite a decision a person is making or
// has made, two writers cannot both win, a refusal always says why, and an
// approval always names a limit. The status guards live in the WHERE clause of
// each write, so the only way to know they hold is to commit and look.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Notifications push over a socket; nothing to push to in a test.
vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})) }));

import { prisma } from '../lib/prisma';
import { createNotification } from './notification.service';
import { reviewApplication, submitApplication, parseApplication } from './credit.service';

const BUYER = 'credit-buyer-1';
const ADMIN = 'credit-admin-1';

const input = (extra: Record<string, unknown> = {}) => ({
  businessName: 'Vikram Foods',
  gstin: '27abcde1234f1z5',
  yearsInBusiness: 6,
  monthlyPurchase: 400000,
  amountWanted: 200000,
  repaymentDays: 60,
  purpose: 'Onion for the dehydration line',
  contactPhone: '98220 55667',
  consent: true,
  ...extra,
});

async function clean() {
  await prisma.creditApplication.deleteMany({ where: { userId: BUYER } });
  await prisma.auditLog.deleteMany({ where: { actorId: ADMIN } });
  await prisma.user.deleteMany({ where: { id: { in: [BUYER, ADMIN] } } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clean();
  await prisma.user.create({ data: { id: BUYER, name: 'Vikram', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER' } });
  await prisma.user.create({ data: { id: ADMIN, name: 'Ops', email: `${ADMIN}@test.local`, password: 'x', role: 'ADMIN' } });
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('what an application must contain', () => {
  it('tidies a GSTIN and a phone number', () => {
    const d = parseApplication(input());
    expect(d.gstin).toBe('27ABCDE1234F1Z5');
    expect(d.contactPhone).toBe('9822055667');
  });

  it('refuses without consent to share with lenders', () => {
    expect(() => parseApplication(input({ consent: false }))).toThrow(/Agree/);
  });

  it('refuses an amount outside the range', () => {
    expect(() => parseApplication(input({ amountWanted: 5000 }))).toThrow(/between/);
    expect(() => parseApplication(input({ amountWanted: 50_00_000 }))).toThrow(/between/);
  });

  it('refuses a repayment period that is not offered', () => {
    expect(() => parseApplication(input({ repaymentDays: 45 }))).toThrow(/30, 60 or 90/);
  });

  it('refuses a malformed GSTIN but takes none at all', () => {
    expect(() => parseApplication(input({ gstin: '27ABC' }))).toThrow(/GSTIN/);
    expect(parseApplication(input({ gstin: '' })).gstin).toBeNull();
  });
});

describe('submitting', () => {
  it('creates one SUBMITTED application and tells the admins', async () => {
    const a = await submitApplication(BUYER, input());
    expect(a.status).toBe('SUBMITTED');
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(expect.objectContaining({ userId: ADMIN, type: 'CREDIT_APPLICATION' }));
  });

  it('edits in place while it is still SUBMITTED, without pinging again', async () => {
    const first = await submitApplication(BUYER, input());
    // Let the first submission's admin notice land before counting.
    await new Promise((r) => setTimeout(r, 20));
    vi.clearAllMocks();
    const second = await submitApplication(BUYER, input({ amountWanted: 300000 }));
    expect(second.id).toBe(first.id);
    expect(second.amountWanted).toBe(300000);
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(createNotification)).not.toHaveBeenCalled();
  });

  it('cannot be changed once somebody is reviewing it', async () => {
    const a = await submitApplication(BUYER, input());
    await reviewApplication(ADMIN, a.id, { status: 'IN_REVIEW' });
    await expect(submitApplication(BUYER, input({ amountWanted: 900000 }))).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.creditApplication.findUniqueOrThrow({ where: { id: a.id } })).amountWanted).toBe(200000);
  });

  it('cannot overwrite an approval', async () => {
    const a = await submitApplication(BUYER, input());
    await reviewApplication(ADMIN, a.id, { status: 'IN_REVIEW' });
    await reviewApplication(ADMIN, a.id, { status: 'APPROVED', approvedLimit: 150000 });
    await expect(submitApplication(BUYER, input())).rejects.toMatchObject({ statusCode: 409 });
    const row = await prisma.creditApplication.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe('APPROVED');
    expect(row.approvedLimit).toBe(150000);
  });

  it('applies again after a decline, with the old decision cleared', async () => {
    const a = await submitApplication(BUYER, input());
    await reviewApplication(ADMIN, a.id, { status: 'DECLINED', reviewNote: 'Need six months of invoices' });
    const again = await submitApplication(BUYER, input());
    expect(again.status).toBe('SUBMITTED');
    expect(again.reviewNote).toBeNull();
    expect(again.reviewedAt).toBeNull();
  });
});

describe('reviewing', () => {
  it('needs a limit to approve and a reason to decline', async () => {
    const a = await submitApplication(BUYER, input());
    await expect(reviewApplication(ADMIN, a.id, { status: 'DECLINED' })).rejects.toThrow(/why/);
    await reviewApplication(ADMIN, a.id, { status: 'IN_REVIEW' });
    await expect(reviewApplication(ADMIN, a.id, { status: 'APPROVED' })).rejects.toThrow(/limit/);
  });

  it('cannot approve straight from SUBMITTED', async () => {
    const a = await submitApplication(BUYER, input());
    await expect(reviewApplication(ADMIN, a.id, { status: 'APPROVED', approvedLimit: 1 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('tells the buyer the outcome and audits it', async () => {
    const a = await submitApplication(BUYER, input());
    await reviewApplication(ADMIN, a.id, { status: 'IN_REVIEW' });
    await reviewApplication(ADMIN, a.id, { status: 'APPROVED', approvedLimit: 150000 });
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(expect.objectContaining({
      userId: BUYER, title: 'Business credit approved',
    }));
    const audits = await prisma.auditLog.count({ where: { actorId: ADMIN, entityId: a.id } });
    expect(audits).toBe(2);
  });

  it('lets exactly one of two simultaneous reviews win, every round', async () => {
    // Asserts who won, not how many rows: the losing write must leave the
    // winner's decision exactly as it was.
    for (let round = 0; round < 10; round++) {
      await prisma.creditApplication.deleteMany({ where: { userId: BUYER } });
      const a = await submitApplication(BUYER, input());
      await reviewApplication(ADMIN, a.id, { status: 'IN_REVIEW' });
      const results = await Promise.allSettled([
        reviewApplication(ADMIN, a.id, { status: 'APPROVED', approvedLimit: 100000 }),
        reviewApplication(ADMIN, a.id, { status: 'DECLINED', reviewNote: 'No' }),
      ]);
      const won = results.filter((r) => r.status === 'fulfilled');
      expect(won).toHaveLength(1);
      const winner = (won[0] as PromiseFulfilledResult<{ status: string }>).value.status;
      const row = await prisma.creditApplication.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.status).toBe(winner);
      if (winner === 'APPROVED') expect(row.reviewNote).toBeNull();
      else expect(row.approvedLimit).toBeNull();
    }
  });
});
