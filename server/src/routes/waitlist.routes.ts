// =============================================================================
// Waitlist Routes — /api/waitlist
// =============================================================================
// Public (no auth) endpoint for visitors to join the email waitlist.
// =============================================================================

import { Router } from 'express';
import { joinWaitlist } from '../controllers/waitlist.controller';

const router = Router();

router.post('/', joinWaitlist);

export default router;
