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
  // Optional bid-terms captured on the new BidForm. Accepted today so the
  // client's POST is validated end-to-end; persistence pending the
  // bid-terms schema migration (Prisma model + service write).
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
