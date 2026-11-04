// =============================================================================
// The admin headline numbers are counted, against a real Postgres
// =============================================================================
// They used to be typed in or worked out from the page on screen. Other test
// files share this database, so every check here is a difference: counted
// before this file's rows are added, then after.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { prisma } from '../lib/prisma';
import { getPlatformStats, getTransactionSummary, getUserSummary } from './admin.service';
import { aggregateByMonth, getAdminAnalytics, getAdminFunnel, getNegotiationStats } from './analytics.service';

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

async function deal(buyerId: string, paymentStatus: Pay, retailOrderId?: string, currency: 'INR' | 'USD' = 'INR') {
  const bid = await prisma.bid.create({
    data: { listingId: lotId, buyerId, bidPricePerUnit: 5000, quantity: 1, totalAmount: 5000, status: 'ACCEPTED' },
  });
  return prisma.transaction.create({
    data: {
      listingId: lotId, bidId: bid.id, farmerId: SELLER, buyerId,
      finalPricePerUnit: 5000, totalAmount: 5000, platformFeeAmount: 100, paymentStatus, retailOrderId, currency,
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
    // How many rows each average was already taken over, by the same rules,
    // so the new averages can be checked exactly whatever else is in the table.
    const [base] = await prisma.$queryRaw<{ finished: bigint; timed: bigint }[]>`
      SELECT
        count(*) FILTER (WHERE "finalOutcome" <> 'IN_PROGRESS' AND jsonb_typeof(rounds) = 'array') AS finished,
        count(*) FILTER (WHERE "finalOutcome" = 'DEAL' AND "endedAt" IS NOT NULL) AS timed
      FROM "Negotiation"`;
    const finished = Number(base.finished);
    const timed = Number(base.timed);
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
    // Rounds: 3 and 1 added, the open one left out. Time: one 60-second deal.
    const expectedRounds = ((before.avgRounds ?? 0) * finished + 3 + 1) / (finished + 2);
    const expectedSeconds = ((before.avgSecondsToDeal ?? 0) * timed + 60) / (timed + 1);
    expect(after.avgRounds).toBeCloseTo(expectedRounds, 6);
    expect(after.avgSecondsToDeal).toBeCloseTo(expectedSeconds, 1);
  });
});

describe('GMV', () => {
  // Money that reached us and stayed, in rupees. Not an unpaid, cancelled or
  // refunded deal, and not a USD seed lot added in as if it were rupees.
  it('counts paid rupee deals only, on the dashboard and in analytics', async () => {
    const sum = (rows: { value: number }[]) => rows.reduce((s, m) => s + m.value, 0);
    const stats0 = await getPlatformStats();
    const charts0 = (await getAdminAnalytics()).charts;
    await seed();
    await deal(BUYER, 'ESCROW');
    await deal(BUYER, 'RELEASED');
    for (const status of ['AWAITING_PAYMENT', 'CANCELLED', 'REFUNDED'] as const) await deal(BUYER, status);
    await deal(BUYER, 'RELEASED', undefined, 'USD');
    const stats1 = await getPlatformStats();
    const charts1 = (await getAdminAnalytics()).charts;

    expect(stats1.financial.gmv - stats0.financial.gmv).toBe(10_000);
    expect(sum(charts1.monthlyGMV) - sum(charts0.monthlyGMV)).toBe(10_000);
    // Fees: the one released rupee deal.
    expect(stats1.financial.platformRevenue - stats0.financial.platformRevenue).toBe(100);
    expect(sum(charts1.monthlyRevenue) - sum(charts0.monthlyRevenue)).toBe(100);
    expect((await getTransactionSummary()).feesOnReleased).toBe(stats1.financial.platformRevenue);
  });
});

describe('the monthly charts', () => {
  it('keep date order when a month is older than the six always shown', () => {
    const now = new Date(2026, 10, 4);
    const rows = [
      { createdAt: new Date(2026, 9, 2), n: 1 },
      { createdAt: new Date(2025, 11, 20), n: 5 },
      { createdAt: new Date(2026, 0, 10), n: 2 },
    ];
    const months = aggregateByMonth(rows, (r) => r.n, now);
    expect(months.map((m) => m.name)).toEqual(['Dec 25', 'Jan 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26', 'Nov 26']);
    expect(months.map((m) => m.value)).toEqual([5, 2, 0, 0, 0, 0, 1, 0]);
  });
});
