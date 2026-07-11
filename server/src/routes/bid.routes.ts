// =============================================================================
// Bid Routes
// =============================================================================
// ROUTE DESIGN:
//   POST   /api/bids                → Place a bid (BUYER only)
//   POST   /api/bids/direct-purchase → Instant-buy a fixed-price quantity (CONSUMER only)
//   GET    /api/bids/my             → Buyer's own bids
//   GET    /api/bids/incoming       → Farmer's incoming bids across all listings
//   GET    /api/bids/listing/:id    → Bids on a specific listing (FARMER only)
//   PUT    /api/bids/:id/accept     → Farmer accepts a bid
//   PUT    /api/bids/:id/reject     → Farmer rejects a bid
//   PUT    /api/bids/:id/counter    → Farmer counters with a new price
//   PUT    /api/bids/:id/update     → Buyer revises their bid price
//   DELETE /api/bids/:id            → Buyer withdraws their bid
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as bidController from '../controllers/bid.controller';

const router = Router();

// All bid routes require authentication
router.use(authenticate);

// Buyer actions
router.post('/', requireRole('BUYER'), bidController.placeBid);
router.get('/my', requireRole('BUYER'), bidController.getMyBids);
router.put('/:id/update', requireRole('BUYER'), bidController.updateBid);
router.delete('/:id', requireRole('BUYER'), bidController.withdrawBid);

// Consumer actions
router.post('/direct-purchase', requireRole('CONSUMER'), bidController.createDirectPurchase);

// Farmer actions
router.get('/incoming', requireRole('FARMER'), bidController.getIncomingBids);
router.get('/listing/:id', requireRole('FARMER'), bidController.getBidsForListing);
router.put('/:id/accept', requireRole('FARMER'), bidController.acceptBid);
router.put('/:id/reject', requireRole('FARMER'), bidController.rejectBid);
router.put('/:id/counter', requireRole('FARMER'), bidController.counterBid);

export default router;
