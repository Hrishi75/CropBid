import { Request, Response, NextFunction } from 'express';
import * as bidService from '../services/bid.service';

function paramId(req: Request): string {
  return req.params.id as string;
}

// POST /api/bids — Place a bid
export async function placeBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bid = await bidService.placeBid(req.user!.userId, {
      listingId: req.body.listingId,
      bidPricePerUnit: Number(req.body.bidPricePerUnit),
      quantity: Number(req.body.quantity),
      message: req.body.message,
    });
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
    const bid = await bidService.acceptBid(paramId(req), req.user!.userId);
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/reject — Farmer rejects
export async function rejectBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bid = await bidService.rejectBid(paramId(req), req.user!.userId);
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/counter — Farmer counters
export async function counterBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bid = await bidService.counterBid(
      paramId(req),
      req.user!.userId,
      Number(req.body.counterPrice)
    );
    res.json(bid);
  } catch (error) {
    next(error);
  }
}

// PUT /api/bids/:id/update — Buyer updates their bid
export async function updateBid(req: Request, res: Response, next: NextFunction) {
  try {
    const bid = await bidService.updateBid(
      paramId(req),
      req.user!.userId,
      Number(req.body.bidPricePerUnit)
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
