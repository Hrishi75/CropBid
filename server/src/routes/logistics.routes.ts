import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as ctrl from '../controllers/logistics.controller';

const router = Router();

// All logistics routes require authentication
router.use(authenticate);

// --- Partner discovery & quoting (any authenticated user) ---
router.get('/partners/:transactionId', ctrl.getMatchingPartners);
router.post('/quote', ctrl.getTransportQuote);

// --- Shipment lifecycle (farmer or buyer on the transaction) ---
router.post('/book', ctrl.bookShipment);
router.get('/shipment/:id', ctrl.getShipment);
router.get('/transaction/:transactionId', ctrl.getShipmentByTransaction);
router.put('/shipment/:id/status', ctrl.updateShipmentStatus);
router.put('/shipment/:id/driver', ctrl.updateDriverInfo);
router.put('/shipment/:id/proof', ctrl.uploadProofOfDelivery);

// --- Admin: Partner management ---
router.get('/admin/partners', requireRole('ADMIN'), ctrl.getAllPartners);
router.post('/admin/partners', requireRole('ADMIN'), ctrl.createPartner);
router.put('/admin/partners/:id', requireRole('ADMIN'), ctrl.updatePartner);
router.put('/admin/partners/:id/toggle', requireRole('ADMIN'), ctrl.togglePartner);

export default router;
