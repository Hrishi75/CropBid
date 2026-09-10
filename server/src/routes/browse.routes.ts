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
// Shop-first retail: the city's shops, then one shop's whole shelf. Public —
// a shopper browses before they ever sign in, and the signup gate is at the
// cart, not the window.
router.get('/shops', browseController.getRetailShops);
router.get('/shops/:id', browseController.getRetailShop);

// Can we reach a point at all, and on which lane. Public: this is what a
// stranger asks before they have any reason to make an account.
router.get('/serviceability', browseController.getServiceability);

// "Come to my area." Public for the same reason, and the signal is worth more
// than the sign-up it would cost to collect it.
router.post('/coverage-request', browseController.postCoverageRequest);
router.get('/smart-match', browseController.smartMatch);

export default router;
