// =============================================================================
// Payment Controller — HTTP layer for Razorpay (capture-only)
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentService from '../services/payment.service';
import { auditFromRequest } from '../services/audit.service';

// POST /api/payments/order — Buyer creates a Razorpay order for a transaction
const createOrderSchema = z.object({
  transactionId: z.string().min(1, 'transactionId is required'),
});

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const order = await paymentService.createOrder(parsed.data.transactionId, req.user!.userId);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
}

// POST /api/payments/verify — Buyer confirms the Checkout handshake
const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function verifyPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const transaction = await paymentService.verifyPayment(
      req.user!.userId,
      parsed.data.razorpay_order_id,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature
    );

    await auditFromRequest(req, {
      action: 'transaction.payment.captured',
      entityType: 'Transaction',
      entityId: transaction.id,
      metadata: {
        razorpayOrderId: parsed.data.razorpay_order_id,
        razorpayPaymentId: parsed.data.razorpay_payment_id,
        amount: transaction.totalAmount,
        currency: transaction.currency,
      },
    });

    res.json(transaction);
  } catch (error) {
    next(error);
  }
}

// POST /api/payments/webhook — Razorpay server-to-server callback.
// No auth (Razorpay can't send a JWT); authenticity comes from the HMAC signature.
// req.body is a raw Buffer here (see express.raw mount in app.ts).
export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.header('x-razorpay-signature');
    const result = await paymentService.handleWebhook(req.body as Buffer, signature);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
