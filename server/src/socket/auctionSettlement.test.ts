// =============================================================================
// Live auctions against a real Postgres: one lot, one sale
// =============================================================================
// What has to hold:
//   - a lot in a live auction cannot be sold by accepting an older bid, and the
//     auction cannot sell a lot that left it some other way: never two buyers
//     and two deals for one lot
//   - the winner buys what is left, not the quantity first listed
//   - starting an auction and accepting a bid at the same moment: one wins
//   - two settlements of the same auction make one sale
//   - lots left IN_AUCTION by a restart go back on the market, sellers told
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../services/notification.service', () => ({
  createNotification: vi.fn(() => Promise.resolve({})),
  pushNotification: vi.fn(),
}));
vi.mock('../services/orderAlert.service', () => ({ alertNewOrder: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { createNotification } from '../services/notification.service';
import { acceptBid } from '../services/bid.service';
import { updateListing } from '../services/listing.service';
import { createTransaction } from '../services/transaction.service';
import {
  settleAuctionSale, startAuction, releaseStrandedAuctions,
  auctionBidRefusal, auctionBidAmountRefusal, auctionMaxBid,
} from './index';

const BUYER = 'au-buyer';
const BIDDER = 'au-bidder';
const FARM = 'au-farm';
const ALL = [BUYER, BIDDER, FARM];
const PROFILE = `${FARM}-profile`;

async function clean() {
  const lots = await prisma.listing.findMany({ where: { farmerId: PROFILE }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.transaction.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.bid.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.buyerProfile.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  vi.mocked(createNotification).mockClear();
  await clean();
  for (const [id, phone] of [[BUYER, '9800000501'], [BIDDER, '9800000502']]) {
    await prisma.user.create({
      data: {
        id, name: id, email: `${id}@test.local`, password: 'x', role: 'BUYER', phone,
        buyerProfile: { create: { companyName: id, companyType: 'PROCESSOR', status: 'APPROVED' } },
      },
    });
  }
  await prisma.user.create({
    data: {
      id: FARM, name: 'Farmer', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000503',
      farmerProfile: { create: { id: PROFILE, state: 'Maharashtra', status: 'APPROVED' } },
    },
  });
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

async function lot(status: 'ACTIVE' | 'IN_AUCTION', quantity = 10, remaining = quantity) {
  return prisma.listing.create({
    data: {
      farmerId: PROFILE, cropName: 'AU Wheat', quantity, remainingQuantity: remaining, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 2000, pricePerUnitMax: 2500, location: 'Wardha', state: 'Maharashtra',
      status,
    },
  });
}

async function pendingBid(listingId: string, quantity = 10) {
  return prisma.bid.create({
    data: { listingId, buyerId: BIDDER, bidPricePerUnit: 2100, quantity, totalAmount: 2100 * quantity, status: 'PENDING' },
  });
}

async function salesOf(listingId: string) {
  return prisma.transaction.count({ where: { listingId } });
}

describe('a lot in a live auction', () => {
  it('cannot be sold by accepting an older pending bid', async () => {
    const l = await lot('ACTIVE');
    const bid = await pendingBid(l.id);
    await prisma.listing.update({ where: { id: l.id }, data: { status: 'IN_AUCTION' } });

    await expect(acceptBid(bid.id, FARM)).rejects.toMatchObject({ statusCode: 409, code: 'LOT_IN_AUCTION' });

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(after.status).toBe('IN_AUCTION');
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status).toBe('PENDING');
    expect(await salesOf(l.id)).toBe(0);
  });

  it('is not sold again by the auction once it has left it', async () => {
    const l = await lot('ACTIVE');
    const bid = await pendingBid(l.id);
    await acceptBid(bid.id, FARM); // sold to BIDDER, as it would have been mid-auction before
    expect(await salesOf(l.id)).toBe(1);

    const result = await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 3 });

    expect(result.outcome).toBe('gone');
    expect(await salesOf(l.id)).toBe(1);
    expect(await prisma.bid.count({ where: { listingId: l.id, buyerId: BUYER } })).toBe(0);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('SOLD');
  });
});

describe('settling an auction', () => {
  it('sells what is left to the winner, not the quantity first listed', async () => {
    const l = await lot('IN_AUCTION', 10, 6); // 4 quintals already bought by the kilo

    const result = await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 3 });

    expect(result.outcome).toBe('sold');
    const deal = await prisma.transaction.findFirstOrThrow({ where: { listingId: l.id }, include: { bid: true } });
    expect(deal.bid.quantity).toBe(6);
    expect(deal.totalAmount).toBe(2400 * 6);
    expect(deal.buyerId).toBe(BUYER);
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(after).toMatchObject({ status: 'SOLD', remainingQuantity: 0 });
  });

  it('sells no more than bidders were shown, leaving stock that came back on sale', async () => {
    const l = await lot('IN_AUCTION', 10, 8); // opened at 6; a cancelled shop order returned 2

    const result = await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 3, quantity: 6 });

    expect(result.outcome).toBe('sold');
    const deal = await prisma.transaction.findFirstOrThrow({ where: { listingId: l.id }, include: { bid: true } });
    expect(deal.bid.quantity).toBe(6);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ status: 'ACTIVE', remainingQuantity: 2 });
  });

  it('makes no deal when there is nothing to sell', async () => {
    const l = await lot('IN_AUCTION', 10, 2);
    const result = await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 1, quantity: 0 });
    expect(result.outcome).toBe('gone');
    expect(await salesOf(l.id)).toBe(0);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ status: 'ACTIVE', remainingQuantity: 2 });
  });

  it('voids the sale and puts the lot back when the winner is no longer a buyer', async () => {
    const l = await lot('IN_AUCTION');
    await prisma.user.update({ where: { id: BUYER }, data: { role: 'CONSUMER' } });

    expect((await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 1 })).outcome).toBe('voided');
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('ACTIVE');
    expect(await salesOf(l.id)).toBe(0);
  });

  // Ten rounds, asserting the outcome rather than a count: a single round in a
  // fresh process tends to serialise by accident.
  it('raced against itself, makes exactly one sale', async () => {
    for (let round = 0; round < 10; round++) {
      const l = await lot('IN_AUCTION');
      const results = await Promise.all([
        settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 2 }),
        settleAuctionSale({ listingId: l.id, winnerId: BIDDER, price: 2300, bidCount: 2 }),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual(['gone', 'sold']);
      expect(await salesOf(l.id)).toBe(1);
    }
  });
});

