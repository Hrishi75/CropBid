// =============================================================================
// Agent Routes
// =============================================================================
//   GET  /api/agent/config  → Get agent config (auto-creates if needed)
//   PUT  /api/agent/config  → Update agent settings
//   POST /api/agent/toggle  → Quick on/off toggle
//
// All routes require auth + FARMER or BUYER role (admins don't have agents)
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as agentController from '../controllers/agent.controller';

const router = Router();

router.use(authenticate, requireRole('FARMER', 'BUYER'));

router.get('/config', agentController.getConfig);
router.put('/config', agentController.updateConfig);
router.post('/toggle', agentController.toggleAgent);

export default router;
