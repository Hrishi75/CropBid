// =============================================================================
// Retail Order Service: a household basket, one shop at a time
// =============================================================================
// A shopper's basket can hold items from several shops. Each shop makes its own
// delivery run, so each shop's share of the basket is ONE order with ONE
// payment: a RetailOrder. Inside it every lot is still its own Bid and
// Transaction, because stock, escrow release, refunds and the seller's
// settlement all work per lot and none of that changes here.
//
// THE DELIVERY FEE (decided 2026-09-20)
// A delivery run costs the same whether it carries ₹60 of coriander or ₹600 of
// staples. From ₹200 of one shop's items the run is free; below that the
// shopper pays ₹30 towards it, and the order still goes through. It replaced a
// hard ₹150 floor that refused small orders outright.
//
// PER SHOP, not per lot and not per basket. Per lot punished a shopper for
// buying two things from the same counter (two ₹120 items were two short
// orders). Per basket let ₹200 spread across three shops pass as one, when it
// is still three trips.
//
// CropBid keeps the fee. It is not part of any lot's price, so it never
// reaches Transaction.totalAmount, the 2% platform fee or what the seller is
// paid.
//
// One number in one place, served to both clients from GET /browse/retail-rules
// so neither keeps a copy that drifts.
// =============================================================================

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import type { Unit } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import {
  notifyAdminsRetailRefundDue,
  notifyDirectPurchase,
  notifyRetailOrderCancelled,
} from './notification.helpers';
import { createTransaction } from './transaction.service';
import { alertNewOrder } from './orderAlert.service';
import { orderContactDefaults } from './bid.service';

export const RETAIL_DELIVERY = {
  /** A shop's items worth at least this many rupees travel free. */
  freeFrom: 200,
  /** Charged once per shop order below `freeFrom`, in rupees. Kept by CropBid. */
  fee: 30,
} as const;

/** What one shop order pays for delivery, given its items total in rupees. */
export function deliveryFeeFor(itemsTotal: number): number {
  return itemsTotal < RETAIL_DELIVERY.freeFrom ? RETAIL_DELIVERY.fee : 0;
}

// A household basket is a handful of rows. The cap is there so one request
// cannot hold a transaction open across hundreds of stock claims.
const MAX_LINES = 50;

// Money is a Float across the schema, so totals are rounded to paise before
// they are compared or stored. The clients round the same sum the same way,
// which is what keeps the fee they show equal to the fee charged.
function toPaise(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface RetailLineInput {
  listingId: string;
  /** In the LOT's own unit, which `unit` names when the caller converted into it. */
  quantity: number;
  /**
   * The unit the CALLER converted its kilograms with. Optional so older
   * clients keep working; when present, a listing that has since been
   * re-denominated is refused rather than silently rescaled a hundredfold.
   */
  unit?: Unit;
  /**
   * Client-minted reference for this line's purchase. A retry after a lost
   * response hands back the order that already exists instead of buying again.
   */
  idempotencyKey?: string;
}

export interface RetailOrderInput {
  lines: RetailLineInput[];
  deliveryAddress?: string;
  contactPhone?: string;
  /**
   * The delivery fee the shopper was shown. Optional, so the one-lot
   * direct-purchase path and older clients still work; when sent, an order
   * whose fee has moved since (a re-price across ₹200, say) is refused
   * rather than charged an amount nobody saw.
   */
  deliveryFee?: number;
  /**
   * No delivery fee on this order, whatever it comes to. Set only by the
   * one-lot direct-purchase path, for clients that predate fees entirely:
   * their bill says delivery is free, they cannot send what they were shown,
   * so the guard above cannot protect them. Charging them anyway would be a
   * fee nobody displayed. See the note on createDirectPurchase.
   */
  waiveDeliveryFee?: boolean;
}

// What every caller gets back, replay or not. A retry has to be
// indistinguishable from the response it lost.
const RETAIL_ORDER_INCLUDE = {
  transactions: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      bidId: true,
      listingId: true,
      totalAmount: true,
      paymentStatus: true,
      deliveryStatus: true,
    },
  },
} as const;

function loadRetailOrder(id: string) {
  return prisma.retailOrder.findUniqueOrThrow({ where: { id }, include: RETAIL_ORDER_INCLUDE });
}

// P2002 is Prisma's unique-constraint violation. Narrowed to our column so an
// unrelated collision still surfaces as the error it is, instead of being
// answered with somebody's order.
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return fields.some((f) => String(f).includes('idempotencyKey'));
}

