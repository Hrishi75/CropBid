// =============================================================================
// Analytics Routes — /api/analytics
// =============================================================================
// One authenticated endpoint returning analytics data tailored to the caller's
// role (farmer / buyer / admin). All routes require a valid access token.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAnalytics } from '../controllers/analytics.controller';

const router = Router();

// GET /api/analytics — Role-aware analytics data
router.get('/', authenticate, getAnalytics);

export default router;
