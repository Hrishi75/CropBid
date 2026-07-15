// =============================================================================
// Schemes Routes — /api/schemes
// =============================================================================
// Public (no auth) searchable catalogue of government schemes for farmers
// (Sarkari Yojana). Consumed by the web /schemes page and the mobile
// Sarkari Yojana screen.
// =============================================================================

import { Router } from 'express';
import * as schemesController from '../controllers/schemes.controller';

const router = Router();

router.get('/', schemesController.getSchemes);

export default router;
