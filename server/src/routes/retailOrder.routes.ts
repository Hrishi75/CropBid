// =============================================================================
// Retail Order Routes
// =============================================================================
//   POST /api/retail-orders → Place one shop's share of the basket (CONSUMER only)
//
// Paying for one goes through /api/payments/order like every other order.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as retailOrderController from '../controllers/retailOrder.controller';

const router = Router();

router.post('/', authenticate, requireRole('CONSUMER'), retailOrderController.create);

export default router;
