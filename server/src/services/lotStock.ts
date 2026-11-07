// =============================================================================
// Selling part of a lot to a bid
// =============================================================================
// Accepting a bid sells the bid's quantity, not the whole lot. What is left
// stays on sale, and the lot is SOLD only once nothing is left. It used to
// sell the whole lot on every accept, so accepting 10 quintals of a
// 100-quintal lot took the other 90 off the market for nobody.
//
// Used by a seller accepting a bid (bid.service) and by an agent-negotiated
// deal (negotiation.service), inside the transaction that makes the deal.
// =============================================================================

import { Prisma } from '../generated/prisma/client';

// Quantities are floats (half a kilo of a quintal lot is 0.005), so "nothing
// left" allows for the rounding a subtraction can leave behind.
export const STOCK_EPSILON = 1e-9;

// Take `quantity` off an ACTIVE lot, conditional on that much still being
// there. Returns what is left, or null when the claim missed (sold, in an
// auction, or not enough stock), which the caller turns into a refusal.
export async function claimLotQuantity(
  tx: Prisma.TransactionClient,
  listingId: string,
  quantity: number,
): Promise<number | null> {
  // The tolerance matters once a lot has been sold in parts: 0.03 less 0.01
  // is 0.0199999..., and without it the last 0.02 could never be accepted.
  // Whatever is below zero by rounding is set to 0 just below.
  const claim = await tx.listing.updateMany({
    where: { id: listingId, status: 'ACTIVE', remainingQuantity: { gte: quantity - STOCK_EPSILON } },
    data: { remainingQuantity: { decrement: quantity } },
  });
  if (claim.count === 0) return null;

  // The row is locked by the update above until the transaction ends, so this
  // read is the lot as this transaction left it.
  const lot = await tx.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: { remainingQuantity: true },
  });
  if (lot.remainingQuantity <= STOCK_EPSILON) {
    await tx.listing.update({
      where: { id: listingId },
      data: { status: 'SOLD', remainingQuantity: 0 },
    });
    return 0;
  }
  return lot.remainingQuantity;
}

// Turn down the open bids on a lot that what is left can no longer fill.
// A bid that still fits stays open for the seller to decide on.
export async function rejectBidsOverStock(
  tx: Prisma.TransactionClient,
  listingId: string,
  exceptBidId: string,
  remaining: number,
): Promise<void> {
  await tx.bid.updateMany({
    where: {
      listingId,
      id: { not: exceptBidId },
      status: { in: ['PENDING', 'COUNTERED'] },
      ...(remaining > STOCK_EPSILON && { quantity: { gt: remaining + STOCK_EPSILON } }),
    },
    data: { status: 'REJECTED' },
  });
}
