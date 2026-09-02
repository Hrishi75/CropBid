// =============================================================================
// Bid Service — Business Logic for Manual Bidding
// =============================================================================
// BIDDING RULES:
//   1. Bid price must be >= listing's minBidPrice (floor price)
//   2. A buyer can only have ONE active bid per listing
//   3. Can't bid on your own listing (no self-dealing)
//   4. Can't bid on SOLD or EXPIRED listings
//   5. Accepting a bid doesn't auto-create a transaction yet (Phase 11)
//   6. Counter-offers set a new price the buyer can accept or revise
//
// BID LIFECYCLE:
//   PENDING → ACCEPTED (farmer accepts) → Transaction created (Phase 11)
//   PENDING → REJECTED (farmer declines)
//   PENDING → COUNTERED (farmer proposes different price)
//   COUNTERED → PENDING (buyer revises their bid)
//   PENDING → EXPIRED (time ran out, if expiresAt was set)
// =============================================================================

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import type { Unit } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import { notifyNewBid, notifyBidAccepted, notifyBidRejected, notifyBidCountered, notifyDirectPurchase } from './notification.helpers';
import { createTransaction } from './transaction.service';
import { alertNewOrder } from './orderAlert.service';
import { PUBLIC_BUYER_USER_SELECT, redactBidContacts } from './contactVisibility';

// --- Input types ---
interface PlaceBidInput {
  listingId: string;
  bidPricePerUnit: number;
  quantity: number;
  message?: string;
  deliveryAddress?: string;
  contactPhone?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
}

interface DirectPurchaseInput {
  listingId: string;
  quantity: number;
  deliveryAddress?: string;
  contactPhone?: string;
  /** See createDirectPurchase. Optional, so older clients keep working. */
  idempotencyKey?: string;
  /**
   * The unit the CALLER converted its kilograms with. Optional, so older
   * clients keep working; when present it is checked against the listing's
   * current unit and a mismatch is refused. See createDirectPurchase.
   */
  unit?: Unit;
}

// Counterparty-safe farmer shape: public display fields only — never the
// private profile (bankDetails, apmcLicense, fpoName, farmSizeAcres).
// Mirrors PUBLIC_FARMER_SELECT in listing/browse services, plus userId,
// which involvement checks compare against (it equals the public user.id).
const PUBLIC_FARMER_SELECT = {
  id: true,
  userId: true,
  state: true,
  country: true,
  organicCertified: true,
  certificationBody: true,
  verified: true,
  user: { select: { id: true, name: true, trustScore: true, avatar: true } },
} as const;

// The seller needs to know where to send the goods and whom to call. When the
// order form didn't collect these (one-tap consumer buy, agent bids, buyer
// requirement fills), snapshot the buyer's profile phone/location instead of
// leaving the seller blind. Exported for requirement.service, which builds the
// same order snapshot from a requirement's delivery address.
export async function orderContactDefaults(
  buyerId: string,
  input: { deliveryAddress?: string; contactPhone?: string },
) {
  // Whitespace-only values count as "not supplied" — otherwise they'd both
  // skip the profile fallback and render as blank order details.
  const deliveryAddress = input.deliveryAddress?.trim();
  const contactPhone = input.contactPhone?.trim();
  if (deliveryAddress && contactPhone) {
    return { deliveryAddress, contactPhone };
  }
  const buyer = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { phone: true, location: true },
  });
  return {
    deliveryAddress: deliveryAddress || buyer?.location || null,
    contactPhone: contactPhone || buyer?.phone || null,
  };
}

