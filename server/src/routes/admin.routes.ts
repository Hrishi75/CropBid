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

// POST /api/admin/purge-demo-data — Wipe seeded demo data (confirm phrase required)
router.post('/purge-demo-data', adminController.purgeDemoData);

// GET /api/admin/transactions — Transaction oversight
router.get('/transactions', adminController.getAllTransactions);

export default router;
