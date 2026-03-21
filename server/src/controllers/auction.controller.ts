// =============================================================================
// Auction Controller — REST endpoints for auction management
// =============================================================================
// The actual bidding happens over WebSockets (Socket.io).
// These REST endpoints handle:
//   - Starting an auction (farmer-only)
//   - Listing active auctions (anyone can browse)
//   - Getting a specific auction's state
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { startAuction, getActiveAuctions, getAuction } from '../socket';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

// POST /api/auctions/start — Farmer starts a live auction
export async function startAuctionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { listingId, durationMinutes = 10 } = req.body;

    if (!listingId) {
      throw new ApiError(400, 'listingId is required');
    }

    // Verify the user owns this listing
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { farmer: true },
    });

    if (!listing) throw new ApiError(404, 'Listing not found');
    if (listing.farmer.userId !== req.user!.userId) {
      throw new ApiError(403, 'You can only start auctions on your own listings');
    }
    if (listing.status !== 'ACTIVE') {
      throw new ApiError(400, `Cannot auction a ${listing.status.toLowerCase()} listing`);
    }

    // Validate duration (5-60 minutes)
    const duration = Math.min(Math.max(durationMinutes, 5), 60);

    const auction = await startAuction(listingId, duration);

    res.status(201).json({
      message: 'Auction started',
      listingId,
      endsAt: auction.endsAt.toISOString(),
      startPrice: auction.startPrice,
      durationMinutes: duration,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/auctions — List all active auctions
export async function listAuctions(_req: Request, res: Response, next: NextFunction) {
  try {
    const auctions = getActiveAuctions();
    res.json(auctions);
  } catch (error) {
    next(error);
  }
}

// GET /api/auctions/:listingId — Get a specific auction's state
export async function getAuctionState(req: Request, res: Response, next: NextFunction) {
  try {
    const auction = getAuction(req.params.listingId as string);
    if (!auction) {
      throw new ApiError(404, 'No active auction found for this listing');
    }
    res.json(auction);
  } catch (error) {
    next(error);
  }
}
