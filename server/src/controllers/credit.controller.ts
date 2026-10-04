// =============================================================================
// Credit Controller — HTTP layer for business credit applications
// =============================================================================
// The buyer's routes read the owner from the session, never from the request,
// so there is no request shape that reads or edits somebody else's application.
// The admin routes are mounted behind requireRole('ADMIN') in admin.routes.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as creditService from '../services/credit.service';

// GET /api/credit — the rules and the caller's own application (or null)
export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await creditService.getMyApplication(req.user!.userId);
    res.json({ rules: creditService.CREDIT_RULES, application });
  } catch (error) {
    next(error);
  }
}

// Coerced because a phone sends numbers from text fields. The service owns the
// real rules, so they live in one place.
const applySchema = z.object({
  businessName: z.string(),
  gstin: z.string().optional().nullable(),
  yearsInBusiness: z.coerce.number(),
  monthlyPurchase: z.coerce.number(),
  amountWanted: z.coerce.number(),
  repaymentDays: z.coerce.number(),
  purpose: z.string().optional().nullable(),
  contactPhone: z.string(),
  consent: z.boolean(),
});

// POST /api/credit — submit, edit, or apply again after a decline
export async function apply(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const application = await creditService.submitApplication(req.user!.userId, parsed.data);
    res.json({ application });
  } catch (error) {
    next(error);
  }
}

const STATUSES = ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DECLINED'] as const;

// GET /api/admin/credit-applications?status=
export async function adminList(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status = raw && (STATUSES as readonly string[]).includes(raw) ? (raw as typeof STATUSES[number]) : undefined;
    res.json({ applications: await creditService.listApplications(status) });
  } catch (error) {
    next(error);
  }
}

const reviewSchema = z.object({
  status: z.enum(STATUSES),
  approvedLimit: z.coerce.number().optional().nullable(),
  reviewNote: z.string().optional().nullable(),
});

// PATCH /api/admin/credit-applications/:id
export async function adminReview(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const application = await creditService.reviewApplication(req.user!.userId, String(req.params.id), parsed.data);
    res.json({ application });
  } catch (error) {
    next(error);
  }
}
