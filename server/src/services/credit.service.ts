// =============================================================================
// Credit Service — business buyers applying for credit to buy produce
// =============================================================================
// CROPBID DOES NOT LEND, and nothing in this file puts a rupee or a credit
// anywhere. A buyer tells us about their business; a person reads it and, with
// the buyer's consent, takes it to a lending partner. The statuses record what
// that person decided. Loading an approved limit into the wallet is not built:
// credits cannot pay for a lot yet (CLAUDE.md §6), and how a lender's money
// reaches a seller is a regulatory question before it is a code one (§9).
//
// EVERY WRITE IS CONDITIONAL ON THE STATUS IT WAS DECIDED FROM, the same idiom
// as the shop-order cancel: a buyer editing while an admin moves the row to
// review, or two admins at once, must not overwrite each other.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { createNotification } from './notification.service';
import { recordAudit } from './audit.service';
import type { CreditApplicationStatus } from '../generated/prisma/client';

/** The asks a buyer can make, in rupees. Served to the app so it keeps no copy. */
export const CREDIT_RULES = {
  minAmount: 10_000,
  maxAmount: 10_00_000,
  repaymentDays: [30, 60, 90] as const,
};

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export interface CreditApplicationInput {
  businessName: string;
  gstin?: string | null;
  yearsInBusiness: number;
  monthlyPurchase: number;
  amountWanted: number;
  repaymentDays: number;
  purpose?: string | null;
  contactPhone: string;
  consent: boolean;
}

/** Checks and tidies an application. Throws 400 with the first problem. */
export function parseApplication(input: CreditApplicationInput) {
  const businessName = input.businessName?.trim() ?? '';
  if (businessName.length < 2) throw new ApiError(400, 'Enter your business name');

  const gstin = input.gstin?.trim().toUpperCase() || null;
  if (gstin && !GSTIN.test(gstin)) throw new ApiError(400, 'That GSTIN does not look right: it is 15 characters, like 27ABCDE1234F1Z5');

  const years = Number(input.yearsInBusiness);
  if (!Number.isInteger(years) || years < 0 || years > 100) throw new ApiError(400, 'Enter how many years you have been in business');

  const monthly = Number(input.monthlyPurchase);
  if (!Number.isFinite(monthly) || monthly <= 0) throw new ApiError(400, 'Enter roughly how much produce you buy in a month');

  const amount = Number(input.amountWanted);
  if (!Number.isFinite(amount) || amount < CREDIT_RULES.minAmount || amount > CREDIT_RULES.maxAmount) {
    throw new ApiError(400, `Ask for between ₹${CREDIT_RULES.minAmount.toLocaleString('en-IN')} and ₹${CREDIT_RULES.maxAmount.toLocaleString('en-IN')}`);
  }

  const days = Number(input.repaymentDays);
  if (!(CREDIT_RULES.repaymentDays as readonly number[]).includes(days)) {
    throw new ApiError(400, 'Choose 30, 60 or 90 days to repay');
  }

  const contactPhone = (input.contactPhone ?? '').replace(/[\s-]/g, '');
  if (!/^\+?[0-9]{10,13}$/.test(contactPhone)) throw new ApiError(400, 'Enter a phone number we can call you on');

  // Without consent there is nobody to pass the application to, so it is not
  // an application at all.
  if (input.consent !== true) throw new ApiError(400, 'Agree to your details being shared with lending partners to apply');

  const purpose = input.purpose?.trim().slice(0, 500) || null;

  return {
    businessName,
    gstin,
    yearsInBusiness: years,
    monthlyPurchase: Math.round(monthly),
    amountWanted: Math.round(amount),
    repaymentDays: days,
    purpose,
    contactPhone,
  };
}

/** The caller's own application, or null. */
export function getMyApplication(userId: string) {
  return prisma.creditApplication.findUnique({ where: { userId } });
}

/**
 * Submit, edit or re-apply.
 *
 * New: created SUBMITTED. Existing and SUBMITTED: edited in place. DECLINED:
 * applied for again, back to SUBMITTED with the old decision cleared.
 * IN_REVIEW or APPROVED: refused, because a person is working on it.
 */
export async function submitApplication(userId: string, input: CreditApplicationInput) {
  const data = parseApplication(input);
  const consentAt = new Date();

  const existing = await prisma.creditApplication.findUnique({ where: { userId } });
  let application;
  let isNew = false;

  if (!existing) {
    try {
      application = await prisma.creditApplication.create({
        data: { userId, ...data, consentAt },
      });
      isNew = true;
    } catch (err: any) {
      // A double tap: the other request made the row first.
      if (err?.code === 'P2002') throw new ApiError(409, 'Your application is already in. Pull down to see it.');
      throw err;
    }
  } else {
    if (existing.status === 'IN_REVIEW' || existing.status === 'APPROVED') {
      throw new ApiError(409, 'We are already looking at your application, so it cannot be changed now. Write to info@cropbid.in if something is wrong.');
    }
    const reapplying = existing.status === 'DECLINED';
    const { count } = await prisma.creditApplication.updateMany({
      where: { id: existing.id, status: existing.status },
      data: {
        ...data,
        consentAt,
        status: 'SUBMITTED',
        ...(reapplying ? { approvedLimit: null, reviewNote: null, reviewedAt: null } : {}),
      },
    });
    if (count === 0) throw new ApiError(409, 'Your application changed while you were editing it. Pull down to see where it is.');
    application = await prisma.creditApplication.findUniqueOrThrow({ where: { id: existing.id } });
    isNew = reapplying;
  }

  // A new or re-opened application is work for somebody, so ops hear about
  // it. An edit to one already waiting is not news. Not awaited, and failures
  // swallowed: a missed ping must not fail the buyer's submission, and the
  // admin list is read from the table rather than from these rows.
  if (isNew) void notifyAdminsNewApplication(application.businessName, application.amountWanted, application.id);

  return application;
}

