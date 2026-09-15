// =============================================================================
// Logistics Routes — /api/logistics
// =============================================================================
// CropBid arranges the freight. We pick the carrier, we book it, and we inspect
// the goods on the way through, which is the whole reason the booking is ours
// and not the trader's. So every route that chooses, prices or drives a carrier
// is ADMIN-only, and the two sides of the deal get read access to the status
// and nothing else.
//
// The seller pays. `paidBy` is therefore not an input any more: bookShipment
// writes FARMER unconditionally, so there is no request that can bill the buyer
// for freight. See the note in logistics.service.ts.
//
// The farmer and buyer keep exactly two routes, both GETs, plus proof of
// delivery, which is still the seller's to upload because they are the one
// standing at the loading bay.
//
// Grouped into:
//   - carrier selection + booking + tracking control (admin only)
//   - shipment reads and proof (farmer/buyer on the transaction)
//   - admin-only partner management (requireRole('ADMIN'))
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as ctrl from '../controllers/logistics.controller';

const router = Router();

// All logistics routes require authentication
router.use(authenticate);

// --- Carrier selection, booking and tracking control (ADMIN only) ---
// These four used to be open to the farmer or buyer on the transaction. They
// are ops functions now. A role guard proves what KIND of user this is; the
// service still re-checks the transaction exists and has no shipment yet.
router.get('/partners/:transactionId', requireRole('ADMIN'), ctrl.getMatchingPartners);
router.post('/quote', requireRole('ADMIN'), ctrl.getTransportQuote);
router.post('/book', requireRole('ADMIN'), ctrl.bookShipment);
router.put('/shipment/:id/status', requireRole('ADMIN'), ctrl.updateShipmentStatus);
router.put('/shipment/:id/driver', requireRole('ADMIN'), ctrl.updateDriverInfo);

// --- Shipment reads (farmer or buyer on the transaction, or admin) ---
// What the trader is allowed to know: where their goods are. Not who is
// carrying them. The carrier identity is stripped in the service, not here,
// because the response shape is the service's business.
router.get('/shipment/:id', ctrl.getShipment);
router.get('/transaction/:transactionId', ctrl.getShipmentByTransaction);

// --- Proof of delivery (seller) ---
router.put('/shipment/:id/proof', ctrl.uploadProofOfDelivery);

// --- Admin: Partner management ---
router.get('/admin/partners', requireRole('ADMIN'), ctrl.getAllPartners);
router.post('/admin/partners', requireRole('ADMIN'), ctrl.createPartner);
router.put('/admin/partners/:id', requireRole('ADMIN'), ctrl.updatePartner);
router.put('/admin/partners/:id/toggle', requireRole('ADMIN'), ctrl.togglePartner);

export default router;
