// =============================================================================
// Restaurant requests: negotiate-only, counter offers and repeat orders,
// against a real Postgres
// =============================================================================
// What has to hold:
//   - a restaurant's request cannot be filled at its posted price
//   - an offer can go back and forth, and the deal is made at the last agreed
//     price, through the same path as an ordinary accept
//   - a countered offer is live: closing the request retires it
//   - a restaurant cannot bid on a listing
//   - a repeating request reposts once, however many processes try, and the
//     copy carries the series while the old one is closed
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({
  createNotification: vi.fn(() => Promise.resolve({})),
  pushNotification: vi.fn(),
}));
vi.mock('./orderAlert.service', () => ({ alertNewOrder: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import {
  acceptCounter, acceptOffer, acceptRequirementNow, closeRequirement, counterOffer,
  createOffer, createRequirement, repostDueRequirements, reviseOffer, setRepeat,
} from './requirement.service';
import { placeBid } from './bid.service';

const REST = 'neg-restaurant';
const PROC = 'neg-processor';
const FARM = 'neg-farmer';
const ALL = [REST, PROC, FARM];
const CROP = 'Neg Test Onion';

const base = {
  cropName: CROP, quantity: 40, unit: 'QUINTAL' as const, qualityGrade: 'A' as const,
  pricePerUnit: 2000, deliveryLocation: 'Bangalore', deliveryState: 'Karnataka',
};

async function clean() {
  const reqs = await prisma.buyerRequirement.findMany({ where: { buyerId: { in: ALL } }, select: { id: true } });
  const offers = await prisma.requirementOffer.findMany({ where: { requirementId: { in: reqs.map((r) => r.id) } }, select: { bidId: true, listingId: true } });
  const bidIds = offers.map((o) => o.bidId).filter(Boolean) as string[];
  const allBids = await prisma.bid.findMany({ where: { OR: [{ id: { in: bidIds } }, { buyerId: { in: ALL } }] }, select: { id: true } });
  await prisma.transaction.deleteMany({ where: { bidId: { in: allBids.map((b) => b.id) } } });
  await prisma.requirementOffer.deleteMany({ where: { requirementId: { in: reqs.map((r) => r.id) } } });
  await prisma.bid.deleteMany({ where: { id: { in: allBids.map((b) => b.id) } } });
  await prisma.buyerRequirement.deleteMany({ where: { buyerId: { in: ALL } } });
  await prisma.listing.deleteMany({ where: { farmerId: `${FARM}-profile` } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: REST, name: 'Kapoor Kitchens', email: `${REST}@test.local`, password: 'x', role: 'BUYER', phone: '9800000101',
      buyerProfile: { create: { companyName: 'Kapoor Kitchens', companyType: 'RESTAURANT', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({
    data: {
      id: PROC, name: 'Agro Proc', email: `${PROC}@test.local`, password: 'x', role: 'BUYER', phone: '9800000102',
      buyerProfile: { create: { companyName: 'Agro Proc', companyType: 'PROCESSOR', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({
    data: {
      id: FARM, name: 'Ravi', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000103', location: 'Kolar',
      farmerProfile: { create: { id: `${FARM}-profile`, state: 'Karnataka', status: 'APPROVED' } },
    },
  });
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('a restaurant request', () => {
  it('is negotiate-only and cannot be filled at the posted price', async () => {
    const r = await createRequirement(REST, base);
    expect(r.negotiateOnly).toBe(true);
    await expect(acceptRequirementNow(r.id, FARM, { quantity: 10 })).rejects.toThrow(/negotiates/);
    expect((await prisma.buyerRequirement.findUniqueOrThrow({ where: { id: r.id } })).remainingQuantity).toBe(40);
  });

  it('is not negotiate-only for a processor', async () => {
    const r = await createRequirement(PROC, base);
    expect(r.negotiateOnly).toBe(false);
  });
});

describe('countering an offer', () => {
  it('goes back and forth, and the deal is made at the last agreed price', async () => {
    const r = await createRequirement(REST, base);
    const o = await createOffer(r.id, FARM, { quantity: 20, pricePerUnit: 2400 });

    const c1 = await counterOffer(o.id, REST, 2100);
    expect(c1.status).toBe('COUNTERED');
    expect(c1.buyerCounterPrice).toBe(2100);

    // The buyer cannot accept while it is the seller's move.
    await expect(acceptOffer(o.id, REST)).rejects.toThrow();

    const v = await reviseOffer(o.id, FARM, 2250);
    expect(v.status).toBe('PENDING');
    expect(v.pricePerUnit).toBe(2250);
    expect(v.buyerCounterPrice).toBeNull();

    await counterOffer(o.id, REST, 2200);
    const deal = await acceptCounter(o.id, FARM);
    expect(deal.offer.status).toBe('ACCEPTED');
    expect(deal.offer.pricePerUnit).toBe(2200);
    expect(deal.transaction.finalPricePerUnit).toBe(2200);
    expect(deal.transaction.totalAmount).toBe(44000);
    expect((await prisma.buyerRequirement.findUniqueOrThrow({ where: { id: r.id } })).remainingQuantity).toBe(20);
  });

  it('refuses a counter at or above the seller price, and a revise outside the gap', async () => {
    const r = await createRequirement(REST, base);
    const o = await createOffer(r.id, FARM, { quantity: 20, pricePerUnit: 2400 });
    await expect(counterOffer(o.id, REST, 2400)).rejects.toThrow(/accept/);
    await counterOffer(o.id, REST, 2100);
    await expect(reviseOffer(o.id, FARM, 2100)).rejects.toThrow(/Accept their counter/);
    await expect(reviseOffer(o.id, FARM, 2500)).rejects.toThrow(/Come down/);
  });

  it('is only the seller who can accept a counter', async () => {
    const r = await createRequirement(REST, base);
    const o = await createOffer(r.id, FARM, { quantity: 20, pricePerUnit: 2400 });
    await counterOffer(o.id, REST, 2100);
    await expect(acceptCounter(o.id, PROC)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps a countered offer live: one per seller, and closing the request retires it', async () => {
    const r = await createRequirement(REST, base);
    const o = await createOffer(r.id, FARM, { quantity: 20, pricePerUnit: 2400 });
    await counterOffer(o.id, REST, 2100);
    await expect(createOffer(r.id, FARM, { quantity: 10, pricePerUnit: 2300 })).rejects.toThrow(/already have an offer/);
    await closeRequirement(r.id, REST);
    expect((await prisma.requirementOffer.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('EXPIRED');
  });

  it('lets exactly one of a seller revise and a seller accept win', async () => {
    for (let round = 0; round < 6; round++) {
      await prisma.requirementOffer.deleteMany({ where: { farmerId: FARM, status: { not: 'ACCEPTED' } } });
      const r = await createRequirement(REST, base);
      const o = await createOffer(r.id, FARM, { quantity: 10, pricePerUnit: 2400 });
      await counterOffer(o.id, REST, 2100);
      const results = await Promise.allSettled([acceptCounter(o.id, FARM), reviseOffer(o.id, FARM, 2300)]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const row = await prisma.requirementOffer.findUniqueOrThrow({ where: { id: o.id } });
      if (results[0].status === 'fulfilled') {
        expect(row.status).toBe('ACCEPTED');
        expect(row.pricePerUnit).toBe(2100);
      } else {
        expect(row.status).toBe('PENDING');
        expect(row.pricePerUnit).toBe(2300);
        expect(await prisma.transaction.count({ where: { bid: { buyerId: REST, quantity: 10 }, finalPricePerUnit: 2100 } })).toBe(0);
      }
    }
  });
});

describe('the market', () => {
  it('refuses a bid from a restaurant, and takes one from a processor', async () => {
    const lot = await prisma.listing.create({
      data: {
        farmerId: `${FARM}-profile`, cropName: CROP, quantity: 50, remainingQuantity: 50, qualityGrade: 'A',
        pricePerUnitMin: 1800, pricePerUnitMax: 2200, location: 'Kolar', state: 'Karnataka',
      },
    });
    const bid = { listingId: lot.id, bidPricePerUnit: 1900, quantity: 10, deliveryLocation: 'Bangalore', deliveryState: 'Karnataka', contactPhone: '9800000101' };
    await expect(placeBid(REST, bid as never)).rejects.toMatchObject({ statusCode: 403, code: 'RESTAURANT_NO_BIDS' });
    await expect(placeBid(PROC, bid as never)).resolves.toBeTruthy();
  });
});

describe('repeat orders', () => {
  it('reposts once when due, carries the series, and closes the old copy', async () => {
    const r = await createRequirement(REST, { ...base, repeatEveryDays: 7 });
    expect(r.repeatEveryDays).toBe(7);
    const o = await createOffer(r.id, FARM, { quantity: 10, pricePerUnit: 2300 });

    const later = new Date(Date.now() + 8 * 86_400_000);
    // Two processes at once: only one copy.
    const [a, b] = await Promise.all([repostDueRequirements(later), repostDueRequirements(later)]);
    expect(a + b).toBe(1);

    const series = await prisma.buyerRequirement.findMany({ where: { buyerId: REST }, orderBy: { createdAt: 'asc' } });
    expect(series).toHaveLength(2);
    const [old, copy] = series;
    expect(old.status).toBe('CLOSED');
    expect(old.nextRepeatAt).toBeNull();
    expect(copy.status).toBe('OPEN');
    expect(copy.seriesId).toBe(old.id);
    expect(copy.remainingQuantity).toBe(40);
    expect(copy.negotiateOnly).toBe(true);
    expect(copy.repeatEveryDays).toBe(7);
    expect(copy.nextRepeatAt!.getTime()).toBeGreaterThan(later.getTime());
    expect((await prisma.requirementOffer.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('EXPIRED');

    // Not due again yet.
    expect(await repostDueRequirements(later)).toBe(0);
  });

  it('stops when the buyer withdraws it, or stops it', async () => {
    const r = await createRequirement(REST, { ...base, repeatEveryDays: 3 });
    await closeRequirement(r.id, REST);
    expect(await repostDueRequirements(new Date(Date.now() + 4 * 86_400_000))).toBe(0);

    const s = await createRequirement(REST, { ...base, repeatEveryDays: 3 });
    await setRepeat(s.id, REST, null);
    expect(await repostDueRequirements(new Date(Date.now() + 4 * 86_400_000))).toBe(0);
  });

  it('never saves "stop" on a copy the repost job has just replaced, every round', async () => {
    // Review caught it: setRepeat read the request, the job reposted it, and
    // the unconditional write stopped the OLD copy while the new one carried
    // on repeating, with the buyer told it had saved.
    const later = new Date(Date.now() + 4 * 86_400_000);
    for (let round = 0; round < 10; round++) {
      await prisma.buyerRequirement.deleteMany({ where: { buyerId: REST } });
      const r = await createRequirement(REST, { ...base, repeatEveryDays: 3 });
      const [stop, reposted] = await Promise.allSettled([setRepeat(r.id, REST, null), repostDueRequirements(later)]);
      const copies = await prisma.buyerRequirement.findMany({ where: { buyerId: REST, seriesId: r.id } });
      if (stop.status === 'fulfilled') {
        // "Stopped" was saved, so nothing may still be repeating.
        expect(copies.filter((c) => c.repeatEveryDays != null)).toHaveLength(0);
      } else {
        expect(reposted.status === 'fulfilled' && reposted.value).toBe(1);
        // Refused either way: 409 if the job committed mid-write, 400 if the
        // request was already closed when it was read.
        expect([400, 409]).toContain(stop.reason.statusCode);
      }
    }
  });

  it('refuses an interval that is not offered', async () => {
    await expect(createRequirement(REST, { ...base, repeatEveryDays: 5 })).rejects.toThrow(/Repeat every/);
  });
});