// Has this exact order already been placed? Only an EXACT match is a replay:
// every line's key found, all under one shop order. A basket that is partly
// ordered cannot be completed by quietly buying the rest, because the fee was
// worked out on the whole, so it is refused and the shopper is sent to look.
//
// Scoped to the buyer: a key belonging to someone else is not this caller's
// order to be handed back, however it was come by.
async function findReplay(buyerId: string, lines: RetailLineInput[]) {
  const keys = lines.map((l) => l.idempotencyKey).filter((k): k is string => !!k);
  if (keys.length === 0) return null;

  const prior = await prisma.bid.findMany({
    where: { idempotencyKey: { in: keys }, buyerId },
    select: { transaction: { select: { retailOrderId: true } } },
  });
  if (prior.length === 0) return null;

  const orderIds = new Set(prior.map((b) => b.transaction?.retailOrderId ?? null));
  const [orderId] = [...orderIds];
  if (keys.length === lines.length && prior.length === lines.length && orderIds.size === 1 && orderId) {
    return loadRetailOrder(orderId);
  }
  throw new ApiError(409, 'Part of this order has already been placed. Check your orders before trying again.');
}

// =============================================================================
// CREATE RETAIL ORDER: one shop's items, one delivery, one payment
// =============================================================================
export async function createRetailOrder(buyerId: string, input: RetailOrderInput) {
  const { lines } = input;
  if (lines.length === 0) throw new ApiError(400, 'An order needs at least one item.');
  if (lines.length > MAX_LINES) throw new ApiError(400, `An order can hold at most ${MAX_LINES} items.`);
  if (new Set(lines.map((l) => l.listingId)).size !== lines.length) {
    throw new ApiError(400, 'The same item is in this order twice.');
  }
  const keys = lines.map((l) => l.idempotencyKey).filter(Boolean);
  if (new Set(keys).size !== keys.length) {
    throw new ApiError(400, 'Each item needs its own purchase reference.');
  }

  // Before anything is validated or claimed: if this exact order already
  // happened, hand back what it produced.
  const replay = await findReplay(buyerId, lines);
  if (replay) return { order: replay, replayed: true };

  const buyer = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { name: true, location: true },
  });

  // LOCALITY, ENFORCED HERE AND NOT ONLY IN THE UI. Retail is city-scoped: a
  // few kilos of fresh produce cannot be trucked across a state, and a shopper
  // who has never picked a city is exactly the case the client-side rule skips.
  const buyerCity = buyer?.location?.trim() ?? '';
  if (buyerCity === '') {
    throw new ApiError(400, 'Choose your delivery city before ordering.');
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: lines.map((l) => l.listingId) } },
    include: { farmer: { select: { userId: true } } },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));

  let sellerId: string | null = null;
  const priced = lines.map((line) => {
    const listing = byId.get(line.listingId);
    if (!listing) throw new ApiError(404, 'Listing not found');
    if (!listing.directSaleEnabled || listing.retailPricePerUnit == null) {
      throw new ApiError(400, `${listing.cropName} is not available for direct purchase.`);
    }
    if (listing.farmer.userId === buyerId) {
      throw new ApiError(400, 'You cannot buy from your own listing');
    }
    if (buyerCity.toLowerCase() !== listing.location.trim().toLowerCase()) {
      throw new ApiError(
        400,
        `This lot ships from ${listing.location} and cannot be delivered to ${buyerCity}.`,
      );
    }
    // UNIT AGREEMENT. The retail surface is denominated in kilograms and
    // converts to the seller's unit on the way here, so the quantity only means
    // what the caller thinks if both sides agree on that unit.
    if (line.unit && line.unit !== listing.unit) {
      throw new ApiError(
        409,
        'The seller changed how this lot is sold. Open your basket and check the amount.',
      );
    }
    // One order is one shop, because one shop is one delivery run and the fee
    // is worked out per run.
    if (sellerId === null) sellerId = listing.farmer.userId;
    if (listing.farmer.userId !== sellerId) {
      throw new ApiError(400, 'Items from different shops are separate orders. Place them one shop at a time.');
    }
    return { line, listing, price: listing.retailPricePerUnit };
  });

  const currency = priced[0].listing.currency;
  if (priced.some((p) => p.listing.currency !== currency)) {
    throw new ApiError(400, 'Items priced in different currencies cannot share an order.');
  }

  // Summed in the order the lines arrived, then rounded once: the clients sum
  // the same products in the same order, so both sides land on the same paisa.
  const itemsTotal = toPaise(priced.reduce((sum, p) => sum + p.price * p.line.quantity, 0));
  const deliveryFee = input.waiveDeliveryFee ? 0 : deliveryFeeFor(itemsTotal);
  if (input.deliveryFee !== undefined && input.deliveryFee !== deliveryFee) {
    throw new ApiError(
      409,
      deliveryFee > 0
        ? `This shop's items now come to less than ₹${RETAIL_DELIVERY.freeFrom}, so delivery is ₹${deliveryFee}. Check your basket and place the order again.`
        : `This shop's items now come to ₹${RETAIL_DELIVERY.freeFrom} or more, so delivery is free. Check your basket and place the order again.`,
    );
  }

  const contact = await orderContactDefaults(buyerId, input);
  // A retail order the seller cannot deliver or follow up on is worthless:
  // unlike a trade bid there is no negotiation step where that gets sorted out.
  if (!contact.deliveryAddress || !contact.contactPhone) {
    throw new ApiError(
      400,
      'Add a delivery address and phone number so the seller can deliver your order. Set them in your profile or include them with the order.',
    );
  }

  const purchase = () => prisma.$transaction(async (tx) => {
    const order = await tx.retailOrder.create({
      data: {
        buyerId,
        sellerId: sellerId!,
        itemsTotal,
        deliveryFee,
        totalAmount: toPaise(itemsTotal + deliveryFee),
        currency,
      },
    });

    // Claimed in listing-id order, not basket order, so two baskets sharing
    // lots always lock them in the same sequence and cannot deadlock each other.
    const claimOrder = [...priced].sort((a, b) => a.listing.id.localeCompare(b.listing.id));
    const bids: { bidId: string; listing: (typeof priced)[number]['listing']; quantity: number }[] = [];

    for (const { line, listing, price } of claimOrder) {
      // Conditional claim: only decrement if enough remains and the lot is still
      // on sale. Losing it rolls the whole shop order back, because a delivery
      // fee worked out on four items is wrong for three.
      const claim = await tx.listing.updateMany({
        where: { id: listing.id, status: 'ACTIVE', remainingQuantity: { gte: line.quantity } },
        data: { remainingQuantity: { decrement: line.quantity } },
      });
      if (claim.count === 0) {
        throw new ApiError(409, `Not enough ${listing.cropName} left for this order.`);
      }

      const updated = await tx.listing.findUniqueOrThrow({ where: { id: listing.id } });
      if (updated.remainingQuantity <= 0) {
        await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } });
      }

      const bid = await tx.bid.create({
        data: {
          listingId: listing.id,
          buyerId,
          bidPricePerUnit: price,
          quantity: line.quantity,
          totalAmount: price * line.quantity,
          currency: listing.currency,
          deliveryAddress: contact.deliveryAddress,
          contactPhone: contact.contactPhone,
          isAgentBid: false,
          isDirectPurchase: true,
          idempotencyKey: line.idempotencyKey ?? null,
          status: 'ACCEPTED',
        },
        select: { id: true },
      });

      // The escrow record commits (or rolls back) with the sale, tied to its
      // shop order so the shop's lots are paid for together.
      await createTransaction(bid.id, tx, { retailOrderId: order.id });
      bids.push({ bidId: bid.id, listing, quantity: line.quantity });
    }

    return { orderId: order.id, bids };
  });

  let placed;
  try {
    placed = await purchase();
  } catch (err) {
    // The replay check above only sees orders that had committed when it ran.
    // Two retries in flight together both pass it, and the unique index picks
    // the winner: the loser arrives here with everything rolled back, and is
    // owed the same answer the winner got.
    if (!isIdempotencyKeyConflict(err)) throw err;
    const winner = await findReplay(buyerId, lines);
    if (winner) return { order: winner, replayed: true };
    // The key exists but belongs to someone else's order. Nothing to replay,
    // and minting a second one under a fresh key would be worse: the caller
    // believes this key identifies their purchase, and it does not.
    throw new ApiError(409, 'That purchase reference has already been used. Start the order again.');
  }

  // Best-effort, after the commit: the sale is real whatever happens here.
  for (const { bidId, listing, quantity } of placed.bids) {
    notifyDirectPurchase(
      listing.farmer.userId, buyer?.name ?? 'A shopper', listing.cropName,
      quantity, listing.unit, listing.id, bidId,
    ).catch(() => {});
    void alertNewOrder(bidId, 'DIRECT_PURCHASE');
  }

  return { order: await loadRetailOrder(placed.orderId), replayed: false };
}

