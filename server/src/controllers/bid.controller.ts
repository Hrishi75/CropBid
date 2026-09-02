// =============================================================================
// Bid Controller — HTTP Layer
// =============================================================================
// HTTP wrappers for the bid lifecycle: place, accept, reject, counter, update,
// withdraw, and list (incoming/my). Validates request bodies with zod schemas
// (defined below), then delegates to bid.service. Records audit entries for
// state-changing actions via audit.service.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as bidService from '../services/bid.service';
import { auditFromRequest } from '../services/audit.service';

function paramId(req: Request): string {
  return req.params.id as string;
}

const placeBidSchema = z.object({
  listingId: z.string().min(1),
  bidPricePerUnit: z.number().positive('Bid price must be positive'),
  quantity: z.number().positive('Quantity must be positive'),
  message: z.string().max(500).optional(),
  // Order fulfilment details — persisted on the bid so the seller sees where
  // to deliver and how to reach the buyer. Blank values fall back to the
  // buyer's profile phone/location in the service.
  deliveryAddress: z.string().max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  paymentTerms: z.enum(['LC', 'NET7', 'NET15']).optional(),
  deliveryTerms: z.enum(['FOB', 'CIF']).optional(),
  agentMode: z.boolean().optional(),
  walkAwayPrice: z.number().positive().optional(),
});

const counterBidSchema = z.object({
  counterPrice: z.number().positive('counterPrice must be positive'),
});

const updateBidSchema = z.object({
  bidPricePerUnit: z.number().positive('bidPricePerUnit must be positive'),
});

const directPurchaseSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().positive('Quantity must be positive'),
  // Optional — the one-tap consumer buy usually sends neither; the service
  // then snapshots the consumer's profile phone/location onto the order.
  deliveryAddress: z.string().max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  // Client-minted reference for one intended purchase, so a retry after a lost
  // response returns the existing order instead of buying twice. Bounded and
  // charset-limited because it lands in a unique index: it is an opaque handle,
  // not somewhere to put a sentence.
  idempotencyKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'idempotencyKey must be url-safe').optional(),
  // The unit the client converted its kilograms with, so the server can refuse
  // a purchase where the two no longer agree. Optional: older clients omit it
  // and are simply not protected by the check.
  unit: z.enum(['KG', 'QUINTAL', 'TONNE']).optional(),
});

// POST /api/bids — Place a bid
export async function placeBid(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = placeBidSchema.safeParse({
      ...req.body,
      bidPricePerUnit: Number(req.body.bidPricePerUnit),
      quantity: Number(req.body.quantity),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const bid = await bidService.placeBid(req.user!.userId, parsed.data);
    res.status(201).json(bid);
  } catch (error) {
    next(error);
  }
}

// POST /api/bids/direct-purchase — Consumer instant-buys a fixed-price quantity
export async function createDirectPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = directPurchaseSchema.safeParse({
      ...req.body,
      quantity: Number(req.body.quantity),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { bid, replayed } = await bidService.createDirectPurchase(req.user!.userId, parsed.data);
    await auditFromRequest(req, {
      action: 'bid.direct_purchase',
      entityType: 'Bid',
      entityId: bid.id,
      metadata: {
        listingId: parsed.data.listingId,
        quantity: parsed.data.quantity,
        totalAmount: (bid as any)?.totalAmount ?? null,
        // A replay hands back the order that already existed, so without this
        // the log would read as two purchases where the shopper made one.
        replayed,
      },
    });
    // 201 bought something; 200 means this key had already bought it. The body
    // is identical either way, so a client that ignores the distinction still
    // behaves correctly.
    res.status(replayed ? 200 : 201).json(bid);
  } catch (error) {
    next(error);
  }
}

// GET /api/bids/my — Buyer's bids
export async function getMyBids(req: Request, res: Response, next: NextFunction) {
  try {
    const bids = await bidService.getMyBids(
      req.user!.userId,
      req.query.status as string
    );
    res.json(bids);
  } catch (error) {
    next(error);
  }
}

// GET /api/bids/incoming — Farmer's incoming bids
export async function getIncomingBids(req: Request, res: Response, next: NextFunction) {
  try {
    const bids = await bidService.getIncomingBids(
      req.user!.userId,
      req.query.status as string
    );
    res.json(bids);
  } catch (error) {
    next(error);
  }
}

// GET /api/bids/listing/:id — Bids on a specific listing
export async function getBidsForListing(req: Request, res: Response, next: NextFunction) {
  try {
    const bids = await bidService.getBidsForListing(paramId(req), req.user!.userId);
    res.json(bids);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/accept — Farmer accepts
export async function acceptBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bidId = paramId(req);
    const bid = await bidService.acceptBid(bidId, req.user!.userId);
    await auditFromRequest(req, {
      action: 'bid.accept',
      entityType: 'Bid',
      entityId: bidId,
      metadata: {
        listingId: (bid as any)?.listingId ?? null,
        buyerId: (bid as any)?.buyerId ?? null,
        bidPricePerUnit: (bid as any)?.bidPricePerUnit ?? null,
        totalAmount: (bid as any)?.totalAmount ?? null,
      },
    });
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/reject — Farmer rejects
export async function rejectBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bidId = paramId(req);
    const bid = await bidService.rejectBid(bidId, req.user!.userId);
    await auditFromRequest(req, {
      action: 'bid.reject',
      entityType: 'Bid',
      entityId: bidId,
      metadata: {
        listingId: (bid as any)?.listingId ?? null,
        buyerId: (bid as any)?.buyerId ?? null,
      },
    });
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/counter — Farmer counters
export async function counterBid(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = counterBidSchema.safeParse({
      counterPrice: Number(req.body?.counterPrice),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const bidId = paramId(req);
    const { counterPrice } = parsed.data;
    const bid = await bidService.counterBid(bidId, req.user!.userId, counterPrice);
    await auditFromRequest(req, {
      action: 'bid.counter',
      entityType: 'Bid',
      entityId: bidId,
      metadata: {
        listingId: (bid as any)?.listingId ?? null,
        buyerId: (bid as any)?.buyerId ?? null,
        counterPrice,
      },
    });
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/update — Buyer updates their bid
export async function updateBid(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateBidSchema.safeParse({
      bidPricePerUnit: Number(req.body?.bidPricePerUnit),
    });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const bid = await bidService.updateBid(
      paramId(req),
      req.user!.userId,
      parsed.data.bidPricePerUnit
    );
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/bids/:id — Buyer withdraws
export async function withdrawBid(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await bidService.withdrawBid(paramId(req), req.user!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