// =============================================================================
// PLACE BID — Buyer submits a bid on a listing
// =============================================================================
export async function placeBid(buyerId: string, input: PlaceBidInput) {
  // Get the listing with farmer info
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { farmer: true },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  // Rule: Can't bid on non-active listings
  if (listing.status !== 'ACTIVE') {
    throw new ApiError(400, `Cannot bid on a ${listing.status.toLowerCase()} listing`);
  }

  // Rule: Can't bid on your own listing
  if (listing.farmer.userId === buyerId) {
    throw new ApiError(400, 'You cannot bid on your own listing');
  }

  // Rule: Bid price must meet the floor price
  if (input.bidPricePerUnit < listing.pricePerUnitMin) {
    throw new ApiError(400, `Bid must be at least ${listing.pricePerUnitMin} per ${listing.unit} (floor price)`);
  }

  // Rule: Quantity can't exceed available
  // Validate against remainingQuantity, not the original quantity: direct-sale
  // consumer purchases decrement remainingQuantity, so this is the real stock a
  // bulk bid can still claim (and equals quantity for listings with no direct sales).
  if (input.quantity > listing.remainingQuantity) {
    throw new ApiError(400, `Only ${listing.remainingQuantity} ${listing.unit} available`);
  }

  // Rule: One active bid per buyer per listing
  const existingBid = await prisma.bid.findFirst({
    where: {
      listingId: input.listingId,
      buyerId,
      status: { in: ['PENDING', 'COUNTERED'] },
    },
  });

  if (existingBid) {
    throw new ApiError(400, 'You already have an active bid on this listing. Update or withdraw it first.');
  }

  // Calculate total
  const totalAmount = input.bidPricePerUnit * input.quantity;

  const contact = await orderContactDefaults(buyerId, input);

  const bid = await prisma.bid.create({
    data: {
      listingId: input.listingId,
      buyerId,
      bidPricePerUnit: input.bidPricePerUnit,
      quantity: input.quantity,
      totalAmount,
      currency: listing.currency,
      message: input.message || null,
      deliveryAddress: contact.deliveryAddress,
      contactPhone: contact.contactPhone,
      paymentTerms: input.paymentTerms || null,
      deliveryTerms: input.deliveryTerms || null,
      isAgentBid: false,
      status: 'PENDING',
    },
    include: {
      listing: {
        include: {
          farmer: { select: PUBLIC_FARMER_SELECT },
        },
      },
      buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
    },
  });

  // Notify the farmer
  notifyNewBid(
    listing.farmer.userId, bid.buyer!.name, listing.cropName,
    input.bidPricePerUnit, listing.currency, listing.unit,
    listing.id, bid.id
  ).catch(() => {}); // Fire and forget

  return bid;
}

// The include used for every direct-purchase result, replay or not. A retry has
// to be indistinguishable from the response it lost, so both paths build the
// bid the same way.
const DIRECT_PURCHASE_INCLUDE = {
  listing: true,
  buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
} as const;

// P2002 is Prisma's unique-constraint violation. Narrowed to our column so an
// unrelated collision — two rows racing on some other unique field — still
// surfaces as the error it is instead of being answered with somebody's order.
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return fields.some((f) => String(f).includes('idempotencyKey'));
}

function findByIdempotencyKey(key: string, buyerId: string) {
  // Scoped to the buyer: a key belonging to somebody else is not this caller's
  // order to be handed back, however it was come by.
  return prisma.bid.findFirst({
    where: { idempotencyKey: key, buyerId },
    include: DIRECT_PURCHASE_INCLUDE,
  });
}

