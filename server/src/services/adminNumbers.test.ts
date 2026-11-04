// =============================================================================
// The admin headline numbers are counted, against a real Postgres
// =============================================================================
// They used to be typed in or worked out from the page on screen. Other test
// files share this database, so every check here is a difference: counted
// before this file's rows are added, then after.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { prisma } from '../lib/prisma';
import { getTransactionSummary, getUserSummary } from './admin.service';
import { getAdminFunnel, getNegotiationStats } from './analytics.service';

const SELLER = 'an-seller';
const BUYER = 'an-buyer';
const SHOPPER = 'an-shopper';
const OPS = 'an-ops';
const ALL = [SELLER, BUYER, SHOPPER, OPS];
const PROFILE = `${SELLER}-profile`;

async function clean() {
  await prisma.negotiation.deleteMany({ where: { listing: { farmerId: PROFILE } } });
  await prisma.agentConfig.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.transaction.deleteMany({ where: { farmerId: { in: ALL } } });
  await prisma.retailOrder.deleteMany({ where: { buyerId: { in: ALL } } });
  await prisma.bid.deleteMany({ where: { listing: { farmerId: PROFILE } } });
  await prisma.listing.deleteMany({ where: { farmerId: PROFILE } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

let lotId = '';

async function seed() {
  await prisma.user.create({
    data: {
      id: SELLER, name: 'AN Seller', email: `${SELLER}@test.local`, password: 'x', role: 'FARMER',
      farmerProfile: { create: { id: PROFILE, state: 'Maharashtra', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({
    data: {
      id: BUYER, name: 'AN Buyer', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER',
      buyerProfile: { create: { companyName: 'AN Foods', companyType: 'PROCESSOR', status: 'SUBMITTED' } },
    },
  });
  await prisma.user.create({ data: { id: SHOPPER, name: 'AN Shopper', email: `${SHOPPER}@test.local`, password: 'x', role: 'CONSUMER' } });
  await prisma.user.create({ data: { id: OPS, name: 'AN Ops', email: `${OPS}@test.local`, password: 'x', role: 'ADMIN' } });
  const lot = await prisma.listing.create({
    data: {
      farmerId: PROFILE, cropName: 'AN Gram', quantity: 10, remainingQuantity: 10, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 5000, pricePerUnitMax: 6000, location: 'Wardha', state: 'Maharashtra',
    },
  });
  lotId = lot.id;
}

type Pay = 'ESCROW' | 'RELEASED' | 'REFUNDED' | 'CANCELLED' | 'AWAITING_PAYMENT';

async function deal(buyerId: string, paymentStatus: Pay, retailOrderId?: string) {
  const bid = await prisma.bid.create({
    data: { listingId: lotId, buyerId, bidPricePerUnit: 5000, quantity: 1, totalAmount: 5000, status: 'ACCEPTED' },
  });
  return prisma.transaction.create({
    data: {
      listingId: lotId, bidId: bid.id, farmerId: SELLER, buyerId,
      finalPricePerUnit: 5000, totalAmount: 5000, platformFeeAmount: 100, paymentStatus, retailOrderId,
    },
  });
}

beforeEach(clean);

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('the users summary', () => {
  it('counts every account by role, and the week\'s signups', async () => {
    const before = await getUserSummary();
    await seed();
    await prisma.user.update({ where: { id: OPS }, data: { createdAt: new Date(Date.now() - 30 * 86400_000) } });
    const after = await getUserSummary();

    expect(after.byRole.FARMER - before.byRole.FARMER).toBe(1);
    expect(after.byRole.BUYER - before.byRole.BUYER).toBe(1);
    expect(after.byRole.CONSUMER - before.byRole.CONSUMER).toBe(1);
    expect(after.byRole.ADMIN - before.byRole.ADMIN).toBe(1);
    expect(after.newLast7Days - before.newLast7Days).toBe(3);
  });
});

describe('the transactions summary', () => {
  it('counts every deal by status, fees on released ones only, at the 2% rate', async () => {
    const before = await getTransactionSummary();
    await seed();
    await deal(BUYER, 'RELEASED');
    await deal(BUYER, 'RELEASED');
    await deal(BUYER, 'ESCROW');
    await deal(BUYER, 'REFUNDED');
    const after = await getTransactionSummary();

    expect(after.byStatus.RELEASED - before.byStatus.RELEASED).toBe(2);
    expect(after.byStatus.ESCROW - before.byStatus.ESCROW).toBe(1);
    expect(after.byStatus.REFUNDED - before.byStatus.REFUNDED).toBe(1);
    expect(after.total - before.total).toBe(4);
    expect(after.feesOnReleased - before.feesOnReleased).toBe(200);
    expect(after.feePercent).toBe(2);
  });
});

describe('the funnel', () => {
  it('counts applicants, approvals and paid deals, a basket as one deal, and no admins', async () => {
    const before = await getAdminFunnel();
    await seed();
    // The buyer: two paid deals, so a repeat. A refunded or unpaid deal is not one.
    await deal(BUYER, 'RELEASED');
    await deal(BUYER, 'ESCROW');
    await deal(BUYER, 'REFUNDED');
    // The shopper: three lots in one shop order is one deal, not a repeat.
    const order = await prisma.retailOrder.create({
      data: { buyerId: SHOPPER, sellerId: SELLER, itemsTotal: 15000, deliveryFee: 0, totalAmount: 15000 },
    });
    for (let i = 0; i < 3; i++) await deal(SHOPPER, 'ESCROW', order.id);
    // The admin's deal does not count them in.
    await deal(OPS, 'RELEASED');
    const after = await getAdminFunnel();

    expect(after.signedUp - before.signedUp).toBe(3);
    expect(after.applied - before.applied).toBe(2);
    expect(after.approved - before.approved).toBe(1);
    expect(after.dealt - before.dealt).toBe(3); // seller, buyer, shopper
    expect(after.repeat - before.repeat).toBe(2); // seller (3 deals) and buyer (2)
  });
});

describe('agent negotiations', () => {
  it('counts outcomes and reads rounds and time from the rows', async () => {
    const before = await getNegotiationStats();
    await seed();
    const farmerAgent = await prisma.agentConfig.create({ data: { userId: SELLER, agentType: 'FARMER_AGENT' } });
    const buyerAgent = await prisma.agentConfig.create({ data: { userId: BUYER, agentType: 'BUYER_AGENT' } });
    const started = new Date(Date.now() - 120_000);
    const outcomes = [
      { finalOutcome: 'DEAL' as const, rounds: [{}, {}, {}], endedAt: new Date(started.getTime() + 60_000) },
      { finalOutcome: 'NO_DEAL' as const, rounds: [{}], endedAt: new Date() },
      { finalOutcome: 'IN_PROGRESS' as const, rounds: [{}, {}], endedAt: null },
    ];
    for (const o of outcomes) {
      const bid = await prisma.bid.create({
        data: { listingId: lotId, buyerId: BUYER, bidPricePerUnit: 5000, quantity: 1, totalAmount: 5000 },
      });
      await prisma.negotiation.create({
        data: { listingId: lotId, bidId: bid.id, farmerAgentId: farmerAgent.id, buyerAgentId: buyerAgent.id, startedAt: started, ...o },
      });
    }
    const after = await getNegotiationStats();

    expect(after.total - before.total).toBe(3);
    expect(after.deals - before.deals).toBe(1);
    expect(after.noDeals - before.noDeals).toBe(1);
    expect(after.inProgress - before.inProgress).toBe(1);
    if (before.total === 0) {
      expect(after.avgRounds).toBe(2); // (3 + 1) / 2, the open one left out
      expect(after.avgSecondsToDeal).toBeCloseTo(60, 0);
    } else {
      expect(after.avgRounds).not.toBeNull();
      expect(after.avgSecondsToDeal).not.toBeNull();
    }
  });
});
