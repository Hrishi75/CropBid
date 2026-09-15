// =============================================================================
// Transaction Service — Escrow, Payment & Delivery Tracking
// =============================================================================
// LIFECYCLE OF A TRANSACTION:
//   1. Bid gets ACCEPTED → Transaction created (paymentStatus: ESCROW)
//   2. Buyer "pays" → money held in escrow (we simulate this)
//   3. Farmer ships → deliveryStatus: IN_TRANSIT
//   4. Buyer confirms receipt → deliveryStatus: CONFIRMED
//   5. Payment released to farmer → paymentStatus: RELEASED
//   6. Trust scores updated for both parties
//
// WHY ESCROW?
// In B2B agricultural trade, trust is critical. Escrow protects both sides:
//   - Buyer knows their money is safe until they confirm delivery
//   - Farmer knows the buyer has already committed funds
//   - The platform holds the money (2% fee on release)
//
// NOTE: This is a SIMULATED escrow. Real payment integration (Razorpay,
// Stripe) would replace the payment status transitions in production.
// =============================================================================

import { prisma } from '../lib/prisma';
import { PUBLIC_SELLER_SELECT } from './publicSeller';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import { notifyDeliveryUpdate, notifyPaymentReleased } from './notification.helpers';
import { redactTransactionContact, redactTransactionContacts } from './contactVisibility';

const PLATFORM_FEE_PERCENT = 2.0;

// What a farmer or buyer may see of a shipment. CropBid hires the haulier, so
// the carrier's identity, its phone number and our cut of the freight are ops
// data: logisticsPartner, logisticsPartnerId, driverPhone and
// platformCommission are all absent by construction here.
//
// Listed positively rather than omitted, so a new column on Shipment has to be
// added here deliberately before a trader can see it. The mirror of this list
// is forShipmentViewer() in logistics.service.ts; the two must agree.
const TRADER_SHIPMENT_SELECT = {
  id: true,
  status: true,
  transportCost: true,
  currency: true,
  paidBy: true,
  pickupLocation: true,
  deliveryLocation: true,
  pickupDate: true,
  estimatedDeliveryDate: true,
  actualDeliveryDate: true,
  // Enough to recognise the truck at your own gate, which is the one
  // operational thing a seller genuinely needs at handover.
  vehicleType: true,
  vehicleNumber: true,
  driverName: true,
  trackingUpdates: true,
  proofOfDelivery: true,
} as const;

// The seller carries the freight (CLAUDE.md §2a), so what they actually take
// home is the deal minus our fee minus transport. One function, because the
// settlement breakdown, the payment-released notification and anything else
// quoting a payout must never disagree about it: two of them did, and the UI
// was the honest one.
export function sellerNetAmount(
  totalAmount: number,
  platformFeeAmount: number,
  transportCost?: number | null,
): number {
  return totalAmount - platformFeeAmount - (transportCost ?? 0);
}

// =============================================================================
// CREATE TRANSACTION — Called when a bid is accepted
// =============================================================================
// Pass the sale's Prisma transaction client (`tx`) so the escrow record is
// created ATOMICALLY with the sale that produced the accepted bid. If anything
// in the sale rolls back, so does this — a committed sale can never be left
// without a payable transaction. Defaults to the top-level client for any
// standalone call.
export async function createTransaction(bidId: string, client: Prisma.TransactionClient = prisma) {
  // Check if transaction already exists for this bid
  const existing = await client.transaction.findUnique({
    where: { bidId },
  });
  if (existing) return existing;

  const bid = await client.bid.findUnique({
    where: { id: bidId },
    include: {
      listing: {
        include: {
          farmer: { include: { user: true } },
        },
      },
      buyer: true,
    },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.status !== 'ACCEPTED') {
    throw new ApiError(400, 'Can only create transaction for accepted bids');
  }

  const totalAmount = bid.bidPricePerUnit * bid.quantity;
  const platformFeeAmount = totalAmount * (PLATFORM_FEE_PERCENT / 100);

  const transaction = await client.transaction.create({
    data: {
      listingId: bid.listingId,
      bidId: bid.id,
      farmerId: bid.listing.farmer.userId,
      buyerId: bid.buyerId,
      finalPricePerUnit: bid.bidPricePerUnit,
      totalAmount,
      currency: bid.currency,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      platformFeeAmount,
      // Capture-only Razorpay flow: deal is matched but money isn't in escrow until
      // the buyer actually pays (see payment.service.ts). Was 'ESCROW' (simulated).
      paymentStatus: 'AWAITING_PAYMENT',
      deliveryStatus: 'PENDING',
    },
    include: {
      // The seller travels with the listing so an order can name the shop it
      // came from and derive its delivery lane. PUBLIC_SELLER_SELECT is the
      // same public-safe projection the storefront uses, so this adds identity
      // (trading name, seller type) and no compliance data.
      listing: { include: { farmer: { select: PUBLIC_SELLER_SELECT } } },
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true } },
      bid: true,
    },
  });

  // NO NOTIFICATION HERE. This runs inside the caller's prisma.$transaction, so
  // `transaction` is not committed yet: firing from here would page ops about a
  // deal that then rolled back, with a booking link to a row that never existed.
  //
  // The ops ping rides alertNewOrder() instead, which every call site already
  // fires AFTER its transaction commits and which re-reads through the
  // top-level client. Same trigger, same timing rule, one place to get right.
  return transaction;
}

