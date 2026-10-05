// =============================================================================
// Credit Routes — a business buyer's application for credit
// =============================================================================
// Buyers only, including a seller in buying mode (X-Act-As, middleware/auth):
// this is credit to buy produce for a business, not for a household basket.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as creditController from '../controllers/credit.controller';

const router = Router();

router.use(authenticate);
router.use(requireRole('BUYER'));

router.get('/', creditController.getMine);
router.post('/', creditController.apply);

export default router;
