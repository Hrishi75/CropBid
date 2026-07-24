// =============================================================================
// Requirement Controller — HTTP Layer
// =============================================================================
// HTTP wrappers for the reverse marketplace: a buyer posts a requirement, and
// farmers either fill it at the posted price or counter with their own. Validates
// request bodies with zod schemas (defined below), then delegates to
// requirement.service. Records audit entries for state-changing actions.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as requirementService from '../services/requirement.service';
import { auditFromRequest } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';

function paramId(req: Request): string {
  return req.params.id as string;
}

function paramOfferId(req: Request): string {
  return req.params.offerId as string;
}

// `status`, `remainingQuantity` and `buyerId` are deliberately absent. Status is
// owned by the fill/close state machine, remainingQuantity by the claim logic,
// and buyerId comes from the session — never the client. Unknown keys are
// stripped by zod before anything reaches the service.
const createRequirementSchema = z.object({
  cropName: z.string().min(1).max(200),
  cropVariety: z.string().max(200).optional(),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.enum(['KG', 'QUINTAL', 'TONNE']).optional(),
  qualityGrade: z.enum(['A', 'B', 'C']),
  pricePerUnit: z.number().positive('Price must be positive'),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  deliveryLocation: z.string().min(1).max(200),
  deliveryState: z.string().min(1).max(100),
  deliveryCountry: z.string().max(100).optional(),
  neededBy: z.string().optional(), // ISO date; parsed and range-checked in the service
  description: z.string().max(2000).optional(),
  organic: z.boolean().optional(),
  paymentTerms: z.enum(['LC', 'NET7', 'NET15']).optional(),
  deliveryTerms: z.enum(['FOB', 'CIF']).optional(),
});

const updateRequirementSchema = createRequirementSchema.partial();

const acceptNowSchema = z.object({
  quantity: z.number().positive('Quantity must be positive'),
  message: z.string().max(500).optional(),
});

const createOfferSchema = z.object({
  quantity: z.number().positive('Quantity must be positive'),
  pricePerUnit: z.number().positive('Price must be positive'),
  message: z.string().max(500).optional(),
});

// Enum-valued query params go straight into Prisma enum filters, where an
// unrecognised value makes Prisma throw and the endpoint 500s. Validate at the
// boundary and return a controlled 400 instead — the same reason the services
// whitelist sortable columns rather than trusting `sort`.
const QUALITY_GRADES = ['A', 'B', 'C'];
const REQUIREMENT_STATUSES = ['OPEN', 'FULFILLED', 'CLOSED', 'EXPIRED'];
const OFFER_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];

// Returns the value when valid, undefined when absent, and throws a 400 when
// present but unrecognised. Silently dropping a bad value would be worse: the
// caller would get an unfiltered list and believe it was filtered.
function enumParam(value: unknown, allowed: string[], label: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  const v = String(value);
  if (!allowed.includes(v)) {
    throw new ApiError(400, `Invalid ${label}. Expected one of: ${allowed.join(', ')}`);
  }
  return v;
}

// Query strings arrive as strings; coerce the numerics and booleans once here so
// the service can take a clean typed query.
function parseFeedQuery(req: Request) {
  const q = req.query;
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
  return {
    crop: (q.crop as string) || undefined,
    crops: typeof q.crops === 'string' && q.crops ? q.crops.split(',') : undefined,
    state: (q.state as string) || undefined,
    quality: enumParam(q.quality, QUALITY_GRADES, 'quality grade'),
    organic: q.organic === undefined ? undefined : q.organic === 'true',
    priceMin: num(q.priceMin),
    priceMax: num(q.priceMax),
    search: (q.search as string) || undefined,
    page: num(q.page),
    limit: num(q.limit),
    sort: (q.sort as string) || undefined,
    order: q.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}

// POST /api/requirements — Buyer posts a requirement
export async function createRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createRequirementSchema.safeParse({
      ...req.body,
      quantity: Number(req.body.quantity),
      pricePerUnit: Number(req.body.pricePerUnit),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const requirement = await requirementService.createRequirement(req.user!.userId, parsed.data);
    await auditFromRequest(req, {
      action: 'requirement.create',
      entityType: 'BuyerRequirement',
      entityId: requirement.id,
      metadata: {
        cropName: requirement.cropName,
        quantity: requirement.quantity,
        unit: requirement.unit,
        pricePerUnit: requirement.pricePerUnit,
        deliveryState: requirement.deliveryState,
      },
    });
    res.status(201).json(requirement);
  } catch (error) {
    next(error);
  }
}

// PUT /api/requirements/:id — Buyer edits an open requirement
export async function updateRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const body = { ...req.body };
    if (body.quantity !== undefined) body.quantity = Number(body.quantity);
    if (body.pricePerUnit !== undefined) body.pricePerUnit = Number(body.pricePerUnit);

    const parsed = updateRequirementSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const requirement = await requirementService.updateRequirement(
      paramId(req),
      req.user!.userId,
      parsed.data,
    );
    await auditFromRequest(req, {
      action: 'requirement.update',
      entityType: 'BuyerRequirement',
      entityId: requirement.id,
      metadata: {
        changed: Object.keys(parsed.data),
        quantity: requirement.quantity,
        remainingQuantity: requirement.remainingQuantity,
      },
    });
    res.json(requirement);
  } catch (error) {
    next(error);
  }
}

