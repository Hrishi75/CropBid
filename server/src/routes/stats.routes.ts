import { Router } from 'express';
import * as statsController from '../controllers/stats.controller';

const router = Router();

// Public — used by the landing page
router.get('/landing', statsController.getLandingStats);

export default router;
