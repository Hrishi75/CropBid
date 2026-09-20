// =============================================================================
// Payment Controller — HTTP layer for Razorpay (capture-only)
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentService from '../services/payment.service';
import { auditFromRequest } from '../services/audit.service';

// POST /api/payments/order: the buyer opens a Razorpay order for a transaction,
// or for a retail shop order. A retail lot's transactionId pays its whole shop
// order either way; retailOrderId is for a client that holds the order itself.
const createOrderSchema = z.object({
  transactionId: z.string().min(1).optional(),
  retailOrderId: z.string().min(1).optional(),
}).refine((b) => !!b.transactionId !== !!b.retailOrderId, {
  message: 'Send a transactionId or a retailOrderId',
});

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const order = parsed.data.retailOrderId
      ? await paymentService.createRetailOrderPayment(parsed.data.retailOrderId, req.user!.userId)
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

    // A retail shop order answers with the order, lots included. Every client
    // that pays one re-reads what it is showing afterwards, so nothing expects
    // a Transaction back from this path.
    if (result.kind === 'retailOrder') {
      const { retailOrder } = result;
      await auditFromRequest(req, {
        action: 'retail_order.payment.captured',
        entityType: 'RetailOrder',
        entityId: retailOrder.id,
        metadata: {
          razorpayOrderId: parsed.data.razorpay_order_id,
          razorpayPaymentId: parsed.data.razorpay_payment_id,
          amount: retailOrder.totalAmount,
          deliveryFee: retailOrder.deliveryFee,
          currency: retailOrder.currency,
          transactionIds: retailOrder.transactions.map((t) => t.id),
        },
      });
      return res.json(retailOrder);
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
