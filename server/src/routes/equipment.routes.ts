// =============================================================================
// Equipment Routes — /api/equipment
// =============================================================================
// ROUTE DESIGN:
//   GET  /api/equipment               → Browse machines (public, filtered)
//   GET  /api/equipment/meta          → Category counts + states in stock (public)
//   GET  /api/equipment/enquiries/my  → Caller's own enquiries (auth)
//   GET  /api/equipment/:id           → Machine detail (public)
//   POST /api/equipment/:id/enquiry   → Raise an enquiry (auth)
//
// ROUTE ORDER MATTERS: Express matches top-to-bottom, so the literal /meta and
// /enquiries/my paths must be registered before /:id — otherwise "meta" and
// "enquiries" get swallowed as an :id value. Same reason /my precedes /:id in
// listing.routes.ts.
//
// WHY IS BROWSING PUBLIC BUT ENQUIRING NOT?
// The catalogue is a farmer acquisition surface, so it should be readable
// without a login. The dealer's phone number only ships in the enquiry
// response, and requiring auth there means every number handed out is attached
// to a real account — the catalogue can't be scraped for a dealer contact list.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as equipmentController from '../controllers/equipment.controller';

const router = Router();

// Static paths first (see note above)
router.get('/meta', equipmentController.getMeta);
router.get('/enquiries/my', authenticate, equipmentController.getMyEnquiries);

// Public catalogue
router.get('/', equipmentController.getEquipment);
router.get('/:id', equipmentController.getEquipmentById);

// Lead capture — any signed-in account may enquire. Not farmer-gated: a buyer
// running a pack-house has as much reason to hire a thresher as a farmer does.
router.post('/:id/enquiry', authenticate, equipmentController.createEnquiry);

export default router;