// PUT /api/requirements/:id/close — Buyer withdraws a requirement
export async function closeRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const requirement = await requirementService.closeRequirement(paramId(req), req.user!.userId);
    await auditFromRequest(req, {
      action: 'requirement.close',
      entityType: 'BuyerRequirement',
      entityId: requirement.id,
      metadata: { remainingQuantity: requirement.remainingQuantity },
    });
    res.json(requirement);
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/feed — Farmer's feed of open requirements
export async function getRequirementFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await requirementService.getRequirementFeed(parseFeedQuery(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/filters — Dynamic filter options for the feed
export async function getFeedFilters(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await requirementService.getFeedFilters());
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/my — Buyer's own requirements
export async function getMyRequirements(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await requirementService.getMyRequirements(req.user!.userId, {
      status: enumParam(req.query.status, REQUIREMENT_STATUSES, 'status'),
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/:id/offers — Offers on a requirement (owning buyer only)
export async function getOffersForRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const offers = await requirementService.getOffersForRequirement(
      paramId(req),
      req.user!.userId,
    );
    res.json(offers);
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/offers/my — Farmer's own offers
export async function getMyOffers(req: Request, res: Response, next: NextFunction) {
  try {
    const offers = await requirementService.getMyOffers(
      req.user!.userId,
      enumParam(req.query.status, OFFER_STATUSES, 'status'),
    );
    res.json(offers);
  } catch (error) {
    next(error);
  }
}

// GET /api/requirements/:id — Role-aware detail view
export async function getRequirementById(req: Request, res: Response, next: NextFunction) {
  try {
    const requirement = await requirementService.getRequirementById(
      paramId(req),
      req.user!.userId,
      req.user!.role,
    );
    res.json(requirement);
  } catch (error) {
    next(error);
  }
}

// POST /api/requirements/:id/accept — Farmer fills at the buyer's posted price
export async function acceptRequirementNow(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = acceptNowSchema.safeParse({
      ...req.body,
      quantity: Number(req.body.quantity),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const result = await requirementService.acceptRequirementNow(
      paramId(req),
      req.user!.userId,
      parsed.data,
    );
    // Money-moving action — the analogue of bid.accept. Always audited.
    await auditFromRequest(req, {
      action: 'requirement.fill',
      entityType: 'RequirementOffer',
      entityId: result.offer.id,
      metadata: {
        requirementId: paramId(req),
        quantity: result.offer.quantity,
        pricePerUnit: result.offer.pricePerUnit,
        totalAmount: result.offer.totalAmount,
        listingId: result.listing.id,
        bidId: result.bid.id,
        transactionId: result.transaction.id,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/requirements/:id/offers — Farmer counters with their own price
export async function createOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOfferSchema.safeParse({
      ...req.body,
      quantity: Number(req.body.quantity),
      pricePerUnit: Number(req.body.pricePerUnit),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const offer = await requirementService.createOffer(paramId(req), req.user!.userId, parsed.data);
    await auditFromRequest(req, {
      action: 'requirement.offer.create',
      entityType: 'RequirementOffer',
      entityId: offer.id,
      metadata: {
        requirementId: paramId(req),
        quantity: offer.quantity,
        pricePerUnit: offer.pricePerUnit,
      },
    });
    res.status(201).json(offer);
  } catch (error) {
    next(error);
  }
}

// PUT /api/requirements/offers/:offerId/accept — Buyer accepts a counter-offer
export async function acceptOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await requirementService.acceptOffer(paramOfferId(req), req.user!.userId);
    // Money-moving action — the analogue of bid.accept. Always audited.
    await auditFromRequest(req, {
      action: 'requirement.offer.accept',
      entityType: 'RequirementOffer',
      entityId: result.offer.id,
      metadata: {
        requirementId: result.offer.requirementId,
        farmerId: result.offer.farmerId,
        quantity: result.offer.quantity,
        totalAmount: result.offer.totalAmount,
        listingId: result.listing.id,
        bidId: result.bid.id,
        transactionId: result.transaction.id,
      },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// PUT /api/requirements/offers/:offerId/reject — Buyer declines a counter-offer
export async function rejectOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const offer = await requirementService.rejectOffer(paramOfferId(req), req.user!.userId);
    await auditFromRequest(req, {
      action: 'requirement.offer.reject',
      entityType: 'RequirementOffer',
      entityId: offer.id,
      metadata: { requirementId: offer.requirementId, farmerId: offer.farmerId },
    });
    res.json(offer);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/requirements/offers/:offerId — Farmer withdraws their offer
export async function withdrawOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const offer = await requirementService.withdrawOffer(paramOfferId(req), req.user!.userId);
    await auditFromRequest(req, {
      action: 'requirement.offer.withdraw',
      entityType: 'RequirementOffer',
      entityId: offer.id,
      metadata: { requirementId: offer.requirementId },
    });
    res.json({ message: 'Offer withdrawn' });
  } catch (error) {
    next(error);
  }
}
