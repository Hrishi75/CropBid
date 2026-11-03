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
import { PUBLIC_SELLER_SELECT, nameOnlySellers } from './publicSeller';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import { buyerPayable, buyerPaysFreight, freightShares } from '../utils/freight';
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
// The shop order a retail lot belongs to, as a shopper's order screens need
// it: what the whole shop order costs with its delivery, how many lots share
// it, and whether it has been paid. The Razorpay ids stay out.
const RETAIL_ORDER_SUMMARY_SELECT = {
  id: true,
  itemsTotal: true,
  deliveryFee: true,
  totalAmount: true,
  currency: true,
  paidAt: true,
  sellerId: true,
  // A cancelled order still shows in the history, saying who called it off and
  // why. cancelledById is compared with the viewer's own id and with sellerId,
  // never displayed: the three answers are "you", "the shop" and "CropBid",
  // and an admin cancellation used to read as the shop's doing.
  cancelledAt: true,
  cancelledById: true,
  cancelReason: true,
  _count: { select: { transactions: true } },
} as const;

// The seller's share of delivery comes out of their payout, and on a SPLIT or
// BUYER deal that share is half or none of it (utils/freight.ts).
// Each side keeps its own end of a shipment's route and loses the other's,
// which is the other party's address; the event log's places go too. The
// mirror of the same rule in forShipmentViewer() (logistics.service.ts).
function routeForViewer<S extends Record<string, any> | null | undefined>(
  shipment: S,
  tx: { farmerId: string; buyerId: string },
  userId: string,
  role: string,
): S {
  if (!shipment || role === 'ADMIN') return shipment;
  const out: Record<string, any> = { ...shipment };
  if ('pickupLocation' in out && tx.farmerId !== userId) out.pickupLocation = null;
  if ('deliveryLocation' in out && tx.buyerId !== userId) out.deliveryLocation = null;
  if (Array.isArray(out.trackingUpdates)) {
    out.trackingUpdates = out.trackingUpdates.map((u: Record<string, unknown>) => ({ ...u, location: null }));
  }
  return out as S;
}

export function sellerNetAmount(
  totalAmount: number,
  platformFeeAmount: number,
  transportCost?: number | null,
  freightPaidBy: string = 'FARMER',
): number {
  return totalAmount - platformFeeAmount - freightShares(freightPaidBy, transportCost).seller;
}

// Delivery as both sides of a trade deal need it on screen, worked out once
// here so the web and the app cannot disagree about a split. `amount` is the
// quote, or the booked cost on a seller-pays deal booked without one; null
// while nobody has priced it yet.
export function freightSummary(tx: {
  totalAmount: number;
  platformFeeAmount: number;
  freightPaidBy: string;
  freightQuote: number | null;
  retailOrderId?: string | null;
  shipment?: { transportCost?: number | null } | null;
}) {
  const amount = tx.freightQuote ?? tx.shipment?.transportCost ?? null;
  const shares = freightShares(tx.freightPaidBy, amount);
  return {
    paidBy: tx.freightPaidBy,
    amount,
    buyerShare: amount == null ? null : shares.buyer,
    sellerShare: amount == null ? null : shares.seller,
    // The buyer cannot pay until a share they owe has been quoted.
    awaitingQuote: !tx.retailOrderId && buyerPaysFreight(tx.freightPaidBy) && tx.freightQuote == null,
    buyerPays: amount == null && buyerPaysFreight(tx.freightPaidBy)
      ? null
      : buyerPayable({ totalAmount: tx.totalAmount, freightPaidBy: tx.freightPaidBy, freightQuote: amount }),
    sellerReceives: amount == null
      ? null
      : Math.round(sellerNetAmount(tx.totalAmount, tx.platformFeeAmount, amount, tx.freightPaidBy) * 100) / 100,
  };
}

// =============================================================================
// CREATE TRANSACTION — Called when a bid is accepted
// =============================================================================
// Pass the sale's Prisma transaction client (`tx`) so the escrow record is
// created ATOMICALLY with the sale that produced the accepted bid. If anything
// in the sale rolls back, so does this — a committed sale can never be left
// without a payable transaction. Defaults to the top-level client for any
// standalone call.
//
// `link.retailOrderId` ties a retail lot to the shop order it was bought in,
// which is what makes the shop's lots one payment (see RetailOrder).
export async function createTransaction(
  bidId: string,
  client: Prisma.TransactionClient = prisma,
  link: { retailOrderId?: string } = {},
) {
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
      retailOrderId: link.retailOrderId ?? null,
      // Delivery terms as accepted. Retail lots never carry anything but the
      // seller default: household delivery is the shop order's fee (§3b).
      freightPaidBy: link.retailOrderId ? 'FARMER' : bid.freightPaidBy,
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
      retailOrder: { select: RETAIL_ORDER_SUMMARY_SELECT },
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
  // contactReleased already encodes the whole decision (admin or own row; the
  // other side never), so the bid snapshot follows it rather than re-deriving
  // the rule. Firm names go too (nameOnlySellers).
  // Ops see firm names; the two sides do not.
  const names = role === 'ADMIN' ? <T,>(v: T) => v : nameOnlySellers;
  return names(redactTransactionContacts(transactions, { userId, role }).map((t) => {
    const withFreight = { ...t, freight: freightSummary(t), shipment: routeForViewer(t.shipment, t, userId, role) };
    return t.contactReleased
      ? withFreight
      : { ...withFreight, bid: { ...t.bid, deliveryAddress: null, contactPhone: null } };
  }));
}

