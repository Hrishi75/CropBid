// =============================================================================
// Negotiation Routes — AI Agent Negotiation Endpoints
// =============================================================================
// All routes are authenticated. Both farmers and buyers can:
//   - View their negotiations
//   - Start a negotiation (either party can trigger it)
//   - View negotiation details with round-by-round playback
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireApprovedPartner } from '../middleware/roleGuard';
import * as negotiationController from '../controllers/negotiation.controller';

const router = Router();

// All negotiation routes require authentication
router.use(authenticate);

// POST /api/negotiations/start — Kick off an AI negotiation for a bid
router.post('/start', requireApprovedPartner, negotiationController.startNegotiation);

// GET /api/negotiations — List all my negotiations
router.get('/', negotiationController.getMyNegotiations);

// GET /api/negotiations/bid/:bidId — Get negotiation for a specific bid
router.get('/bid/:bidId', negotiationController.getNegotiationByBid);

// GET /api/negotiations/:id — View a specific negotiation
router.get('/:id', negotiationController.getNegotiation);

export default router;
