// =============================================================================
// Agri-Input Routes — /api/agri-inputs
// =============================================================================
// ROUTE DESIGN:
//   GET  /api/agri-inputs               → Browse seed/fertiliser (public)
//   GET  /api/agri-inputs/meta          → Category counts, crops, states (public)
//   GET  /api/agri-inputs/enquiries/my  → Caller's own enquiries (auth)
//   GET  /api/agri-inputs/:id           → Product detail (public)
//   POST /api/agri-inputs/:id/enquiry   → Raise an enquiry (auth)
//
// ROUTE ORDER MATTERS: Express matches top-to-bottom, so the literal /meta and
// /enquiries/my paths must be registered before /:id — otherwise "meta" and
// "enquiries" get swallowed as an :id value. Same reason /meta precedes /:id in
// equipment.routes.ts.
//
// WHY IS BROWSING PUBLIC BUT ENQUIRING NOT?
// The catalogue is a farmer acquisition surface, so it should be readable
// without a login. The supplier's phone number only ships in the enquiry
// response, and requiring auth there means every number handed out is attached
// to a real account — the catalogue can't be scraped for a supplier contact
// list.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as agriInputController from '../controllers/agriInput.controller';

const router = Router();

// Static paths first (see note above)
router.get('/meta', agriInputController.getMeta);
router.get('/enquiries/my', authenticate, agriInputController.getMyEnquiries);

// Public catalogue
router.get('/', agriInputController.getAgriInputs);
router.get('/:id', agriInputController.getAgriInputById);

// Lead capture — any signed-in account may enquire. Not farmer-gated, same as
// equipment: an FPO secretary or a buyer running a contract-farming block has
// as much reason to source seed as an individual farmer does.
router.post('/:id/enquiry', authenticate, agriInputController.createEnquiry);

export default router;