// =============================================================================
// GET MY TRANSACTIONS — List transactions for a user
// =============================================================================
export async function getMyTransactions(userId: string, role: string) {
  // BUYER and CONSUMER both sit on the buyer side of a transaction. Only ADMIN
  // sees everything — any other/unknown role must NOT fall through to {}, or
  // it would leak every transaction on the platform to that user.
  const where = role === 'FARMER'
    ? { farmerId: userId }
    : role === 'ADMIN'
      ? {}
      : { buyerId: userId };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      // The seller travels with the listing so an order can name the shop it
      // came from and derive its delivery lane. PUBLIC_SELLER_SELECT is the
      // same public-safe projection the storefront uses, so this adds identity
      // (trading name, seller type) and no compliance data.
      listing: { include: { farmer: { select: PUBLIC_SELLER_SELECT } } },
      // The farmer's phone is NEVER exposed to the counterparty — only the
      // platform (admin endpoints) may see it. The buyer's phone is selected
      // here but redacted below unless the money is actually in escrow: a row
      // exists from bid-acceptance onward, i.e. before the buyer has paid.
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true, phone: true } },
      bid: true,
      // The Deliveries page renders shipment state per deal in one request.
      //
      // logisticsPartner is admin-only. CropBid hires the haulier, so the
      // trader gets the route and the status, not the company we hired. This
      // used to be included unconditionally and the seller's dispatch board
      // printed the carrier's name on every row.
      //
      // The non-admin branch is an explicit SELECT, not `true`. `true` returns
      // every scalar column, which quietly handed the trader logisticsPartnerId,
      // driverPhone and platformCommission — dropping the relation alone left
      // the carrier reachable by its own foreign key. Same visible set as
      // forShipmentViewer() in logistics.service.ts; change both together.
      shipment: role === 'ADMIN'
        ? { include: { logisticsPartner: { select: { id: true, name: true, type: true } } } }
        : { select: TRADER_SHIPMENT_SELECT },
    },
  });

  // Redact both the buyer's phone AND the contact snapshotted onto the bid.
  // Skipping the second one would leave the gate wide open — the Deliveries
  // page reads tx.bid.contactPhone first and only falls back to tx.buyer.phone.
  //
  // contactReleased already encodes the whole decision (admin, own row, or
  // paid), so the bid snapshot follows it rather than re-deriving the rule.
  return redactTransactionContacts(transactions, { userId, role }).map((t) =>
    t.contactReleased
      ? t
      : { ...t, bid: { ...t.bid, deliveryAddress: null, contactPhone: null } },
  );
}

// =============================================================================
// GET TRANSACTION — View a specific transaction
// =============================================================================
export async function getTransaction(transactionId: string, userId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      // The seller travels with the listing so an order can name the shop it
      // came from and derive its delivery lane. PUBLIC_SELLER_SELECT is the
      // same public-safe projection the storefront uses, so this adds identity
      // (trading name, seller type) and no compliance data.
      listing: { include: { farmer: { select: PUBLIC_SELLER_SELECT } } },
      // Neither side's email is ever exposed to the other — a phone number is
      // what a delivery needs, an email address is what a direct-sourcing
      // relationship starts with. The farmer's phone is likewise never exposed;
      // the buyer's is redacted below until the money is in escrow.
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true, phone: true } },
      bid: true,
      // Freight, for the settlement breakdown: the seller pays it, so they
      // need to see the amount alongside the platform fee.
      //
      // An explicit select, not `true`. Only the two counterparties reach this
      // endpoint, and they are exactly who the carrier's identity is withheld
      // from, so listing the visible columns means a future column on Shipment
      // cannot appear here by simply existing.
      shipment: {
        select: {
          id: true,
          status: true,
          transportCost: true,
          currency: true,
          paidBy: true,
          pickupDate: true,
          estimatedDeliveryDate: true,
          actualDeliveryDate: true,
        },
      },
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');

  // Verify user is involved (farmer, buyer, or admin)
  if (transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'You are not involved in this transaction');
  }

  // Only the two counterparties reach this point, so "not the buyer" means the
  // farmer — the side the gate is for.
  const viewed = redactTransactionContact(transaction, { userId, role: 'FARMER' });
  return viewed.contactReleased
    ? viewed
    : { ...viewed, bid: { ...viewed.bid, deliveryAddress: null, contactPhone: null } };
}

