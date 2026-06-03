// =============================================================================
// Payment Service — Razorpay (capture-only)
// =============================================================================
// FLOW (capture-only, dev-first):
//   1. Bid accepted        → Transaction created with paymentStatus AWAITING_PAYMENT
//   2. Buyer clicks "Pay"  → createOrder() creates a Razorpay Order, stores its id
//   3. Buyer pays in the Razorpay Checkout modal
//   4. Checkout returns    → verifyPayment() validates the HMAC signature and flips
//                            the transaction to ESCROW (money captured to the
//                            PLATFORM Razorpay account)
//   5. (Backup) Razorpay   → handleWebhook() does the same flip server-side, so the
//      webhook                payment is recorded even if the browser closes early
//
// Releasing funds to the farmer stays SIMULATED (status flip on delivery confirm,
// see transaction.service.ts). Real farmer payouts need Razorpay Route / RazorpayX
// and are intentionally out of scope here.
//
// Amounts: Razorpay works in the smallest currency sub-unit (paise for INR), so we
// multiply by 100 and round.
// =============================================================================

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';

// Single shared client. Null when keys are not configured so the rest of the app
// still boots (payments simply return 503).
const razorpay = config.razorpay.keyId && config.razorpay.keySecret
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

function requireRazorpay(): Razorpay {
  if (!razorpay) {
    throw new ApiError(503, 'Payments are not configured (missing RAZORPAY_KEY_ID/SECRET)');
  }
  return razorpay;
}

// =============================================================================
// CREATE ORDER — Buyer initiates payment for a transaction
// =============================================================================
export async function createOrder(transactionId: string, userId: string) {
  const client = requireRazorpay();

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  if (transaction.buyerId !== userId) {
    throw new ApiError(403, 'Only the buyer can pay for this transaction');
  }
  if (transaction.paymentStatus !== 'AWAITING_PAYMENT') {
    throw new ApiError(400, `Transaction is not awaiting payment (status: ${transaction.paymentStatus})`);
  }

  const amountInSubunits = Math.round(transaction.totalAmount * 100);

  // Idempotency: if an order was already created (e.g. buyer dismissed the modal
  // and clicked Pay again), reuse it. Minting a fresh order would orphan the first
  // one — a webhook for it could no longer be matched back to this transaction.
  if (transaction.razorpayOrderId) {
    return {
      orderId: transaction.razorpayOrderId,
      amount: amountInSubunits,
      currency: transaction.currency,
      keyId: config.razorpay.keyId,
      transactionId: transaction.id,
    };
  }

  const order = await client.orders.create({
    amount: amountInSubunits,
    currency: transaction.currency, // INR works in Razorpay test mode out of the box
    receipt: transaction.id,
    notes: { transactionId: transaction.id, buyerId: transaction.buyerId },
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { razorpayOrderId: order.id },
  });

  // keyId is returned so the client can open Checkout without hardcoding it.
  return {
    orderId: order.id,
    amount: amountInSubunits,
    currency: transaction.currency,
    keyId: config.razorpay.keyId,
    transactionId: transaction.id,
  };
}

// =============================================================================
// VERIFY PAYMENT — Validate the Checkout callback signature
// =============================================================================
// Razorpay signs the handshake as HMAC_SHA256(order_id + "|" + payment_id, secret).
// If it matches, the payment is genuine and we move the transaction into ESCROW.
export async function verifyPayment(
  userId: string,
  orderId: string,
  paymentId: string,
  signature: string
) {
  requireRazorpay();

  const transaction = await prisma.transaction.findUnique({
    where: { razorpayOrderId: orderId },
  });

  if (!transaction) throw new ApiError(404, 'No transaction found for this order');
  if (transaction.buyerId !== userId) {
    throw new ApiError(403, 'Only the buyer can confirm this payment');
  }

  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // timingSafeEqual guards against signature-comparison timing attacks.
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) throw new ApiError(400, 'Payment signature verification failed');

  return markCaptured(transaction.id, paymentId);
}

// =============================================================================
// WEBHOOK — Server-to-server confirmation (source of truth)
// =============================================================================
// Razorpay signs the RAW request body with the webhook secret. We must verify
// against the exact bytes received (see app.ts: express.raw on this route).
export async function handleWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!config.razorpay.webhookSecret) {
    throw new ApiError(503, 'Webhook secret not configured');
  }
  if (!signature) throw new ApiError(400, 'Missing webhook signature');

  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) throw new ApiError(400, 'Invalid webhook signature');

  const event = JSON.parse(rawBody.toString('utf8'));
  const payment = event?.payload?.payment?.entity;

  // We only care about successful captures. Order id links back to our transaction.
  if ((event?.event === 'payment.captured' || event?.event === 'order.paid') && payment?.order_id) {
    const transaction = await prisma.transaction.findUnique({
      where: { razorpayOrderId: payment.order_id },
    });
    if (transaction) await markCaptured(transaction.id, payment.id);
  }

  return { received: true };
}

// =============================================================================
// markCaptured — Idempotent flip AWAITING_PAYMENT → ESCROW
// =============================================================================
async function markCaptured(transactionId: string, paymentId: string) {
  // Atomic conditional update: closes the race between verifyPayment (browser
  // callback) and handleWebhook both seeing AWAITING_PAYMENT and both writing.
  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, paymentStatus: 'AWAITING_PAYMENT' },
    data: { paymentStatus: 'ESCROW', razorpayPaymentId: paymentId },
  });

  // count === 0 → either already captured (webhook beat us) or no such row.
  if (result.count === 0) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new ApiError(404, 'Transaction not found');
    return tx;
  }

  return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
}
