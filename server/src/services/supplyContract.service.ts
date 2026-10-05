// =============================================================================
// Supply contracts — one price, a large total, delivered in batches
// =============================================================================
// An FMCG buyer proposes a contract to the seller of a lot: a price, a total,
// a batch size and how often. The seller accepts or declines. Once active,
// each batch becomes a deal when it falls due (createDueBatches, run on a
// timer by index.ts), through the same three rows a requirement fill uses: a
// SOLD Listing marked isRequirementFill, an ACCEPTED Bid, and createTransaction.
// So a batch is paid, escrowed, fee'd and freighted exactly like any deal, and
// appears on both sides' existing deal screens without them knowing about
// contracts.
//
// WHAT A CONTRACT IS NOT: a reservation of the source lot's stock. A contract
// runs for months; the lot it was proposed from is today's harvest. Batches
// never draw on it.
//
// Every state change is an updateMany conditioned on the state it was decided
// from, the same idiom as offers and shop-order cancels, so a cancel landing
// while a batch is being made, or two processes making the same batch, cannot
// both win.
// =============================================================================

import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { createNotification } from './notification.service';
import { orderContactDefaults } from './bid.service';
import { createTransaction } from './transaction.service';

export const CONTRACT_RULES = {
  everyDays: [7, 14, 30] as const,
  /** No contract is split into more batches than a year of weekly ones. */
  maxBatches: 52,
  /** How far ahead the first batch may be set. */
  maxStartDays: 90,
};

const money = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Supply contracts are, for now, how an FMCG buyer buys. */
async function assertCanPropose(buyerId: string) {
  const profile = await prisma.buyerProfile.findUnique({ where: { userId: buyerId }, select: { companyType: true } });
  if (profile?.companyType !== 'FMCG') {
    throw new ApiError(403, 'Supply contracts are open to FMCG buyers for now.');
  }
}

export interface ProposeInput {
  listingId: string;
  totalQuantity: number;
  batchQuantity: number;
  everyDays: number;
  pricePerUnit: number;
  startsAt?: string | null;
  message?: string | null;
}

export async function proposeContract(buyerId: string, input: ProposeInput) {
  await assertCanPropose(buyerId);

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { farmer: { select: { userId: true, sellerType: true } } },
  });
  if (!listing || listing.status !== 'ACTIVE' || listing.isRequirementFill) {
    throw new ApiError(404, 'That lot is not on the market any more');
  }
  if (listing.farmer.userId === buyerId) throw new ApiError(400, 'You cannot contract with yourself');
  // A local shop sells to households by the kilo; it is not a contract supplier.
  if (listing.farmer.sellerType === 'LOCAL_SHOP') {
    throw new ApiError(400, 'This seller is a local shop and does not take supply contracts');
  }

  const total = Number(input.totalQuantity);
  const batch = Number(input.batchQuantity);
  const price = Number(input.pricePerUnit);
  if (!(total > 0)) throw new ApiError(400, 'Enter the total quantity');
  if (!(batch > 0) || batch > total) throw new ApiError(400, 'A batch is more than zero and no more than the total');
  if (Math.ceil(total / batch) > CONTRACT_RULES.maxBatches) {
    throw new ApiError(400, `That is more than ${CONTRACT_RULES.maxBatches} batches. Make each batch larger.`);
  }
  if (!(CONTRACT_RULES.everyDays as readonly number[]).includes(input.everyDays)) {
    throw new ApiError(400, 'Deliver every 7, 14 or 30 days');
  }
  if (!(price > 0)) throw new ApiError(400, 'Enter a price per unit');
  // The same floor a bid on this lot is held to.
  if (price < listing.pricePerUnitMin) {
    throw new ApiError(400, `The seller's floor is ${listing.pricePerUnitMin} per ${listing.unit.toLowerCase()}`);
  }

  const now = new Date();
  let startsAt = now;
  if (input.startsAt) {
    startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, 'Invalid start date');
    if (startsAt < addDays(now, -1)) throw new ApiError(400, 'The first batch cannot be in the past');
    if (startsAt > addDays(now, CONTRACT_RULES.maxStartDays)) {
      throw new ApiError(400, `Start within ${CONTRACT_RULES.maxStartDays} days`);
    }
    if (startsAt < now) startsAt = now;
  }

  const contact = await orderContactDefaults(buyerId, {});
  if (!contact.deliveryAddress || !contact.contactPhone) {
    throw new ApiError(400, 'Add a phone number and city to your profile so the seller can reach you.');
  }

  const contract = await prisma.supplyContract.create({
    data: {
      buyerId,
      farmerId: listing.farmer.userId,
      sourceListingId: listing.id,
      cropName: listing.cropName,
      cropVariety: listing.cropVariety,
      unit: listing.unit,
      qualityGrade: listing.qualityGrade,
      organic: listing.organic,
      pricePerUnit: money(price),
      currency: listing.currency,
      totalQuantity: total,
      batchQuantity: batch,
      everyDays: input.everyDays,
      startsAt,
      deliveryAddress: contact.deliveryAddress,
      contactPhone: contact.contactPhone,
      message: input.message?.trim().slice(0, 500) || null,
    },
  });

  const buyer = await prisma.buyerProfile.findUnique({ where: { userId: buyerId }, select: { companyName: true } });
  void createNotification({
    userId: contract.farmerId,
    type: 'SUPPLY_CONTRACT_PROPOSED',
    title: `Supply contract offered: ${contract.cropName}`,
    message: `${buyer?.companyName ?? 'A buyer'} wants ${total} ${contract.unit.toLowerCase()} at ${contract.currency} ${contract.pricePerUnit}, ${batch} every ${contract.everyDays} days.`,
    data: { supplyContractId: contract.id },
  }).catch(() => {});

  return contract;
}

