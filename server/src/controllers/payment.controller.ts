// =============================================================================
// Payment Controller — HTTP layer for Razorpay (capture-only)
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentService from '../services/payment.service';
import { auditFromRequest } from '../services/audit.service';

// POST /api/payments/order: the buyer opens a Razorpay order for a trade deal,
// or for one or more retail shop orders paid together. A retail lot's
// transactionId pays its whole shop order; retailOrderIds is how a basket, or
// everything still owed, is paid in one go.
const createOrderSchema = z.object({
  transactionId: z.string().min(1).optional(),
  retailOrderIds: z.array(z.string().min(1)).min(1).max(20).optional(),
}).refine((b) => !!b.transactionId !== !!b.retailOrderIds, {
  message: 'Send a transactionId or retailOrderIds',
});

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const order = parsed.data.retailOrderIds
      ? await paymentService.createRetailPayment(parsed.data.retailOrderIds, req.user!.userId)
      : await paymentService.createOrder(parsed.data.transactionId!, req.user!.userId);
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

    const result = await paymentService.verifyPayment(
      req.user!.userId,
      parsed.data.razorpay_order_id,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature
    );

    // A retail payment answers with the payment and the shop orders it
    // covered. Every client that pays one re-reads what it is showing
    // afterwards, so nothing expects a Transaction back from this path.
    if (result.kind === 'retailPayment') {
      const { retailPayment } = result;
      await auditFromRequest(req, {
        action: 'retail_payment.captured',
        entityType: 'RetailPayment',
        entityId: retailPayment.id,
        metadata: {
          razorpayOrderId: parsed.data.razorpay_order_id,
          razorpayPaymentId: parsed.data.razorpay_payment_id,
          amount: retailPayment.amount,
          currency: retailPayment.currency,
          retailOrderIds: retailPayment.orders.map((o) => o.id),
        },
      });
      return res.json(retailPayment);
    }

    const { transaction } = result;
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
