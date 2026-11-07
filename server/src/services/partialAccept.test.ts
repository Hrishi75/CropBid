// =============================================================================
// Accepting a bid sells the bid's quantity, against a real Postgres
// =============================================================================
// What has to hold (lotStock.ts):
//   - accepting 10 of 100 leaves 90 on sale, and the lot stays ACTIVE
//   - an open bid that still fits stays open; one that no longer fits is
//     turned down
//   - accepting the last of the stock marks the lot SOLD
//   - two accepts racing can never sell more than the lot holds, and two
//     that fit together both go through
//   - a seller accepting a bid by hand while the agents negotiate the same
//     bid takes its stock once, not twice
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));
vi.mock('./orderAlert.service', () => ({ alertNewOrder: vi.fn(() => Promise.resolve()) }));

// The farmer's agent decides only when the test lets it, so a manual accept
// can land while the negotiation is in flight, every time.
let releaseAgent: () => void = () => {};
let agentAsked: () => void = () => {};
vi.mock('./aiAgent', () => ({
  checkAutoAccept: () => null,
  getAgentDecision: () =>
    new Promise((resolve) => {
      releaseAgent = () => resolve({ action: 'accept', price: 2400, reasoning: 'test' });
      agentAsked();
    }),
}));

import { prisma } from '../lib/prisma';
import { acceptBid } from './bid.service';
import { startNegotiation } from './negotiation.service';

const FARM = 'pa-farm';
const BUYERS = ['pa-buyer-1', 'pa-buyer-2', 'pa-buyer-3'];
const ALL = [FARM, ...BUYERS];
const PROFILE = `${FARM}-profile`;

let lotId = '';

