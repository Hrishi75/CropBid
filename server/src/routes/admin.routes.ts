// =============================================================================
// Admin Routes — All require ADMIN role
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as adminController from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN'));

// GET /api/admin/stats — Platform overview
router.get('/stats', adminController.getPlatformStats);

// GET /api/admin/users — User management
router.get('/users', adminController.getUsers);

// PATCH /api/admin/users/:id — Update user
router.patch('/users/:id', adminController.updateUser);

// DELETE /api/admin/users/:id — Hard-delete a user (no transactions attached)
router.delete('/users/:id', adminController.deleteUser);

// GET /api/admin/listings — Listing oversight
router.get('/listings', adminController.getAllListings);

// DELETE /api/admin/listings/:id — Remove a listing (no transactions attached)
router.delete('/listings/:id', adminController.deleteListing);

// GET  /api/admin/demo-data — what a purge would remove (read-only)
// POST /api/admin/purge-demo-data — remove it (confirm phrase required)
router.get('/demo-data', adminController.getDemoData);
router.post('/purge-demo-data', adminController.purgeDemoData);

// GET /api/admin/attention — Ops triage queue (deals with no freight booked)
router.get('/attention', adminController.getAttentionItems);

// GET /api/admin/transactions — Transaction oversight
router.get('/transactions', adminController.getAllTransactions);

// GET /api/admin/enquiries?kind=EQUIPMENT|AGRI_INPUT — Inbound leads from
// either catalogue. kind defaults to EQUIPMENT.
router.get('/enquiries', adminController.getEnquiries);

// PATCH /api/admin/enquiries/:id — Move a lead through the triage queue.
// Body carries { status, kind }, kind defaulting to EQUIPMENT.
router.patch('/enquiries/:id', adminController.updateEnquiryStatus);

// --- Seeds & fertiliser: the /inputs catalogue, including what the licence
// gate hides from farmers, and adding to it. ---
// GET   /api/admin/agri-inputs                          — products, live or hidden and why
// POST  /api/admin/agri-inputs                          — add a product to a shop
// PATCH /api/admin/agri-inputs/:id                      — edit, take off, put back
// GET   /api/admin/agri-inputs/suppliers                — shops and the licences on file
// POST  /api/admin/agri-inputs/suppliers                — add a shop
// PATCH /api/admin/agri-inputs/suppliers/:id            — rename, phone, take off, put back
// PUT   /api/admin/agri-inputs/suppliers/:id/licences   — enter or clear licences (audited)
router.get('/agri-inputs', adminController.getAgriInputCatalogue);
router.post('/agri-inputs', adminController.createAgriInput);
router.get('/agri-inputs/suppliers', adminController.getAgriInputSuppliers);
router.post('/agri-inputs/suppliers', adminController.createAgriInputSupplier);
router.patch('/agri-inputs/suppliers/:id', adminController.updateAgriInputSupplier);
router.put('/agri-inputs/suppliers/:id/licences', adminController.setAgriInputSupplierLicences);
router.patch('/agri-inputs/:id', adminController.updateAgriInput);

// --- Partner applications: the approval queue ---
// GET  /api/admin/partners            — list applications (+ per-status counts)
// POST /api/admin/partners/:id/review — approve / request info / reject / suspend
router.get('/partners', adminController.getPartnerApplications);
router.post('/partners/:id/review', adminController.reviewPartnerApplication);
// GET /api/admin/partners/:id/payout — where to send this seller's money.
// Audited on every call: see admin.service.getSellerPayoutDetails.
router.get('/partners/:id/payout', adminController.getSellerPayoutDetails);

export default router;
