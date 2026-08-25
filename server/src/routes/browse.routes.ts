// =============================================================================
// Browse Routes — Public listing discovery
// =============================================================================
// These endpoints are PUBLIC (no auth required) so buyers can browse
// without signing up first. This reduces friction and lets buyers
// see what's available before committing to create an account.
//
//   GET /api/browse              → Filtered, paginated browse
//   GET /api/browse/filters      → Available filter options
//   GET /api/browse/cities       → Cities with live retail stock
//   GET /api/browse/smart-match  → Scored recommendations
// =============================================================================

import { Router } from 'express';
import * as browseController from '../controllers/browse.controller';

const router = Router();

// All browse endpoints are public
router.get('/', browseController.browseListings);
router.get('/filters', browseController.getFilters);
router.get('/cities', browseController.getRetailCities);
router.get('/smart-match', browseController.smartMatch);

export default router;