/** The seller accepts or declines a proposal. */
export async function respondToContract(id: string, farmerUserId: string, accept: boolean) {
  const c = await prisma.supplyContract.findUnique({ where: { id } });
  if (!c) throw new ApiError(404, 'Contract not found');
  if (c.farmerId !== farmerUserId) throw new ApiError(403, 'Only the seller can answer this contract');
  if (c.status !== 'PROPOSED') throw new ApiError(400, 'This contract has already been answered');

  if (accept) {
    // A batch hangs off the seller's profile, so check it exists now rather
    // than at the first batch, where the failure would be nobody's to fix.
    const profile = await prisma.farmerProfile.findUnique({ where: { userId: farmerUserId }, select: { id: true } });
    if (!profile) throw new ApiError(400, 'Complete your seller profile before taking a contract');
  }

  const now = new Date();
  const { count } = await prisma.supplyContract.updateMany({
    where: { id, status: 'PROPOSED' },
    data: accept
      ? { status: 'ACTIVE', respondedAt: now, nextBatchAt: c.startsAt > now ? c.startsAt : now }
      : { status: 'DECLINED', respondedAt: now },
  });
  if (count === 0) throw new ApiError(409, 'This contract changed a moment ago. Reload to see it.');

  void createNotification({
    userId: c.buyerId,
    type: accept ? 'SUPPLY_CONTRACT_ACCEPTED' : 'SUPPLY_CONTRACT_DECLINED',
    title: accept ? `Supply contract accepted: ${c.cropName}` : `Supply contract declined: ${c.cropName}`,
    message: accept
      ? `The first batch of ${c.batchQuantity} ${c.unit.toLowerCase()} becomes a deal to pay ${c.startsAt > now ? 'on the start date' : 'now'}.`
      : 'The seller said no. You can bid on their lot, or propose different terms.',
    data: { supplyContractId: id },
  }).catch(() => {});

  // A contract starting now gets its first batch straight away rather than
  // at the next timer tick.
  if (accept) await createDueBatches(now, id).catch((err) => console.error('[contracts] first batch', id, err));

  return prisma.supplyContract.findUniqueOrThrow({ where: { id } });
}

/**
 * Either side calls it off. The buyer may withdraw a proposal; either may end
 * an active contract. Batches already turned into deals stay deals: they are
 * paid or payable, and undoing one is an admin refund like any other (§6).
 */
export async function cancelContract(id: string, userId: string) {
  const c = await prisma.supplyContract.findUnique({ where: { id } });
  if (!c) throw new ApiError(404, 'Contract not found');
  const side = c.buyerId === userId ? 'BUYER' : c.farmerId === userId ? 'SELLER' : null;
  if (!side) throw new ApiError(403, 'This is not your contract');
  if (c.status === 'PROPOSED' && side !== 'BUYER') throw new ApiError(400, 'Decline it instead');
  if (c.status !== 'PROPOSED' && c.status !== 'ACTIVE') throw new ApiError(400, 'This contract is already over');

  const { count } = await prisma.supplyContract.updateMany({
    where: { id, status: c.status },
    data: { status: 'CANCELLED', nextBatchAt: null, endedAt: new Date(), endedBy: side },
  });
  if (count === 0) throw new ApiError(409, 'This contract changed a moment ago. Reload to see it.');

  void createNotification({
    userId: side === 'BUYER' ? c.farmerId : c.buyerId,
    type: 'SUPPLY_CONTRACT_CANCELLED',
    title: `Supply contract ended: ${c.cropName}`,
    message: `The ${side === 'BUYER' ? 'buyer' : 'seller'} ended it. No more batches will be made; ones already made stay as deals.`,
    data: { supplyContractId: id },
  }).catch(() => {});

  return prisma.supplyContract.findUniqueOrThrow({ where: { id } });
}

/**
 * Turn every batch that has fallen due into a deal.
 *
 * Each is claimed by an updateMany on the nextBatchAt and scheduledQuantity
 * it was read with, inside the transaction that creates the deal, so two
 * processes cannot both make one batch, and a cancel that commits first makes
 * the claim miss. `onlyId` limits it to one contract (its first batch).
 */
