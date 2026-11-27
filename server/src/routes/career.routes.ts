// =============================================================================
// Careers Routes — /api/careers
// =============================================================================
// Public: the published jobs /careers lists. Writing them is admin-only and
// lives under /api/admin/jobs (admin.routes.ts).
// =============================================================================

import { Router } from 'express';
import * as careerController from '../controllers/career.controller';

const router = Router();

router.get('/jobs', careerController.listPublished);

export default router;
