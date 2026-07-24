// =============================================================================
// Requirement Routes — The reverse marketplace
// =============================================================================
// ROUTE DESIGN:
//   GET    /api/requirements/feed                    → Farmer's feed of open demand
//   GET    /api/requirements/filters                 → Dynamic filter options
//   GET    /api/requirements/my                      → Buyer's own requirements
//   GET    /api/requirements/offers/my               → Farmer's own offers
//   PUT    /api/requirements/offers/:offerId/accept  → Buyer accepts a counter-offer
//   PUT    /api/requirements/offers/:offerId/reject  → Buyer rejects a counter-offer
//   DELETE /api/requirements/offers/:offerId         → Farmer withdraws their offer
//   POST   /api/requirements                         → Buyer posts a requirement
//   PUT    /api/requirements/:id                     → Buyer edits it
//   PUT    /api/requirements/:id/close               → Buyer withdraws it
//   GET    /api/requirements/:id/offers              → Offers on it (owning buyer)
//   POST   /api/requirements/:id/accept              → Farmer fills at posted price
//   POST   /api/requirements/:id/offers              → Farmer counters
//   GET    /api/requirements/:id                     → Detail (role-aware)
//
// ORDER MATTERS: Express matches top-to-bottom, so every literal-prefixed path
// is registered before the `/:id` catch-all — otherwise "/feed" would be read as
// an id. The same reason /listings/my comes before /listings/:id.
//
// A role guard proves what KIND of user this is, never WHOSE data it is. Every
// handler below re-checks ownership in the service.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as requirementController from '../controllers/requirement.controller';

const router = Router();

// All requirement routes require authentication
router.use(authenticate);

// --- Literal paths first ---
router.get('/feed', requireRole('FARMER'), requirementController.getRequirementFeed);
router.get('/filters', requireRole('FARMER'), requirementController.getFeedFilters);
router.get('/my', requireRole('BUYER'), requirementController.getMyRequirements);
router.get('/offers/my', requireRole('FARMER'), requirementController.getMyOffers);
router.put('/offers/:offerId/accept', requireRole('BUYER'), requirementController.acceptOffer);
router.put('/offers/:offerId/reject', requireRole('BUYER'), requirementController.rejectOffer);
router.delete('/offers/:offerId', requireRole('FARMER'), requirementController.withdrawOffer);

// --- Buyer CRUD ---
router.post('/', requireRole('BUYER'), requirementController.createRequirement);
router.put('/:id', requireRole('BUYER'), requirementController.updateRequirement);
router.put('/:id/close', requireRole('BUYER'), requirementController.closeRequirement);
router.get('/:id/offers', requireRole('BUYER'), requirementController.getOffersForRequirement);

// --- Farmer actions ---
router.post('/:id/accept', requireRole('FARMER'), requirementController.acceptRequirementNow);
router.post('/:id/offers', requireRole('FARMER'), requirementController.createOffer);

// --- Shared, last ---
router.get('/:id', requireRole('BUYER', 'FARMER', 'ADMIN'), requirementController.getRequirementById);

export default router;