// =============================================================================
// UPDATE DELIVERY STATUS — Track shipment progress
// =============================================================================
export async function updateDeliveryStatus(
  transactionId: string,
  userId: string,
  status: string
) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');

  // Validation: who can change what
  const validTransitions: Record<string, { next: string[]; by: 'farmer' | 'buyer' }> = {
    PENDING: { next: ['IN_TRANSIT'], by: 'farmer' },
    IN_TRANSIT: { next: ['DELIVERED'], by: 'farmer' },
    DELIVERED: { next: ['CONFIRMED'], by: 'buyer' },
  };

  const current = transaction.deliveryStatus;
  const rule = validTransitions[current];

  if (!rule) {
    throw new ApiError(400, `Cannot update from ${current} status`);
  }

  if (!rule.next.includes(status)) {
    throw new ApiError(400, `Invalid transition: ${current} → ${status}. Allowed: ${rule.next.join(', ')}`);
  }

  // Check who's making the change
  if (rule.by === 'farmer' && transaction.farmerId !== userId) {
    throw new ApiError(403, 'Only the farmer can update this status');
  }
  if (rule.by === 'buyer' && transaction.buyerId !== userId) {
    throw new ApiError(403, 'Only the buyer can confirm delivery');
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: { deliveryStatus: status as any },
    include: {
      // The seller travels with the listing so an order can name the shop it
      // came from and derive its delivery lane. PUBLIC_SELLER_SELECT is the
      // same public-safe projection the storefront uses, so this adds identity
      // (trading name, seller type) and no compliance data.
      listing: { include: { farmer: { select: PUBLIC_SELLER_SELECT } } },
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true } },
    },
  });

  // Notify the other party about the delivery update
  const notifyUserId = rule.by === 'farmer' ? transaction.buyerId : transaction.farmerId;
  const cropName = updated.listing?.cropName || 'Crop';
  notifyDeliveryUpdate(notifyUserId, cropName, status, transactionId).catch(() => {});

  // If buyer confirmed delivery, release payment and update trust scores
  if (status === 'CONFIRMED') {
    await releasePayment(transactionId);
    // Freight comes out too. This used to quote total minus platform fee while
    // the settlement breakdown on screen already subtracted transport as well,
    // so the seller was told two different numbers for the same payout and the
    // one they saw first was the smaller, correct one.
    const freight = await prisma.shipment.findUnique({
      where: { transactionId },
      select: { transportCost: true },
    });
    notifyPaymentReleased(
      transaction.farmerId,
      sellerNetAmount(transaction.totalAmount, transaction.platformFeeAmount, freight?.transportCost),
      transaction.currency, transactionId
    ).catch(() => {});
  }

  return updated;
}

// =============================================================================
// RELEASE PAYMENT — Move funds from escrow to farmer
// =============================================================================
async function releasePayment(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) return;
  if (transaction.paymentStatus !== 'ESCROW') return;

  await prisma.$transaction([
    // Release payment
    prisma.transaction.update({
      where: { id: transactionId },
      data: { paymentStatus: 'RELEASED' },
    }),

    // Boost farmer trust score (successful delivery = +2, capped at 100)
    prisma.$executeRaw`UPDATE "User" SET "trustScore" = LEAST("trustScore" + 2, 100) WHERE id = ${transaction.farmerId}`,

    // Boost buyer trust score (confirmed receipt = +2, capped at 100)
    prisma.$executeRaw`UPDATE "User" SET "trustScore" = LEAST("trustScore" + 2, 100) WHERE id = ${transaction.buyerId}`,
  ]);
}

// =============================================================================
// REFUND — Return funds to buyer (admin action or dispute resolution)
// =============================================================================
export async function refundTransaction(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  if (transaction.paymentStatus !== 'ESCROW') {
    throw new ApiError(400, 'Can only refund transactions in escrow');
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: { paymentStatus: 'REFUNDED' },
    include: {
      // The seller travels with the listing so an order can name the shop it
      // came from and derive its delivery lane. PUBLIC_SELLER_SELECT is the
      // same public-safe projection the storefront uses, so this adds identity
      // (trading name, seller type) and no compliance data.
      listing: { include: { farmer: { select: PUBLIC_SELLER_SELECT } } },
      farmer: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
    },
  });

  return updated;
}

// =============================================================================
// GET TRANSACTION STATS — Summary for dashboards
// =============================================================================
export async function getTransactionStats(userId: string, role: string) {
  const where = role === 'FARMER'
    ? { farmerId: userId }
    : { buyerId: userId };

  const [total, inEscrow, released, refunded] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { ...where, paymentStatus: 'ESCROW' } }),
    prisma.transaction.count({ where: { ...where, paymentStatus: 'RELEASED' } }),
    prisma.transaction.count({ where: { ...where, paymentStatus: 'REFUNDED' } }),
  ]);

  const totalRevenue = await prisma.transaction.aggregate({
    where: { ...where, paymentStatus: 'RELEASED' },
    _sum: { totalAmount: true },
  });

  return {
    total,
    inEscrow,
    released,
    refunded,
    totalRevenue: totalRevenue._sum.totalAmount || 0,
  };
}
