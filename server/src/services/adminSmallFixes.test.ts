// =============================================================================
// Small admin fixes, against a real Postgres where it matters
// =============================================================================
//   - the paged lists refuse a bad filter or an oversized page with a 400,
//     where a bad filter used to reach Prisma and come back as a 500
//   - a review note goes only with the actions that ask for one, so a reason
//     typed for Reject cannot ride out in the approval email
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Request, Response } from 'express';

const sendPartnerStatusEmail = vi.fn((..._args: unknown[]) => Promise.resolve());
const createNotification = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('./email.service', () => ({ sendPartnerStatusEmail: (...a: unknown[]) => sendPartnerStatusEmail(...a) }));
vi.mock('./notification.service', () => ({ createNotification: (...a: unknown[]) => createNotification(...a), pushNotification: vi.fn() }));

import { prisma } from '../lib/prisma';
import * as controller from '../controllers/admin.controller';
import { reviewPartnerApplication } from './admin.service';

function call(handler: (req: Request, res: Response, next: (e?: unknown) => void) => unknown, query: Record<string, unknown>) {
  const res: { statusCode: number; body: any; status: (c: number) => any; json: (b: any) => any } = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  let error: unknown;
  const done = Promise.resolve(handler({ query, params: {} } as unknown as Request, res as unknown as Response, (e) => { error = e; }));
  return done.then(() => ({ res, error }));
}

describe('the paged admin lists', () => {
  const cases: [string, typeof controller.getUsers, Record<string, unknown>][] = [
    ['users with an unknown role', controller.getUsers, { role: 'KING' }],
    ['listings with an unknown status', controller.getAllListings, { status: 'GONE' }],
    ['transactions with an unknown status', controller.getAllTransactions, { paymentStatus: 'MAYBE' }],
    ['enquiries with an unknown status', controller.getEnquiries, { status: 'LOST' }],
    ['a page of a million rows', controller.getUsers, { limit: '1000000' }],
    ['a negative offset', controller.getAllListings, { offset: '-5' }],
    ['a search sent twice', controller.getUsers, { search: ['a', 'b'] }],
  ];
  for (const [name, handler, query] of cases) {
    it(`refuses ${name} with a 400`, async () => {
      const { res, error } = await call(handler, query);
      expect(error).toBeUndefined();
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/^Invalid /);
    });
  }

  it('still serves the All tab, which sends a blank filter', async () => {
    const { res, error } = await call(controller.getAllTransactions, { paymentStatus: '', limit: '15', offset: '0' });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
  });
});

const APPLICANT = 'asf-applicant';
const PROFILE = `${APPLICANT}-profile`;
const OPS = 'asf-ops';

async function clean() {
  await prisma.auditLog.deleteMany({ where: { actorId: OPS } });
  await prisma.user.deleteMany({ where: { id: { in: [APPLICANT, OPS] } } });
}

describe('a review note', () => {
  beforeEach(async () => {
    await clean();
    sendPartnerStatusEmail.mockClear();
    createNotification.mockClear();
    await prisma.user.create({ data: { id: OPS, name: 'ASF Ops', email: `${OPS}@test.local`, password: 'x', role: 'ADMIN' } });
    await prisma.user.create({
      data: {
        id: APPLICANT, name: 'ASF Applicant', email: `${APPLICANT}@test.local`, password: 'x', role: 'CONSUMER',
        farmerProfile: { create: { id: PROFILE, state: 'Maharashtra', status: 'SUBMITTED' } },
      },
    });
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  const review = (action: 'APPROVE' | 'REJECT', note?: string) =>
    reviewPartnerApplication({ kind: 'SELLER', profileId: PROFILE, action, note, adminId: OPS });

  it('typed for a rejection never reaches the approval email', async () => {
    await review('APPROVE', 'Your PAN does not match the GSTIN');

    expect(sendPartnerStatusEmail).toHaveBeenCalledTimes(1);
    expect((sendPartnerStatusEmail.mock.calls[0][1] as { note?: string }).note).toBeUndefined();
    expect(JSON.stringify(createNotification.mock.calls)).not.toContain('PAN does not match');
    const profile = await prisma.farmerProfile.findUnique({ where: { id: PROFILE } });
    expect(profile?.status).toBe('APPROVED');
    expect(profile?.statusNote).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { actorId: OPS }, orderBy: { createdAt: 'desc' } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.metadata)).not.toContain('PAN does not match');
  });

  it('still goes out with a rejection', async () => {
    await review('REJECT', 'Your PAN does not match the GSTIN');

    expect((sendPartnerStatusEmail.mock.calls[0][1] as { note?: string }).note).toBe('Your PAN does not match the GSTIN');
    const profile = await prisma.farmerProfile.findUnique({ where: { id: PROFILE } });
    expect(profile?.statusNote).toBe('Your PAN does not match the GSTIN');
  });
});