// =============================================================================
// DIRECT PURCHASE — Consumer instant-buys a fixed-price quantity, no bidding
// =============================================================================
// A CONSUMER account skips the negotiate/accept dance entirely: the listing must
// opt into directSaleEnabled with a retailPricePerUnit, and the purchase creates
// an already-ACCEPTED bid so it can flow through the exact same
// createTransaction/payment/shipment pipeline as a negotiated deal.
//
// IDEMPOTENCY, AND WHY IT IS NOT OPTIONAL HERE
// This endpoint spends money and stock in one shot, and the client cannot tell
// a request that failed from one that succeeded and lost its response on the
// way back. Without a key, that ambiguity is unresolvable: the cart shows the
// lot as unsold, the shopper taps buy again, and they own two of it. The window
// is not theoretical — checkout walks the basket one lot at a time over a phone
// connection.
//
// So the caller mints a key for the purchase it INTENDS, and sends the same one
// on every retry of that intent. The column is unique, which makes the database
// the arbiter rather than a read-then-write check that races: a replay either
// finds the first order up front, or loses the insert and is handed the winner.
// Losing rolls the stock decrement back with it, because both live in the same
// transaction.
//
// A changed order is a different intent and needs a new key — the client mints
// one whenever the quantity moves. Leaving the key off entirely still works and
// still buys, it just leaves the caller carrying the ambiguity, which is what
// every pre-existing client does.
export async function createDirectPurchase(consumerId: string, input: DirectPurchaseInput) {
  // Before anything is validated or claimed: if this exact purchase already
  // happened, hand back what it produced.
  if (input.idempotencyKey) {
    const already = await findByIdempotencyKey(input.idempotencyKey, consumerId);
    if (already) return { bid: already, replayed: true };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { farmer: true },
  });

  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!listing.directSaleEnabled || listing.retailPricePerUnit == null) {
    throw new ApiError(400, 'This listing is not available for direct purchase');
  }
  if (listing.farmer.userId === consumerId) {
    throw new ApiError(400, 'You cannot buy from your own listing');
  }

  // LOCALITY, ENFORCED HERE AND NOT ONLY IN THE UI
  // Retail is city-scoped by construction: a few kilos of fresh produce cannot
  // be trucked across a state, and the storefront only ever shows a shopper
  // stock from their own city. That rule lived entirely in the client, which
  // means it was advisory — the shelf, the shop page and the cart all decline
  // to check when the shopper has no city at all, and this endpoint never
  // checked. A shopper who had never picked a city could therefore buy from
  // anywhere, and the order would be created and the stock decremented before
  // anyone noticed it could not be delivered.
  const buyer = await prisma.user.findUnique({
    where: { id: consumerId },
    select: { location: true },
  });
  const buyerCity = buyer?.location?.trim() ?? '';
  if (buyerCity === '') {
    throw new ApiError(400, 'Choose your delivery city before ordering.');
  }
  if (buyerCity.toLowerCase() !== listing.location.trim().toLowerCase()) {
    throw new ApiError(
      400,
      `This lot ships from ${listing.location} and cannot be delivered to ${buyerCity}.`,
    );
  }

  // UNIT AGREEMENT
  // The retail surface is denominated in kilograms and converts to the seller's
  // unit on the way here, so the number below only means what the caller thinks
  // it means if both sides agree on that unit. A seller can re-denominate an
  // active listing at any moment, including between the client's last read and
  // this request, which would silently rescale the order by a hundred or a
  // thousand. Callers that did the conversion say which unit they used, and a
  // disagreement is refused rather than guessed at.
  if (input.unit && input.unit !== listing.unit) {
    throw new ApiError(
      409,
      'The seller changed how this lot is sold. Open your basket and check the amount.',
    );
  }

  const retailPrice = listing.retailPricePerUnit;
  const totalAmount = retailPrice * input.quantity;

  const contact = await orderContactDefaults(consumerId, input);

  // A retail order the seller can't deliver or follow up on is worthless —
  // unlike a B2B bid, there's no negotiation step where logistics get sorted
  // out later. Refuse until the consumer supplies (or their profile carries)
  // both a destination and a phone number.
  if (!contact.deliveryAddress || !contact.contactPhone) {
    throw new ApiError(
      400,
      'Add a delivery address and phone number so the farmer can deliver your order — set them in your profile or include them with the purchase.',
    );
  }

  // Same conditional-claim pattern as acceptBid below: only decrement stock if
  // enough remains and the listing is still active, closing the same TOCTOU
  // race two concurrent purchases could otherwise hit.
  const purchase = async () => prisma.$transaction(async (tx) => {
    const claim = await tx.listing.updateMany({
      where: { id: listing.id, status: 'ACTIVE', remainingQuantity: { gte: input.quantity } },
      data: { remainingQuantity: { decrement: input.quantity } },
    });
    if (claim.count === 0) {
      throw new ApiError(409, 'Not enough stock available for this purchase.');
    }

    const updatedListing = await tx.listing.findUniqueOrThrow({ where: { id: listing.id } });
    if (updatedListing.remainingQuantity <= 0) {
      await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } });
    }

    const created = await tx.bid.create({
      data: {
        listingId: listing.id,
        buyerId: consumerId,
        bidPricePerUnit: retailPrice,
        quantity: input.quantity,
        totalAmount,
        currency: listing.currency,
        deliveryAddress: contact.deliveryAddress,
        contactPhone: contact.contactPhone,
        isAgentBid: false,
        isDirectPurchase: true,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'ACCEPTED',
      },
      include: DIRECT_PURCHASE_INCLUDE,
    });

    // Create the escrow transaction in the SAME tx so the sale and its payable
    // record commit (or roll back) together — no SOLD stock without a transaction.
    await createTransaction(created.id, tx);
    return created;
  });

  let bid;
  try {
    bid = await purchase();
  } catch (err) {
    // The replay check at the top of this function only sees orders that had
    // already committed when it ran. Two retries in flight together both pass
    // it, and the unique index picks the winner — the loser arrives here with
    // its stock decrement already rolled back, and is owed the same answer the
    // winner got.
    if (!isIdempotencyKeyConflict(err) || !input.idempotencyKey) throw err;
    const winner = await findByIdempotencyKey(input.idempotencyKey, consumerId);
    if (winner) return { bid: winner, replayed: true };
    // The key exists but belongs to someone else's order. Nothing to replay,
    // and quietly minting a second one under a fresh key would be worse: the
    // caller believes this key identifies their purchase, and it does not.
    throw new ApiError(409, 'That purchase reference has already been used. Start the order again.');
  }

  // Notify the farmer (best-effort — the sale is already committed above)
  notifyDirectPurchase(
    listing.farmer.userId, bid.buyer!.name, listing.cropName,
    input.quantity, listing.unit, listing.id, bid.id
  ).catch(() => {});
  void alertNewOrder(bid.id, 'DIRECT_PURCHASE');

  return { bid, replayed: false };
}