// =============================================================================
// DIRECT PURCHASE: one lot, for clients that predate shop orders
// =============================================================================
// POST /bids/direct-purchase buys a single lot and answers with its Bid. App
// builds from before shop orders still call it once per lot, so it stays, as a
// one-item shop order: the same claim and the same payment path. What it cannot
// do is add a second item to that order, so a pre-update app ordering two things
// from one shop gets two orders.
//
// AND IT CARRIES NO DELIVERY FEE. Those builds show "Delivery: Free" on the
// bill and have no way to send back what they were shown, so the mismatch guard
// cannot protect them: charging ₹30 here would be a fee the shopper was never
// told about. The old contract is honoured instead, and it heals as people
// update. The cost is that this endpoint is a way to avoid the fee, which is
// accepted: it buys one lot at a time and nothing current calls it.
// =============================================================================

export interface DirectPurchaseInput {
  listingId: string;
  quantity: number;
  deliveryAddress?: string;
  contactPhone?: string;
  idempotencyKey?: string;
  unit?: Unit;
}

// The include used for every direct-purchase result, replay or not.
const DIRECT_PURCHASE_INCLUDE = {
  listing: true,
  buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
} as const;

function findByIdempotencyKey(key: string, buyerId: string) {
  return prisma.bid.findFirst({
    where: { idempotencyKey: key, buyerId },
    include: DIRECT_PURCHASE_INCLUDE,
  });
}

