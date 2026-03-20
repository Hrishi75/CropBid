// =============================================================================
// Auction Routes — Live Auction REST Endpoints
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as auctionController from '../controllers/auction.controller';

const router = Router();

// GET /api/auctions — List active auctions (authenticated)
router.get('/', authenticate, auctionController.listAuctions);

// GET /api/auctions/:listingId — Get auction state (authenticated)
router.get('/:listingId', authenticate, auctionController.getAuctionState);

// POST /api/auctions/start — Start an auction (farmer only)
router.post('/start', authenticate, requireRole('FARMER'), auctionController.startAuctionHandler);

export default router;
