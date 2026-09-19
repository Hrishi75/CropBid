// =============================================================================
// Retail Order Routes
// =============================================================================
//   POST /api/retail-orders            → Place one shop's share of the basket (CONSUMER only)
//   POST /api/retail-orders/:id/cancel → Call it off before the shop sends it
//
// Cancelling is NOT role-gated: the shopper who placed it, the shop it was
// placed with and an admin may all do it, and which of those you are is a
// comparison the service makes against the order itself.
//
// Paying for one goes through /api/payments/order like every other order.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as retailOrderController from '../controllers/retailOrder.controller';

const router = Router();

router.post('/', authenticate, requireRole('CONSUMER'), retailOrderController.create);
router.post('/:id/cancel', authenticate, retailOrderController.cancel);

export default router;