export async function createDirectPurchase(consumerId: string, input: DirectPurchaseInput) {
  // A purchase made before shop orders existed has no RetailOrder to replay
  // through, so the bid itself is the answer, exactly as it always was.
  if (input.idempotencyKey) {
    const already = await findByIdempotencyKey(input.idempotencyKey, consumerId);
    if (already) return { bid: already, replayed: true };
  }

  const { order, replayed } = await createRetailOrder(consumerId, {
    lines: [{
      listingId: input.listingId,
      quantity: input.quantity,
      unit: input.unit,
      idempotencyKey: input.idempotencyKey,
    }],
    deliveryAddress: input.deliveryAddress,
    contactPhone: input.contactPhone,
    waiveDeliveryFee: true,
  });

  const bid = await prisma.bid.findUniqueOrThrow({
    where: { id: order.transactions[0].bidId },
    include: DIRECT_PURCHASE_INCLUDE,
  });
  return { bid, replayed };
}

// =============================================================================
// CANCEL A SHOP ORDER: called off before the shop sends it
// =============================================================================
// WHO. The shopper who placed it, the shop it was placed with, or an admin. A
// shop has to say why, because it is calling off somebody else's order; the
// shopper does not owe anyone a reason.
//
// UNTIL WHEN. Only while every lot is still PENDING, which is up to the moment
// the shop marks it on the way. After that the produce has been picked for this
// order and somebody is out of pocket either way, which is what /terms says.
//
// ALL OR NOTHING, ACROSS THE WHOLE SHOP ORDER. It is one delivery with one
// fee, and half of it is not a thing the rest of the system can price: the fee
// was worked out on the whole. Every lot goes back on the shelf together.
//
// THE MONEY. Nothing was taken from an unpaid order, so its lots end at
// CANCELLED. A paid one has money held, so its lots go to REFUNDED and the
// admins are told, because that transfer is made by hand (CLAUDE.md §6). The
// delivery fee goes back with it: the whole order is off.
export async function cancelRetailOrder(
  retailOrderId: string,
  actor: { userId: string; role: string },
  reason?: string,
) {
  const order = await prisma.retailOrder.findUnique({
    where: { id: retailOrderId },
    include: {
      buyer: { select: { name: true } },
      transactions: {
        select: {
          id: true,
          listingId: true,
          deliveryStatus: true,
          paymentStatus: true,
          bid: { select: { quantity: true } },
        },
      },
    },
  });

  if (!order) throw new ApiError(404, 'Order not found');

  const isBuyer = order.buyerId === actor.userId;
  const isSeller = order.sellerId === actor.userId;
  if (!isBuyer && !isSeller && actor.role !== 'ADMIN') {
    throw new ApiError(403, 'You are not part of this order');
  }

  // Cancelling twice is not an error: the second press of a button, or a
  // retried request, gets the cancelled order back.
  if (order.cancelledAt) return loadRetailOrder(order.id);

  if (order.transactions.some((t) => t.deliveryStatus !== 'PENDING')) {
    throw new ApiError(409, isBuyer
      ? 'This order is already on its way, so it cannot be cancelled. Tell us if something is wrong with it when it arrives.'
      : 'This order is already on its way, so it cannot be cancelled.');
  }

  const note = reason?.trim() || null;
  if (isSeller && !note) {
    throw new ApiError(400, 'Say why you cannot fulfil this order, so the shopper is told something.');
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    // Conditional, so two cancels racing each other produce one cancellation
    // and one no-op rather than returning the stock twice.
    const claim = await tx.retailOrder.updateMany({
      where: { id: order.id, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: note },
    });
    if (claim.count === 0) return null;

    // Listing-id order, the same sequence the purchase claimed them in, so a
    // cancel and a purchase touching the same lots cannot deadlock.
    const lots = [...order.transactions].sort((a, b) => a.listingId.localeCompare(b.listingId));

    // How many lots had money held when this actually ran. Counted from the
    // writes below, never from the snapshot above.
    let heldForRefund = 0;

    for (const lot of lots) {
      // THE PAYMENT STATE IS READ IN THE WRITE, NOT FROM THE SNAPSHOT.
      // A capture can commit between the read at the top of this function and
      // here. Writing `lot.paymentStatus === 'ESCROW' ? ... : ...` from the
      // stale copy would then stamp CANCELLED over ESCROW: money taken, marked
      // as never charged, and nobody told to send it back. So each state is
      // claimed by its own conditional update, and whichever matches is the
      // truth at write time.
      //
      // PENDING is part of both conditions, so a shop pressing "on the way" in
      // the same moment wins and the whole cancellation rolls back.
      const refunded = await tx.transaction.updateMany({
        where: { id: lot.id, deliveryStatus: 'PENDING', paymentStatus: 'ESCROW' },
        data: { deliveryStatus: 'CANCELLED', paymentStatus: 'REFUNDED' },
      });
      const unpaid = refunded.count > 0
        ? { count: 0 }
        : await tx.transaction.updateMany({
          where: { id: lot.id, deliveryStatus: 'PENDING', paymentStatus: 'AWAITING_PAYMENT' },
          data: { deliveryStatus: 'CANCELLED', paymentStatus: 'CANCELLED' },
        });

      if (refunded.count + unpaid.count === 0) {
        // Nothing matched: it shipped, or its money moved somewhere neither
        // branch covers (an admin refund while it sat PENDING). Say which.
        const current = await tx.transaction.findUnique({
          where: { id: lot.id },
          select: { deliveryStatus: true },
        });
        throw new ApiError(409, current?.deliveryStatus === 'PENDING'
          ? 'This order has just changed. Open it again to see where it stands.'
          : 'This order is already on its way, so it cannot be cancelled.');
      }
      heldForRefund += refunded.count;

      // Back on the shelf.
      await tx.listing.update({
        where: { id: lot.listingId },
        data: { remainingQuantity: { increment: lot.bid.quantity } },
      });

      // And back on sale, but only where this retail channel is the only thing
      // that ever closed it. A lot marked SOLD because a wholesale deal took
      // it is spoken for: returning a few kilos to the shelf must not put the
      // whole lot back on the market for someone else to buy.
      const wholesaleDeals = await tx.transaction.count({
        where: { listingId: lot.listingId, bid: { isDirectPurchase: false } },
      });
      if (wholesaleDeals === 0) {
        await tx.listing.updateMany({
          where: { id: lot.listingId, status: 'SOLD' },
          data: { status: 'ACTIVE' },
        });
      }
    }

    // The refund is recorded with the cancellation, not after it. The admin
    // notification below is best-effort by nature (§6 refunds are manual), and
    // losing it used to mean losing the only trace that money was owed back.
    if (heldForRefund > 0) {
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'retail_order.refund_due',
          entityType: 'RetailOrder',
          entityId: order.id,
          metadata: {
            amount: order.totalAmount,
            currency: order.currency,
            lots: heldForRefund,
            reason: note,
          },
        },
      });
    }

    return { heldForRefund };
  });

  if (!cancelled) return loadRetailOrder(order.id);

  // Best-effort, after the commit. The cancellation is real whatever happens.
  const tellTheOtherSide = isBuyer ? order.sellerId : order.buyerId;
  notifyRetailOrderCancelled(
    tellTheOtherSide,
    isBuyer ? 'shopper' : 'shop',
    order.transactions.length,
    order.totalAmount,
    order.currency,
    note,
    order.id,
  ).catch(() => {});

  if (cancelled.heldForRefund > 0) {
    void notifyAdminsRetailRefundDue(
      order.buyer.name, order.totalAmount, order.currency, order.id, note,
    ).catch(() => {});
  }

  return loadRetailOrder(order.id);
}
