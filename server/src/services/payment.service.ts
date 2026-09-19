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
//
// RETAIL IS PAID BY THE BASKET. A household's lots from one shop form a
// RetailOrder with one delivery fee, and a RetailPayment covers one or more of
// those orders with one Razorpay order: the whole basket straight after
// checkout, or whatever is still owed from the Orders screen. Capturing it
// moves every lot of every order it covers into ESCROW. The smallest thing a
// shopper can pay for is a whole shop order, so there is no request that pays
// a shop's items piecemeal and skips its delivery fee.
// =============================================================================

import crypto, { randomUUID } from 'crypto';
import Razorpay from 'razorpay';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';
import { recordAudit } from './audit.service';
import { notifyAdminsRetailOverpaid } from './notification.helpers';

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
  if (transaction.retailOrderId) {
    return createRetailPayment([transaction.retailOrderId], userId, transaction.id);
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
// CREATE RETAIL PAYMENT: one Razorpay order for one or more shop orders
// =============================================================================
// `viaTransactionId` is echoed back when the request came in through one of a
// shop order's lots, so a client that asked about a lot can find its way back.

// A basket spans a handful of shops. The cap keeps one payment from covering an
// unbounded list of orders.
const MAX_ORDERS_PER_PAYMENT = 20;

export async function createRetailPayment(
  retailOrderIds: string[],
  userId: string,
  viaTransactionId?: string,
) {
  const client = requireRazorpay();

  const ids = [...new Set(retailOrderIds)];
  if (ids.length === 0) throw new ApiError(400, 'Nothing to pay for');
  if (ids.length > MAX_ORDERS_PER_PAYMENT) {
    throw new ApiError(400, `One payment can cover at most ${MAX_ORDERS_PER_PAYMENT} orders`);
  }

  const orders = await prisma.retailOrder.findMany({
    where: { id: { in: ids } },
    include: { transactions: { select: { paymentStatus: true } } },
  });

  if (orders.length !== ids.length) throw new ApiError(404, 'Order not found');
  if (orders.some((o) => o.buyerId !== userId)) {
    throw new ApiError(403, 'Only the buyer can pay for these orders');
  }
  if (orders.some((o) => o.paidAt || !o.transactions.every((t) => t.paymentStatus === 'AWAITING_PAYMENT'))) {
    throw new ApiError(400, 'One of these orders is not awaiting payment. Refresh your orders and try again.');
  }
  const currency = orders[0].currency;
  if (orders.some((o) => o.currency !== currency)) {
    throw new ApiError(400, 'Orders in different currencies cannot be paid together');
  }

  // Money is a Float across the schema; round the sum to paise once.
  const amount = Math.round(orders.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100;
  const amountInSubunits = Math.round(amount * 100);
  const answer = (paymentId: string, razorpayOrderId: string) => ({
    orderId: razorpayOrderId,
    amount: amountInSubunits,
    currency,
    keyId: config.razorpay.keyId,
    retailPaymentId: paymentId,
    retailOrderIds: ids,
    ...(viaTransactionId ? { transactionId: viaTransactionId } : {}),
  });

  // The same set again (the shopper dismissed the modal and pressed Pay again)
  // gets the same Razorpay order back. A fresh one would leave two open orders
  // for the same money, and the shopper one tap from paying twice.
  const open = await prisma.retailPayment.findMany({
    where: {
      buyerId: userId,
      paidAt: null,
      razorpayOrderId: { not: null },
      orders: { some: { id: { in: ids } } },
    },
    include: { orders: { select: { id: true } } },
  });
  const same = open.find((p) =>
    p.orders.length === ids.length
    && p.orders.every((o) => ids.includes(o.id))
    && p.amount === amount);
  if (same) return answer(same.id, same.razorpayOrderId!);

  // Razorpay first, then the row, so a failed call to Razorpay leaves nothing
  // behind: a payment row always has the order it names.
  const paymentId = randomUUID();
  const rzp = await client.orders.create({
    amount: amountInSubunits,
    currency,
    receipt: paymentId,
    notes: { retailPaymentId: paymentId, buyerId: userId },
  });

  await prisma.retailPayment.create({
    data: {
      id: paymentId,
      buyerId: userId,
      amount,
      currency,
      razorpayOrderId: rzp.id,
      orders: { connect: ids.map((id) => ({ id })) },
    },
  });

  return answer(paymentId, rzp.id);
}

// Razorpay signs the handshake as HMAC_SHA256(order_id + "|" + payment_id, secret).
function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // timingSafeEqual guards against signature-comparison timing attacks.
  return expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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

  if (transaction) {
    if (transaction.buyerId !== userId) {
      throw new ApiError(403, 'Only the buyer can confirm this payment');
    }
    if (!checkoutSignatureValid(orderId, paymentId, signature)) {
      throw new ApiError(400, 'Payment signature verification failed');
    }
    return { kind: 'transaction' as const, transaction: await markCaptured(transaction.id, paymentId) };
  }

  const retailPayment = await prisma.retailPayment.findUnique({
    where: { razorpayOrderId: orderId },
  });
  if (!retailPayment) throw new ApiError(404, 'No order found for this payment');
  if (retailPayment.buyerId !== userId) {
    throw new ApiError(403, 'Only the buyer can confirm this payment');
  }
  if (!checkoutSignatureValid(orderId, paymentId, signature)) {
    throw new ApiError(400, 'Payment signature verification failed');
  }
  return {
    kind: 'retailPayment' as const,
    retailPayment: await markRetailPaymentCaptured(retailPayment.id, paymentId),
  };
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
    if (transaction) {
      await markCaptured(transaction.id, payment.id);
    } else {
      const retailPayment = await prisma.retailPayment.findUnique({
        where: { razorpayOrderId: payment.order_id },
      });
      if (retailPayment) await markRetailPaymentCaptured(retailPayment.id, payment.id);
    }
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

// =============================================================================
// markRetailPaymentCaptured: idempotent flip of every order a payment covers
// =============================================================================
// One database transaction, so a payment is never recorded with only some of
// its orders paid. Each write is conditional, which is what makes the browser
// callback and the webhook safe to arrive in either order, or both: the second
// finds the payment already stamped and does nothing.
//
// An order can sit in more than one payment. Whichever captures first pays
// for it; if a later one captures too, its share for that order is money taken
// twice. It is recorded and the admins are told, because that refund is manual.
async function markRetailPaymentCaptured(retailPaymentId: string, razorpayPaymentId: string) {
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const claim = await tx.retailPayment.updateMany({
      where: { id: retailPaymentId, paidAt: null },
      data: { paidAt: now, razorpayPaymentId },
    });
    if (claim.count === 0) return null; // already recorded

    const payment = await tx.retailPayment.findUniqueOrThrow({
      where: { id: retailPaymentId },
      include: {
        orders: { select: { id: true, totalAmount: true } },
        buyer: { select: { name: true } },
      },
    });

    const overpaid: { id: string; totalAmount: number }[] = [];
    for (const order of payment.orders) {
      const paid = await tx.retailOrder.updateMany({
        where: { id: order.id, paidAt: null },
        data: { paidAt: now },
      });
      if (paid.count === 0) {
        overpaid.push(order);
        continue;
      }
      await tx.transaction.updateMany({
        where: { retailOrderId: order.id, paymentStatus: 'AWAITING_PAYMENT' },
        data: { paymentStatus: 'ESCROW', razorpayPaymentId },
      });
    }
    return { payment, overpaid };
  });

  if (outcome && outcome.overpaid.length > 0) {
    const { payment, overpaid } = outcome;
    const refundDue = Math.round(overpaid.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100;
    await recordAudit({
      actorId: null,
      actorRole: 'SYSTEM',
      action: 'retail_payment.overpaid',
      entityType: 'RetailPayment',
      entityId: payment.id,
      metadata: { razorpayPaymentId, refundDue, currency: payment.currency, retailOrderIds: overpaid.map((o) => o.id) },
    });
    void notifyAdminsRetailOverpaid(
      payment.buyer.name, refundDue, payment.currency, razorpayPaymentId, payment.id,
    ).catch(() => {});
  }

  return prisma.retailPayment.findUniqueOrThrow({
    where: { id: retailPaymentId },
    include: {
      orders: {
        select: { id: true, totalAmount: true, transactions: { select: { id: true, paymentStatus: true } } },
      },
    },
  });
}