async function clean() {
  const lots = await prisma.listing.findMany({ where: { farmerId: PROFILE }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.transaction.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.negotiation.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.agentConfig.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.bid.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

async function newLot(quantity = 100) {
  const lot = await prisma.listing.create({
    data: {
      farmerId: PROFILE, cropName: 'PA Wheat', quantity, remainingQuantity: quantity, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 2000, pricePerUnitMax: 2600, location: 'Wardha', state: 'Maharashtra',
    },
  });
  return lot.id;
}

function bid(buyerId: string, quantity: number, listingId = lotId) {
  return prisma.bid.create({
    data: { listingId, buyerId, bidPricePerUnit: 2400, quantity, totalAmount: 2400 * quantity },
  });
}

async function lotNow(id = lotId) {
  return prisma.listing.findUniqueOrThrow({ where: { id }, select: { status: true, remainingQuantity: true } });
}

async function statusOf(id: string) {
  return (await prisma.bid.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: FARM, name: 'Farmer', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000401', location: 'Wardha',
      farmerProfile: { create: { id: PROFILE, state: 'Maharashtra', status: 'APPROVED' } },
    },
  });
  for (const [i, id] of BUYERS.entries()) {
    await prisma.user.create({
      data: {
        id, name: `Buyer ${i + 1}`, email: `${id}@test.local`, password: 'x', role: 'BUYER', phone: `980000041${i}`,
        buyerProfile: { create: { companyName: `Mill ${i + 1}`, companyType: 'PROCESSOR', status: 'APPROVED' } },
      },
    });
  }
  lotId = await newLot();
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('accepting part of a lot', () => {
  it('sells the bid quantity and leaves the rest on sale', async () => {
    const small = await bid(BUYERS[0], 10);
    const fits = await bid(BUYERS[1], 50);
    const tooBig = await bid(BUYERS[2], 95);

    await acceptBid(small.id, FARM);

    expect(await lotNow()).toEqual({ status: 'ACTIVE', remainingQuantity: 90 });
    expect(await statusOf(small.id)).toBe('ACCEPTED');
    expect(await statusOf(fits.id)).toBe('PENDING');
    expect(await statusOf(tooBig.id)).toBe('REJECTED');

    const deal = await prisma.transaction.findFirstOrThrow({ where: { bidId: small.id } });
    expect(deal.totalAmount).toBe(2400 * 10);
  });

  it('marks the lot SOLD once the last of it is accepted, and turns down the rest', async () => {
    const first = await bid(BUYERS[0], 40);
    const last = await bid(BUYERS[1], 60);
    const late = await bid(BUYERS[2], 5);

    await acceptBid(first.id, FARM);
    expect(await statusOf(late.id)).toBe('PENDING');

    await acceptBid(last.id, FARM);
    expect(await lotNow()).toEqual({ status: 'SOLD', remainingQuantity: 0 });
    expect(await statusOf(late.id)).toBe('REJECTED');
  });

  it('refuses a bid for more than is left', async () => {
    const first = await bid(BUYERS[0], 70);
    const second = await bid(BUYERS[1], 30);
    await acceptBid(first.id, FARM);

    // Placed before the first accept, so it was not turned down; 30 is
    // exactly what is left and goes through.
    await acceptBid(second.id, FARM);
    expect(await lotNow()).toEqual({ status: 'SOLD', remainingQuantity: 0 });
  });

  // Household purchases take stock without touching any bid, so the claim's
  // own condition is what refuses here, not a bid turned down earlier.
  it('refuses a bid the stock left by other sales cannot fill', async () => {
    const big = await bid(BUYERS[0], 60);
    await prisma.listing.update({ where: { id: lotId }, data: { remainingQuantity: 30 } });

    await expect(acceptBid(big.id, FARM)).rejects.toMatchObject({ statusCode: 409 });
    expect(await lotNow()).toEqual({ status: 'ACTIVE', remainingQuantity: 30 });
    expect(await statusOf(big.id)).toBe('PENDING');
  });

  it('counts half a kilo of a quintal lot without leaving dust behind', async () => {
    const id = await newLot(0.03);
    const a = await bid(BUYERS[0], 0.01, id);
    const b = await bid(BUYERS[1], 0.02, id);

    await acceptBid(a.id, FARM);
    await acceptBid(b.id, FARM);
    expect(await lotNow(id)).toEqual({ status: 'SOLD', remainingQuantity: 0 });
  });
});

// Ten rounds each, because the first pair in a fresh process often serialises
// by accident while it opens connections (CLAUDE.md §9, the address book).
describe('two accepts at once', () => {
  it('never sells more than the lot holds', async () => {
    for (let round = 0; round < 10; round++) {
      const id = await newLot(100);
      const a = await bid(BUYERS[0], 60, id);
      const b = await bid(BUYERS[1], 60, id);

      const results = await Promise.allSettled([acceptBid(a.id, FARM), acceptBid(b.id, FARM)]);
      const won = results.filter((r) => r.status === 'fulfilled').length;

      expect(won, `round ${round}`).toBe(1);
      expect(await lotNow(id), `round ${round}`).toEqual({ status: 'ACTIVE', remainingQuantity: 40 });
      expect(await prisma.transaction.count({ where: { listingId: id } }), `round ${round}`).toBe(1);
    }
  });

  it('lets two that fit together both go through', async () => {
    for (let round = 0; round < 10; round++) {
      const id = await newLot(100);
      const a = await bid(BUYERS[0], 50, id);
      const b = await bid(BUYERS[1], 50, id);

      const results = await Promise.allSettled([acceptBid(a.id, FARM), acceptBid(b.id, FARM)]);

      expect(results.map((r) => r.status), `round ${round}`).toEqual(['fulfilled', 'fulfilled']);
      expect(await lotNow(id), `round ${round}`).toEqual({ status: 'SOLD', remainingQuantity: 0 });
      expect(await prisma.transaction.count({ where: { listingId: id } }), `round ${round}`).toBe(2);
    }
  });
});

describe('a negotiation and a manual accept of the same bid', () => {
  async function agents() {
    await prisma.agentConfig.create({ data: { userId: FARM, agentType: 'FARMER_AGENT', minPrice: 2000 } });
    await prisma.agentConfig.create({ data: { userId: BUYERS[0], agentType: 'BUYER_AGENT', maxPrice: 2600 } });
  }

  it('takes the stock once when the seller accepts while the agents talk', async () => {
    await agents();
    const b = await bid(BUYERS[0], 10);

    const asked = new Promise<void>((r) => { agentAsked = r; });
    const negotiating = startNegotiation(b.id, BUYERS[0]);
    await asked;

    await acceptBid(b.id, FARM);
    releaseAgent();
    await negotiating;

    expect(await lotNow()).toEqual({ status: 'ACTIVE', remainingQuantity: 90 });
    expect(await statusOf(b.id)).toBe('ACCEPTED');
    expect(await prisma.transaction.count({ where: { listingId: lotId } })).toBe(1);
  });

  // Released together, ten rounds: one sale, one deduction, and the loser is
  // a 409, never another error. Both paths lock the lot before the bid
  // (negotiation.service says why); this test does not reliably hit the
  // deadlock the opposite order allowed, so that rests on the lock order.
  it('settles a manual accept racing the deal, taking the stock once', async () => {
    await agents();
    for (let round = 0; round < 10; round++) {
      const id = await newLot(100);
      const b = await bid(BUYERS[0], 10, id);

      const asked = new Promise<void>((r) => { agentAsked = r; });
      const negotiating = startNegotiation(b.id, BUYERS[0]);
      await asked;

      const [manual, deal] = await Promise.allSettled([
        acceptBid(b.id, FARM),
        (releaseAgent(), negotiating),
      ]);

      expect(deal.status, `round ${round}: ${deal.status === 'rejected' ? deal.reason : ''}`).toBe('fulfilled');
      if (manual.status === 'rejected') expect(manual.reason, `round ${round}`).toMatchObject({ statusCode: 409 });
      expect(await lotNow(id), `round ${round}`).toEqual({ status: 'ACTIVE', remainingQuantity: 90 });
      expect(await prisma.transaction.count({ where: { listingId: id } }), `round ${round}`).toBe(1);
    }
  });

  it('leaves the bid unaccepted when the stock went while the agents talked', async () => {
    await agents();
    const b = await bid(BUYERS[0], 60);

    const asked = new Promise<void>((r) => { agentAsked = r; });
    const negotiating = startNegotiation(b.id, BUYERS[0]);
    await asked;

    await prisma.listing.update({ where: { id: lotId }, data: { remainingQuantity: 30 } });
    releaseAgent();
    await negotiating;

    expect(await lotNow()).toEqual({ status: 'ACTIVE', remainingQuantity: 30 });
    expect(await statusOf(b.id)).toBe('REJECTED');
    expect(await prisma.transaction.count({ where: { listingId: lotId } })).toBe(0);
  });
});