describe('starting an auction', () => {
  it('offers what is left of the lot, not the quantity first listed', async () => {
    const l = await lot('ACTIVE', 10, 6);
    const auction = await startAuction(l.id, 60);
    if (auction.timer) clearTimeout(auction.timer);
    expect(auction.quantity).toBe(6);
  });

  it('refuses a lot with no stock left', async () => {
    const l = await lot('ACTIVE', 10, 0);
    await expect(startAuction(l.id, 60)).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('ACTIVE');
  });

  it('leaves the lot alone when it cannot be claimed', async () => {
    const l = await lot('ACTIVE');
    await prisma.listing.update({ where: { id: l.id }, data: { status: 'SOLD' } });
    await expect(startAuction(l.id, 60)).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('SOLD');
  });

  it('raced against accepting a bid, only one of them gets the lot', async () => {
    for (let round = 0; round < 10; round++) {
      const l = await lot('ACTIVE');
      const bid = await pendingBid(l.id);
      const [started, accepted] = await Promise.allSettled([startAuction(l.id, 60), acceptBid(bid.id, FARM)]);

      const after = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
      if (started.status === 'fulfilled') {
        expect(accepted.status).toBe('rejected');
        expect(after.status).toBe('IN_AUCTION');
        expect(await salesOf(l.id)).toBe(0);
      } else {
        expect(accepted.status).toBe('fulfilled');
        expect(after.status).toBe('SOLD');
        expect(await salesOf(l.id)).toBe(1);
      }
    }
  });
});

describe('editing a lot in a live auction', () => {
  it('cannot change its quantity, unit or currency', async () => {
    const l = await lot('IN_AUCTION');
    for (const change of [{ quantity: 20 }, { unit: 'TONNE' }, { currency: 'USD' }]) {
      await expect(updateListing(l.id, FARM, change as any)).rejects.toMatchObject({ statusCode: 409, code: 'AUCTION_TERMS_LOCKED' });
    }
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ quantity: 10, unit: 'QUINTAL', currency: 'INR' });
  });
});

describe('editing a lot that already has deals', () => {
  it('cannot change its unit or currency, but can change its quantity', async () => {
    const l = await lot('ACTIVE', 10, 6);
    const bid = await pendingBid(l.id, 4);
    await prisma.bid.update({ where: { id: bid.id }, data: { status: 'ACCEPTED' } });
    await createTransaction(bid.id);
    expect(await salesOf(l.id)).toBe(1);
    for (const change of [{ unit: 'TONNE' }, { currency: 'USD' }]) {
      await expect(updateListing(l.id, FARM, change as any)).rejects.toMatchObject({ statusCode: 409, code: 'LOT_HAS_DEALS' });
    }
    await expect(updateListing(l.id, FARM, { quantity: 12 } as any)).resolves.toMatchObject({ quantity: 12, remainingQuantity: 8 });
  });
});

describe('after a restart', () => {
  it('puts lots stranded IN_AUCTION back on the market and tells their seller', async () => {
    const stranded = await lot('IN_AUCTION');
    const untouched = await lot('ACTIVE');

    expect(await releaseStrandedAuctions()).toBe(1);

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: stranded.id } })).status).toBe('ACTIVE');
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: untouched.id } })).status).toBe('ACTIVE');
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: FARM, type: 'AUCTION_INTERRUPTED', data: { listingId: stranded.id },
    }));
  });
});

