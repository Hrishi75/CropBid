// =============================================================================
// Rates Routes — /api/rates
// =============================================================================
// Public (no auth) live mandi rates from the Government of India Agmarknet feed.
// Consumed by the storefront rates board and the per-listing price anchor.
// =============================================================================

import { Router } from 'express';
import * as ratesController from '../controllers/rates.controller';

const router = Router();

router.get('/board', ratesController.getBoard);
router.get('/', ratesController.getRate);

export default router;
