// =============================================================================
// Credit Routes — a partner's application for credit
// =============================================================================
// Any approved partner: a buyer stocking up, or a seller (a farm, a shop, a
// wholesaler) growing a crop or the business. Not a household shopper: this is
// credit for a trade. The side applied from is the session's role, so a seller
// in buying mode (X-Act-As, middleware/auth) applies as a buyer.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requireApprovedPartner } from '../middleware/roleGuard';
import * as creditController from '../controllers/credit.controller';

const router = Router();

router.use(authenticate);
router.use(requireRole('BUYER', 'FARMER'));
router.use(requireApprovedPartner);

router.get('/', creditController.getMine);
router.post('/', creditController.apply);

export default router;