// The socket is another way to buy, so it has the fence POST /bids has. The
// role alone stays BUYER when an admin suspends the approval, sends it back for
// more information, or suspends the account, so each of those must refuse.
describe('who may bid in a live auction', () => {
  it('lets an approved buyer bid', async () => {
    expect(await auctionBidRefusal(BUYER)).toBeNull();
  });

  it.each(['SUSPENDED', 'NEEDS_INFO', 'REJECTED'] as const)('refuses a buyer whose approval is %s', async (status) => {
    await prisma.buyerProfile.update({ where: { userId: BUYER }, data: { status } });
    expect(await auctionBidRefusal(BUYER)).toMatch(/not approved/);
  });

  it('refuses a suspended account, a restaurant and a non-buyer', async () => {
    await prisma.user.update({ where: { id: BUYER }, data: { suspended: true } });
    expect(await auctionBidRefusal(BUYER)).toMatch(/no longer authorized/);
    await prisma.buyerProfile.update({ where: { userId: BIDDER }, data: { companyType: 'RESTAURANT' } });
    expect(await auctionBidRefusal(BIDDER)).toMatch(/negotiat/i);
    expect(await auctionBidRefusal(FARM)).toMatch(/no longer authorized/);
    expect(await auctionBidRefusal('no-such-user')).toMatch(/no longer authorized/);
  });

  it.each([
    ['a suspended approval', () => prisma.buyerProfile.update({ where: { userId: BUYER }, data: { status: 'SUSPENDED' } })],
    ['a suspended account', () => prisma.user.update({ where: { id: BUYER }, data: { suspended: true } })],
  ])('voids the sale to a winner with %s, and puts the lot back on sale', async (_label, revoke) => {
    const l = await lot('IN_AUCTION');
    await revoke();
    const result = await settleAuctionSale({ listingId: l.id, winnerId: BUYER, price: 2400, bidCount: 2 });
    expect(result.outcome).toBe('voided');
    expect(await salesOf(l.id)).toBe(0);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('ACTIVE');
  });
});

describe('how far one bid may move the price', () => {
  const room = { startPrice: 2000, currentPrice: 2000 };

  it('takes an ordinary raise, up to double the current price', () => {
    expect(auctionBidAmountRefusal(room, 2000.5)).toBeNull();
    expect(auctionBidAmountRefusal(room, 4000)).toBeNull();
  });

  it('refuses a bid at or under the current price', () => {
    expect(auctionBidAmountRefusal(room, 2000)).toMatch(/higher than 2000/);
    expect(auctionBidAmountRefusal(room, 1500)).toMatch(/higher than/);
  });

  it('refuses an extra zero, and says how high is allowed', () => {
    expect(auctionBidAmountRefusal(room, 20000)).toMatch(/most you can bid now is 4000/);
    expect(auctionBidAmountRefusal(room, 4000.01)).toMatch(/too far/);
  });

  it('never goes past five times the starting price, however it is walked up', () => {
    const late = { startPrice: 2000, currentPrice: 8000 };
    expect(auctionBidAmountRefusal(late, 10000)).toBeNull();
    expect(auctionBidAmountRefusal(late, 10000.01)).toMatch(/most you can bid now is 10000/);
  });

  // The room is sent maxBid and caps its suggestions with it, so it must be
  // exactly the line the refusal draws.
  it('tells the room the most it may bid, and says so once the top is reached', () => {
    const near = { startPrice: 2000, currentPrice: 9800 };
    expect(auctionMaxBid(near)).toBe(10000);
    expect(auctionBidAmountRefusal(near, auctionMaxBid(near))).toBeNull();
    expect(auctionBidAmountRefusal(near, 10290)).toMatch(/most you can bid now is 10000/);
    expect(auctionMaxBid({ startPrice: 2000, currentPrice: 2000 })).toBe(4000);
    expect(auctionMaxBid({ startPrice: 33.33, currentPrice: 33.33 })).toBe(66.66);
    const top = { startPrice: 2000, currentPrice: 10000 };
    expect(auctionMaxBid(top)).toBe(10000);
    expect(auctionBidAmountRefusal(top, 10000.5)).toMatch(/reached the highest price/);
  });

  it('refuses a fraction of a paisa, and nonsense', () => {
    expect(auctionBidAmountRefusal(room, 2100.005)).toMatch(/two decimal places/);
    expect(auctionBidAmountRefusal(room, 2100.1)).toBeNull();
    expect(auctionBidAmountRefusal(room, 0.1 + 2100.2)).toBeNull();
    for (const bad of [NaN, Infinity, -5, 0]) expect(auctionBidAmountRefusal(room, bad)).toBe('Enter a valid bid');
  });
});
