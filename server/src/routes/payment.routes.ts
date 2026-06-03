// =============================================================================
// Payment Routes — Razorpay (capture-only)
// =============================================================================
// NOTE: the webhook route is mounted SEPARATELY in app.ts (before express.json,
// with express.raw) because signature verification needs the raw request body.
// This router only holds the authenticated buyer-facing endpoints.

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as paymentController from '../controllers/payment.controller';

const router = Router();

router.use(authenticate);

// POST /api/payments/order  — create a Razorpay order for a transaction
router.post('/order', paymentController.createOrder);

// POST /api/payments/verify — verify the Checkout signature, move to ESCROW
router.post('/verify', paymentController.verifyPayment);

export default router;