// =============================================================================
// GET BIDS FOR LISTING — Farmer sees all bids on their listing
// =============================================================================
export async function getBidsForListing(listingId: string, farmerId: string) {
  // Verify the farmer owns this listing
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { farmer: true },
  });

  if (!listing) throw new ApiError(404, 'Listing not found');
  if (listing.farmer.userId !== farmerId) {
    throw new ApiError(403, 'You can only view bids on your own listings');
  }

  const bids = await prisma.bid.findMany({
    where: { listingId },
    orderBy: { createdAt: 'desc' },
    include: {
      // Identity only. The buyer's phone and the snapshotted order contact are
      // withheld until the deal is paid — see contactVisibility.ts.
      buyer: { select: PUBLIC_BUYER_USER_SELECT },
      transaction: { select: { paymentStatus: true } },
    },
  });

  return redactBidContacts(bids);
}

// =============================================================================
// GET MY BIDS — Buyer sees all their bids across listings
// =============================================================================
export async function getMyBids(buyerId: string, status?: string) {
  const where: any = { buyerId };
  if (status) where.status = status;

  const bids = await prisma.bid.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      listing: {
        include: {
          farmer: { select: PUBLIC_FARMER_SELECT },
        },
      },
    },
  });

  return bids;
}

// =============================================================================
// GET ALL INCOMING BIDS — Farmer sees all bids across all their listings
// =============================================================================
export async function getIncomingBids(farmerId: string, status?: string) {
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId: farmerId },
  });

  if (!farmerProfile) throw new ApiError(400, 'Farmer profile not found');

  const where: any = {
    listing: { farmerId: farmerProfile.id },
  };
  if (status) where.status = status;

  const bids = await prisma.bid.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      listing: true,
      // Identity only — same gate as getBidsForListing above.
      buyer: { select: PUBLIC_BUYER_USER_SELECT },
      transaction: { select: { paymentStatus: true } },
    },
  });

  return redactBidContacts(bids);
}

// =============================================================================
// ACCEPT BID — Farmer accepts a buyer's bid
// =============================================================================
export async function acceptBid(bidId: string, farmerId: string) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: {
      listing: { include: { farmer: true } },
    },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.listing.farmer.userId !== farmerId) {
    throw new ApiError(403, 'You can only accept bids on your own listings');
  }
  if (bid.status !== 'PENDING') {
    throw new ApiError(400, `Cannot accept a ${bid.status.toLowerCase()} bid`);
  }

  // Accept this bid and reject all other pending bids on the same listing.
  // The listing claim is a CONDITIONAL updateMany (status must still be sellable),
  // not an unconditional update. This closes a TOCTOU double-sell: two concurrent
  // acceptBid calls for different bids on the same listing would both pass the
  // status pre-check above, then both write ACCEPTED. With the conditional claim,
  // the second transaction blocks on the row lock, re-evaluates against the now
  // committed SOLD row, gets count 0, and bails — so only one bid can win.
  //
  // The claim also requires remainingQuantity >= bid.quantity so a bid can't be
  // accepted for more stock than is actually left after direct-sale consumer
  // purchases (which decrement remainingQuantity but leave the listing ACTIVE).
  // Accepting sells the whole listing, so remainingQuantity drops to 0.
  const accepted = await prisma.$transaction(async (tx) => {
    const claim = await tx.listing.updateMany({
      where: {
        id: bid.listingId,
        status: { notIn: ['SOLD', 'EXPIRED'] },
        remainingQuantity: { gte: bid.quantity },
      },
      data: { status: 'SOLD', remainingQuantity: 0 },
    });
    if (claim.count === 0) {
      throw new ApiError(409, 'This listing is no longer available — its stock was reduced or another sale just went through.');
    }

    const claimedBid = await tx.bid.updateMany({
      where: { id: bidId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    if (claimedBid.count === 0) {
      throw new ApiError(409, 'This bid is no longer pending.');
    }

    // Reject competing bids
    await tx.bid.updateMany({
      where: {
        listingId: bid.listingId,
        id: { not: bidId },
        status: { in: ['PENDING', 'COUNTERED'] },
      },
      data: { status: 'REJECTED' },
    });

    // Create the escrow transaction in the SAME tx so an accepted sale always
    // has a payable record — atomic, never fire-and-forget.
    await createTransaction(bidId, tx);

    return tx.bid.findUniqueOrThrow({
      where: { id: bidId },
      include: {
        listing: true,
        buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
      },
    });
  });

  // Notify buyer (best-effort — the sale is already committed above)
  notifyBidAccepted(
    bid.buyerId, bid.listing.cropName, bid.bidPricePerUnit,
    bid.currency, bid.listing.unit, bid.listingId, bidId
  ).catch(() => {});
  void alertNewOrder(bidId, 'BID_ACCEPTED');

  return accepted;
}

// =============================================================================
// REJECT BID — Farmer declines a bid
// =============================================================================
export async function rejectBid(bidId: string, farmerId: string) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { listing: { include: { farmer: true } } },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.listing.farmer.userId !== farmerId) {
    throw new ApiError(403, 'You can only reject bids on your own listings');
  }
  if (bid.status !== 'PENDING' && bid.status !== 'COUNTERED') {
    throw new ApiError(400, `Cannot reject a ${bid.status.toLowerCase()} bid`);
  }

  const rejected = await prisma.bid.update({
    where: { id: bidId },
    data: { status: 'REJECTED' },
    include: {
      buyer: { select: { id: true, name: true } },
    },
  });

  notifyBidRejected(bid.buyerId, bid.listing.cropName, bid.listingId, bidId).catch(() => {});

  return rejected;
}