export async function createDueBatches(now = new Date(), onlyId?: string): Promise<number> {
  const due = await prisma.supplyContract.findMany({
    where: { status: 'ACTIVE', nextBatchAt: { lte: now }, ...(onlyId ? { id: onlyId } : {}) },
    take: 100,
  });
  let made = 0;
  for (const c of due) {
    try {
      const batch = await prisma.$transaction(async (tx) => makeBatch(tx, c, now));
      if (!batch) continue;
      made += 1;
      const n = Math.round(batch.scheduledAfter / c.batchQuantity);
      void createNotification({
        userId: c.buyerId,
        type: 'SUPPLY_CONTRACT_BATCH',
        title: `${c.cropName} batch ${n} is ready to pay`,
        message: `${batch.quantity} ${c.unit.toLowerCase()} at the contract price. Pay it in Contracts and the seller sends it.`,
        data: { supplyContractId: c.id, transactionId: batch.transactionId },
      }).catch(() => {});
      void createNotification({
        userId: c.farmerId,
        type: 'SUPPLY_CONTRACT_BATCH',
        title: `${c.cropName} batch ${n} is due`,
        message: `${batch.quantity} ${c.unit.toLowerCase()} for the buyer. It moves once they pay; CropBid books the transport.`,
        data: { supplyContractId: c.id, transactionId: batch.transactionId },
      }).catch(() => {});
    } catch (err) {
      // One bad contract must not stop the rest; it stays due and is retried.
      console.error('[contracts] could not make batch', c.id, err);
    }
  }
  return made;
}

type ContractRow = Awaited<ReturnType<typeof prisma.supplyContract.findUniqueOrThrow>>;

async function makeBatch(tx: Prisma.TransactionClient, c: ContractRow, now: Date) {
  const quantity = Math.min(c.batchQuantity, Math.round((c.totalQuantity - c.scheduledQuantity) * 1000) / 1000);
  if (!(quantity > 0)) return null;
  const scheduledAfter = c.scheduledQuantity + quantity;
  const done = scheduledAfter >= c.totalQuantity - 1e-9;

  const claim = await tx.supplyContract.updateMany({
    where: { id: c.id, status: 'ACTIVE', nextBatchAt: c.nextBatchAt, scheduledQuantity: c.scheduledQuantity },
    data: {
      scheduledQuantity: scheduledAfter,
      nextBatchAt: done ? null : addDays(c.nextBatchAt ?? now, c.everyDays),
      ...(done ? { status: 'COMPLETED', endedAt: now } : {}),
    },
  });
  if (claim.count === 0) return null;

  const profile = await tx.farmerProfile.findUnique({
    where: { userId: c.farmerId },
    include: { user: { select: { location: true } } },
  });
  // Throwing rolls the claim back, so the batch stays due.
  if (!profile) throw new Error('seller has no profile');

  const totalAmount = money(c.pricePerUnit * quantity);
  const listing = await tx.listing.create({
    data: {
      farmerId: profile.id,
      cropName: c.cropName,
      cropVariety: c.cropVariety,
      quantity,
      remainingQuantity: 0, // born fully committed, never inventory
      unit: c.unit,
      qualityGrade: c.qualityGrade,
      pricePerUnitMin: c.pricePerUnit,
      pricePerUnitMax: c.pricePerUnit,
      currency: c.currency,
      directSaleEnabled: false,
      description: `Supply contract #${c.id.slice(-6).toUpperCase()}: ${c.cropName}, batch for ${c.deliveryAddress}.`,
      images: [],
      organic: c.organic,
      // ORIGIN, not destination: transport picks up from here.
      location: profile.user.location || profile.state,
      state: profile.state,
      country: profile.country,
      status: 'SOLD',
      isRequirementFill: true,
      supplyContractId: c.id,
    },
  });
  const bid = await tx.bid.create({
    data: {
      listingId: listing.id,
      buyerId: c.buyerId,
      bidPricePerUnit: c.pricePerUnit,
      quantity,
      totalAmount,
      currency: c.currency,
      message: c.message,
      deliveryAddress: c.deliveryAddress,
      contactPhone: c.contactPhone,
      isAgentBid: false,
      isDirectPurchase: false,
      status: 'ACCEPTED',
    },
  });
  const transaction = await createTransaction(bid.id, tx);
  return { quantity, scheduledAfter, transactionId: transaction.id };
}

/** The caller's contracts, either side, each with its batches' deal states. */
export async function getMyContracts(userId: string) {
  return prisma.supplyContract.findMany({
    where: { OR: [{ buyerId: userId }, { farmerId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      buyer: { select: { id: true, name: true, buyerProfile: { select: { companyName: true, companyType: true } } } },
      farmer: { select: { id: true, name: true, trustScore: true, farmerProfile: { select: { state: true, businessName: true } } } },
      batches: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          quantity: true,
          createdAt: true,
          transactions: { select: { id: true, totalAmount: true, paymentStatus: true, deliveryStatus: true } },
        },
      },
    },
  });
}
