// =============================================================================
// Transaction Routes — Payment & Delivery Tracking Endpoints
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as txController from '../controllers/transaction.controller';

const router = Router();

// All transaction routes require authentication
router.use(authenticate);

// POST /api/transactions — Create transaction from accepted bid
router.post('/', txController.createTransaction);

// GET /api/transactions — List my transactions
router.get('/', txController.getMyTransactions);

// GET /api/transactions/stats — Summary statistics
router.get('/stats', txController.getTransactionStats);

// GET /api/transactions/:id — View specific transaction
router.get('/:id', txController.getTransaction);

// PATCH /api/transactions/:id/delivery — Update delivery status
router.patch('/:id/delivery', txController.updateDeliveryStatus);

// POST /api/transactions/:id/refund — Refund (admin only)
router.post('/:id/refund', requireRole('ADMIN'), txController.refundTransaction);

export default router;