// =============================================================================
// GET TRANSACTION — View a specific transaction
// =============================================================================
export async function getTransaction(transactionId: string, userId: string, role: string) {
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
      retailOrder: { select: RETAIL_ORDER_SUMMARY_SELECT },
      // Freight, for the settlement breakdown: the seller pays it, so they
      // need to see the amount alongside the platform fee.
      //
      // An explicit select, not `true`. The two counterparties are exactly who
      // the carrier's identity is withheld from, so listing the visible
      // columns means a future column on Shipment cannot appear here by simply
      // existing. Admins get the same select: this page does not show the
      // carrier, and the tracking page it links to is where ops read it.
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

  // The two sides of the deal, or an admin. Admin → Transactions links every
  // row here, and until this check let admins through, every one of those
  // links was a 403.
  const isAdmin = role === 'ADMIN';
  if (!isAdmin && transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'You are not involved in this transaction');
  }

  // Past the check, a non-admin who is not the buyer is the farmer, which is
  // the side the contact gate is for. The role is passed as FARMER rather than
  // as sent so that holds whatever the account's role says; an admin is passed
  // as ADMIN and sees both sides' contact, as on every other admin read.
  const viewed = { ...redactTransactionContact(transaction, { userId, role: isAdmin ? 'ADMIN' : 'FARMER' }), freight: freightSummary(transaction) };
  return (isAdmin ? <T,>(v: T) => v : nameOnlySellers)(viewed.contactReleased
    ? viewed
    : { ...viewed, bid: { ...viewed.bid, deliveryAddress: null, contactPhone: null } });
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

  // A deal that was called off or refunded has nothing to deliver, and
  // confirming one that was never paid would mark it done with no money held.
  if (transaction.paymentStatus === 'CANCELLED' || transaction.paymentStatus === 'REFUNDED') {
    throw new ApiError(409, `This deal was ${transaction.paymentStatus.toLowerCase()}, so its delivery cannot change`);
  }
  if (status === 'CONFIRMED' && transaction.paymentStatus !== 'ESCROW') {
    throw new ApiError(409, 'This deal has not been paid for yet, so delivery cannot be confirmed');
  }

  // Conditional on the delivery and payment state just read. A shop order
  // cancelled at the same moment (retailOrder.service, which writes on
  // PENDING) must not be overwritten by "on the way", and two confirms arriving
  // together move it once.
  //
  // CONFIRMING IS THE RELEASE, IN ONE WRITE. They used to be two: the delivery
  // moved to CONFIRMED, the seller was told "payment released", and only then
  // did the release try its claim. A refund landing in between left a
  // refunded deal marked confirmed, with that message already sent, which with
  // manual payouts is an invitation to pay the seller anyway. Review caught it.
  // Now the confirmation and the release are one claim, and a refund that got
  // there first makes the whole confirmation fail before anyone is told.
  const moved = status === 'CONFIRMED'
    ? await releasePayment(transactionId, { confirmDelivery: true })
    : (await prisma.transaction.updateMany({
        where: { id: transactionId, deliveryStatus: current, paymentStatus: transaction.paymentStatus },
        data: { deliveryStatus: status as any },
      })).count === 1;
  if (!moved) {
    throw new ApiError(409, 'This deal changed while you were looking at it. Refresh and try again.');
  }

  const updated = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
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

  // Confirmed means released (above), so the seller is told what they are due.
  if (status === 'CONFIRMED') {
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
      sellerNetAmount(
        transaction.totalAmount,
        transaction.platformFeeAmount,
        freight?.transportCost ?? transaction.freightQuote,
        transaction.freightPaidBy,
      ),
      transaction.currency, transactionId
    ).catch(() => {});
  }

  return updated;
}

// =============================================================================
// RELEASE PAYMENT — Move funds from escrow to farmer
// =============================================================================
export async function releasePayment(
  transactionId: string,
  { confirmDelivery = false }: { confirmDelivery?: boolean } = {},
): Promise<boolean> {
  // Conditional on ESCROW in the write, like refundTransaction: a refund
  // landing first makes this miss rather than flip REFUNDED back to RELEASED.
  // The trust bumps ride on the same claim, so two confirms arriving together
  // cannot award them twice. With confirmDelivery the same write moves the
  // delivery DELIVERED -> CONFIRMED, so the two cannot disagree.
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.transaction.updateMany({
      where: {
        id: transactionId,
        paymentStatus: 'ESCROW',
        ...(confirmDelivery && { deliveryStatus: 'DELIVERED' as const }),
      },
      data: {
        paymentStatus: 'RELEASED',
        ...(confirmDelivery && { deliveryStatus: 'CONFIRMED' as const }),
      },
    });
    if (claimed.count === 0) return false;

    const transaction = await tx.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: { farmerId: true, buyerId: true },
    });

    // Successful delivery = +2 each side, capped at 100.
    await tx.$executeRaw`UPDATE "User" SET "trustScore" = LEAST("trustScore" + 2, 100) WHERE id = ${transaction.farmerId}`;
    await tx.$executeRaw`UPDATE "User" SET "trustScore" = LEAST("trustScore" + 2, 100) WHERE id = ${transaction.buyerId}`;
    return true;
  });
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

  // CONDITIONAL ON ESCROW IN THE WRITE ITSELF. Read-then-write let a refund
  // and the buyer confirming delivery both see ESCROW and both write, so the
  // deal ended RELEASED and REFUNDED in either order, and with manual
  // transfers both sides could be paid. Whichever lands first wins; the other
  // is refused. releasePayment holds the same condition.
  const claimed = await prisma.transaction.updateMany({
    where: { id: transactionId, paymentStatus: 'ESCROW' },
    data: { paymentStatus: 'REFUNDED' },
  });
  if (claimed.count === 0) {
    throw new ApiError(409, 'This deal is no longer in escrow (it may have just been released). Nothing was refunded.');
  }

  const updated = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
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