async function notifyAdminsNewApplication(businessName: string, amount: number, applicationId: string) {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await Promise.all(admins.map((a) =>
      createNotification({
        userId: a.id,
        type: 'CREDIT_APPLICATION',
        title: 'New business credit application',
        message: `${businessName} asked for ₹${amount.toLocaleString('en-IN')}.`,
        data: { creditApplicationId: applicationId },
      }).catch(() => {}),
    ));
  } catch {
    // see above
  }
}

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------

/**
 * Applications newest first, optionally one status, a page at a time. It used
 * to return the newest 200 and nothing past them, so older applications could
 * not be reached from the admin page at all.
 */
export const CREDIT_PAGE_SIZE = 50;
export async function listApplications(status?: CreditApplicationStatus, page = 1) {
  const where = status ? { status } : undefined;
  const p = Math.max(1, Math.floor(page) || 1);
  const [total, applications] = await Promise.all([
    prisma.creditApplication.count({ where }),
    listApplicationRows(where, p),
  ]);
  return { applications, pagination: { page: p, total, totalPages: Math.max(1, Math.ceil(total / CREDIT_PAGE_SIZE)) } };
}

function listApplicationRows(where: { status: CreditApplicationStatus } | undefined, page: number) {
  return prisma.creditApplication.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * CREDIT_PAGE_SIZE,
    take: CREDIT_PAGE_SIZE,
    include: {
      user: {
        select: {
          id: true, name: true, email: true, phone: true, location: true, role: true,
          buyerProfile: { select: { companyName: true, companyType: true, status: true } },
          farmerProfile: { select: { sellerType: true, businessName: true } },
        },
      },
    },
  });
}

/** Which moves a person can make from each status. */
const NEXT: Record<CreditApplicationStatus, CreditApplicationStatus[]> = {
  SUBMITTED: ['IN_REVIEW', 'DECLINED'],
  IN_REVIEW: ['APPROVED', 'DECLINED'],
  // A decision can be reopened, for a mistake or new paperwork.
  APPROVED: ['IN_REVIEW'],
  DECLINED: ['IN_REVIEW'],
};

export interface ReviewInput {
  status: CreditApplicationStatus;
  approvedLimit?: number | null;
  reviewNote?: string | null;
}

export async function reviewApplication(adminId: string, id: string, input: ReviewInput) {
  const existing = await prisma.creditApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Application not found');

  if (!NEXT[existing.status].includes(input.status)) {
    throw new ApiError(400, `An application that is ${existing.status.toLowerCase().replace('_', ' ')} cannot be moved to ${input.status.toLowerCase().replace('_', ' ')}`);
  }

  const note = input.reviewNote?.trim() || null;
  let approvedLimit: number | null = null;

  if (input.status === 'APPROVED') {
    const limit = Number(input.approvedLimit);
    if (!Number.isFinite(limit) || limit <= 0 || limit > CREDIT_RULES.maxAmount) {
      throw new ApiError(400, 'Enter the limit that was approved');
    }
    approvedLimit = Math.round(limit);
  }
  // The buyer is shown why, as a shop or an admin cancelling an order must say why.
  if (input.status === 'DECLINED' && !note) throw new ApiError(400, 'Say why, so the buyer knows');

  const decided = input.status === 'APPROVED' || input.status === 'DECLINED';
  const { count } = await prisma.creditApplication.updateMany({
    where: { id, status: existing.status },
    data: {
      status: input.status,
      approvedLimit,
      reviewNote: note,
      reviewedAt: decided ? new Date() : null,
    },
  });
  if (count === 0) throw new ApiError(409, 'Somebody changed this application a moment ago. Reload to see it.');

  const updated = await prisma.creditApplication.findUniqueOrThrow({ where: { id } });

  await recordAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'admin.credit_application.review',
    entityType: 'CreditApplication',
    entityId: id,
    metadata: { from: existing.status, to: input.status, approvedLimit },
  });

  const message =
    input.status === 'IN_REVIEW' ? 'Somebody is reading your application now. We will call you when there is news.'
      : input.status === 'APPROVED' ? `Approved up to ₹${approvedLimit!.toLocaleString('en-IN')}. We will call you on ${updated.contactPhone} to set it up.`
        : `Not approved this time: ${note}`;
  await createNotification({
    userId: existing.userId,
    type: 'CREDIT_APPLICATION',
    title: input.status === 'APPROVED' ? 'Business credit approved' : input.status === 'DECLINED' ? 'Business credit not approved' : 'Business credit in review',
    message,
    data: { creditApplicationId: id },
  }).catch(() => {});

  return updated;
}
