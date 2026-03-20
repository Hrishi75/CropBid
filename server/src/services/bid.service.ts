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

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { notifyNewBid, notifyBidAccepted, notifyBidRejected, notifyBidCountered } from './notification.helpers';
import { createTransaction } from './transaction.service';

// --- Input types ---
interface PlaceBidInput {
  listingId: string;
  bidPricePerUnit: number;
  quantity: number;
  message?: string;
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
  if (input.quantity > listing.quantity) {
    throw new ApiError(400, `Only ${listing.quantity} ${listing.unit} available`);
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

  const bid = await prisma.bid.create({
    data: {
      listingId: input.listingId,
      buyerId,
      bidPricePerUnit: input.bidPricePerUnit,
      quantity: input.quantity,
      totalAmount,
      currency: listing.currency,
      message: input.message || null,
      isAgentBid: false,
      status: 'PENDING',
    },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true } } },
          },
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
      buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
    },
  });

  return bids;
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
          farmer: {
            include: { user: { select: { id: true, name: true, trustScore: true } } },
          },
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
      buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
    },
  });

  return bids;
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

  // Accept this bid and reject all other pending bids on the same listing
  const [accepted] = await prisma.$transaction([
    prisma.bid.update({
      where: { id: bidId },
      data: { status: 'ACCEPTED' },
      include: {
        listing: true,
        buyer: { select: { id: true, name: true, trustScore: true, avatar: true } },
      },
    }),
    // Reject competing bids
    prisma.bid.updateMany({
      where: {
        listingId: bid.listingId,
        id: { not: bidId },
        status: { in: ['PENDING', 'COUNTERED'] },
      },
      data: { status: 'REJECTED' },
    }),
    // Mark listing as SOLD
    prisma.listing.update({
      where: { id: bid.listingId },
      data: { status: 'SOLD' },
    }),
  ]);

  // Create transaction and notify buyer
  createTransaction(bidId).catch(() => {});
  notifyBidAccepted(
    bid.buyerId, bid.listing.cropName, bid.bidPricePerUnit,
    bid.currency, bid.listing.unit, bid.listingId, bidId
  ).catch(() => {});

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
