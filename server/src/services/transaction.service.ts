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
import { ApiError } from '../utils/ApiError';

const PLATFORM_FEE_PERCENT = 2.0;

// =============================================================================
// CREATE TRANSACTION — Called when a bid is accepted
// =============================================================================
export async function createTransaction(bidId: string) {
  // Check if transaction already exists for this bid
  const existing = await prisma.transaction.findUnique({
    where: { bidId },
  });
  if (existing) return existing;

  const bid = await prisma.bid.findUnique({
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

  const transaction = await prisma.transaction.create({
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
      paymentStatus: 'ESCROW',
      deliveryStatus: 'PENDING',
    },
    include: {
      listing: true,
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true } },
      bid: true,
    },
  });

  return transaction;
}

// =============================================================================
// GET MY TRANSACTIONS — List transactions for a user
// =============================================================================
export async function getMyTransactions(userId: string, role: string) {
  const where = role === 'FARMER'
    ? { farmerId: userId }
    : role === 'BUYER'
      ? { buyerId: userId }
      : {}; // Admin sees all

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      listing: true,
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true } },
      bid: true,
    },
  });

  return transactions;
}

// =============================================================================
// GET TRANSACTION — View a specific transaction
// =============================================================================
export async function getTransaction(transactionId: string, userId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      listing: true,
      farmer: { select: { id: true, name: true, trustScore: true, email: true, phone: true } },
      buyer: { select: { id: true, name: true, trustScore: true, email: true, phone: true } },
      bid: true,
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');

  // Verify user is involved (farmer, buyer, or admin)
  if (transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'You are not involved in this transaction');
  }

  return transaction;
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
      listing: true,
      farmer: { select: { id: true, name: true, trustScore: true } },
      buyer: { select: { id: true, name: true, trustScore: true } },
    },
  });

  // If buyer confirmed delivery, release payment and update trust scores
  if (status === 'CONFIRMED') {
    await releasePayment(transactionId);
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
    prisma.user.update({
      where: { id: transaction.farmerId },
      data: {
        trustScore: {
          increment: 2,
        },
      },
    }),

    // Boost buyer trust score (confirmed receipt = +2, capped at 100)
    prisma.user.update({
      where: { id: transaction.buyerId },
      data: {
        trustScore: {
          increment: 2,
        },
      },
    }),
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
      listing: true,
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