// =============================================================================
// COUNTER BID — Farmer proposes a different price
// =============================================================================
export async function counterBid(bidId: string, farmerId: string, counterPrice: number) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { listing: { include: { farmer: true } } },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.listing.farmer.userId !== farmerId) {
    throw new ApiError(403, 'You can only counter bids on your own listings');
  }
  if (bid.status !== 'PENDING') {
    throw new ApiError(400, `Cannot counter a ${bid.status.toLowerCase()} bid`);
  }

  if (counterPrice < bid.listing.pricePerUnitMin) {
    throw new ApiError(400, `Counter price cannot be below your floor price (${bid.listing.pricePerUnitMin})`);
  }

  const countered = await prisma.bid.update({
    where: { id: bidId },
    data: {
      status: 'COUNTERED',
      counterPrice,
    },
    include: {
      buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
      listing: true,
    },
  });

  notifyBidCountered(
    bid.buyerId, bid.listing.cropName, counterPrice,
    bid.listing.currency, bid.listing.unit, bid.listingId, bidId
  ).catch(() => {});

  return countered;
}

// =============================================================================
// UPDATE BID — Buyer updates their bid (e.g., after a counter-offer)
// =============================================================================
export async function updateBid(bidId: string, buyerId: string, newPrice: number) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { listing: true },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.buyerId !== buyerId) {
    throw new ApiError(403, 'You can only update your own bids');
  }
  if (bid.status !== 'COUNTERED' && bid.status !== 'PENDING') {
    throw new ApiError(400, `Cannot update a ${bid.status.toLowerCase()} bid`);
  }

  if (newPrice < bid.listing.pricePerUnitMin) {
    throw new ApiError(400, `Bid must be at least ${bid.listing.pricePerUnitMin} (floor price)`);
  }

  const updated = await prisma.bid.update({
    where: { id: bidId },
    data: {
      bidPricePerUnit: newPrice,
      totalAmount: newPrice * bid.quantity,
      status: 'PENDING', // Reset to pending after buyer revises
      counterPrice: null, // Clear the counter
    },
    include: {
      listing: true,
      buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
    },
  });

  return updated;
}

// =============================================================================
// WITHDRAW BID — Buyer cancels their own bid
// =============================================================================
export async function withdrawBid(bidId: string, buyerId: string) {
  const bid = await prisma.bid.findUnique({ where: { id: bidId } });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.buyerId !== buyerId) {
    throw new ApiError(403, 'You can only withdraw your own bids');
  }
  if (bid.status === 'ACCEPTED') {
    throw new ApiError(400, 'Cannot withdraw an accepted bid');
  }

  await prisma.bid.delete({ where: { id: bidId } });

  return { message: 'Bid withdrawn successfully' };
}
