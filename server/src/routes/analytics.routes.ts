import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAnalytics } from '../controllers/analytics.controller';

const router = Router();

// GET /api/analytics — Role-aware analytics data
router.get('/', authenticate, getAnalytics);

export default router;
