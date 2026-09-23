// =============================================================================
// Purging demo data takes the demo accounts, and only them
// =============================================================================
// It used to delete every transaction, shop order, payment, shipment, bid,
// listing and notification on the platform and keep the accounts, which under
// that name is a production wipe. Against a real Postgres, because what has to
// hold is which rows survive and which foreign keys the delete order respects:
//
//   1. A demo account and everything of its own goes.
//   2. A real account's lot, bid and deal survive it.
//   3. No admin goes, not only the one pressing the button: CropBid's own ops
//      account signs in on a demo email.
//   4. A real buyer's bid ON a demo lot goes with the lot: the lot cannot go
//      without it, and it is an offer on something that never existed.
//   5. Anything Razorpay has touched refuses the whole purge, and nothing is
//      deleted.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { previewDemoData, purgeDemoData } from './admin.service';

const ADMIN = 'purge-admin';
const DEMO_SELLER = 'purge-demo-seller';
const DEMO_BUYER = 'purge-demo-buyer';
const REAL_SELLER = 'purge-real-seller';
const REAL_BUYER = 'purge-real-buyer';
const EVERYONE = [ADMIN, DEMO_SELLER, DEMO_BUYER, REAL_SELLER, REAL_BUYER];

// The demo suffix is the rule under test, so the fixtures spell it out: the
// two "real" accounts are on another domain entirely.
const email = (id: string) => (id.includes('real') ? `${id}@test.local` : `${id}@cropbid.test`);

async function reset() {
  await prisma.transaction.deleteMany({ where: { id: { in: ['purge-tx-demo', 'purge-tx-real'] } } });
  await prisma.bid.deleteMany({ where: { id: { in: ['purge-bid-demo', 'purge-bid-real'] } } });
  await prisma.listing.deleteMany({ where: { id: { in: ['purge-lot-demo', 'purge-lot-real'] } } });
  await prisma.user.deleteMany({ where: { id: { in: EVERYONE } } });
}

async function seller(id: string) {
  await prisma.user.create({
    data: {
      id, name: id, email: email(id), password: 'x', role: 'FARMER',
      farmerProfile: { create: { id: `${id}-profile`, state: 'Maharashtra' } },
    },
  });
}

async function lot(id: string, sellerId: string) {
  await prisma.listing.create({
    data: {
      id, farmerId: `${sellerId}-profile`, cropName: 'Onion', quantity: 100, remainingQuantity: 100,
      qualityGrade: 'A', pricePerUnitMin: 18, pricePerUnitMax: 22, location: 'Pune', state: 'Maharashtra',
    },
  });
}

async function deal(suffix: string, listingId: string, sellerId: string, buyerId: string, razorpayPaymentId?: string) {
  await prisma.bid.create({
    data: { id: `purge-bid-${suffix}`, listingId, buyerId, bidPricePerUnit: 20, totalAmount: 2000, quantity: 100 },
  });
  await prisma.transaction.create({
    data: {
      id: `purge-tx-${suffix}`, listingId, bidId: `purge-bid-${suffix}`, farmerId: sellerId, buyerId,
      finalPricePerUnit: 20, totalAmount: 2000, platformFeeAmount: 40, razorpayPaymentId,
    },
  });
}

beforeEach(async () => {
  await reset();
  await prisma.user.create({ data: { id: ADMIN, name: 'Ops', email: email(ADMIN), password: 'x', role: 'ADMIN' } });
  await prisma.user.create({ data: { id: DEMO_BUYER, name: 'Demo buyer', email: email(DEMO_BUYER), password: 'x', role: 'BUYER' } });
  await prisma.user.create({ data: { id: REAL_BUYER, name: 'Real buyer', email: email(REAL_BUYER), password: 'x', role: 'BUYER' } });
  await seller(DEMO_SELLER);
  await seller(REAL_SELLER);
  await lot('purge-lot-demo', DEMO_SELLER);
  await lot('purge-lot-real', REAL_SELLER);
  // The demo lot's deal is with the REAL buyer, so the scoping is tested on a
  // row that a "delete everything of theirs" rule and a "delete everything"
  // rule would treat differently.
  await deal('demo', 'purge-lot-demo', DEMO_SELLER, REAL_BUYER);
  await deal('real', 'purge-lot-real', REAL_SELLER, REAL_BUYER);
});

afterAll(reset);

const survivors = async () => ({
  users: (await prisma.user.findMany({ where: { id: { in: EVERYONE } }, select: { id: true } })).map((u) => u.id).sort(),
  listings: (await prisma.listing.findMany({ where: { id: { in: ['purge-lot-demo', 'purge-lot-real'] } }, select: { id: true } })).map((l) => l.id),
  bids: (await prisma.bid.findMany({ where: { id: { in: ['purge-bid-demo', 'purge-bid-real'] } }, select: { id: true } })).map((b) => b.id),
  transactions: (await prisma.transaction.findMany({ where: { id: { in: ['purge-tx-demo', 'purge-tx-real'] } }, select: { id: true } })).map((t) => t.id),
});

describe('purging demo data', () => {
  it('leaves the real account, its lot and its deal alone', async () => {
    await purgeDemoData(ADMIN);

    const left = await survivors();
    expect(left.users).toEqual([ADMIN, REAL_BUYER, REAL_SELLER].sort());
    expect(left.listings).toEqual(['purge-lot-real']);
    expect(left.transactions).toEqual(['purge-tx-real']);
    // The real buyer's bid on the demo lot goes with the lot; their bid on the
    // real lot does not.
    expect(left.bids).toEqual(['purge-bid-real']);
  });

  // The one pressing the button is excluded by id, every other admin by role.
  it('leaves another admin on a demo email alone', async () => {
    const other = 'purge-other-admin';
    await prisma.user.create({
      data: { id: other, name: 'Other ops', email: `${other}@cropbid.test`, password: 'x', role: 'ADMIN' },
    });
    try {
      await purgeDemoData(ADMIN);
      expect(await prisma.user.count({ where: { id: other } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: other } });
    }
  });

  it('counts what it removed', async () => {
    const { deleted } = await purgeDemoData(ADMIN);

    expect(deleted.users).toBeGreaterThanOrEqual(2);
    expect(deleted.listings).toBeGreaterThanOrEqual(1);
    expect(deleted.transactions).toBeGreaterThanOrEqual(1);
  });

  it('takes an extra email that is not a demo one', async () => {
    await purgeDemoData(ADMIN, [email(REAL_BUYER)]);

    const left = await survivors();
    expect(left.users).not.toContain(REAL_BUYER);
    // Only what belongs to the named account goes. The real seller was not
    // named, so their lot stays.
    expect(left.listings).toEqual(['purge-lot-real']);
    expect(left.users).toContain(REAL_SELLER);
  });

  describe('when Razorpay has touched it', () => {
    beforeEach(async () => {
      await prisma.transaction.update({
        where: { id: 'purge-tx-demo' },
        data: { razorpayPaymentId: 'pay_purge_test_0001' },
      });
    });

    it('refuses, and deletes nothing at all', async () => {
      await expect(purgeDemoData(ADMIN)).rejects.toMatchObject({ statusCode: 409 });

      const left = await survivors();
      expect(left.users).toEqual(EVERYONE.slice().sort());
      expect(left.listings.sort()).toEqual(['purge-lot-demo', 'purge-lot-real']);
      expect(left.transactions.sort()).toEqual(['purge-tx-demo', 'purge-tx-real']);
    });

    it('says so in the preview, before anyone confirms', async () => {
      const preview = await previewDemoData(ADMIN);
      expect(preview.paid.transactions).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('the preview', () => {
  it('counts the same set the purge would take, and never the admin', async () => {
    const preview = await previewDemoData(ADMIN);
    expect(preview.accounts).not.toContain(email(ADMIN));
    expect(preview.accounts).toContain(email(DEMO_SELLER));
    expect(preview.paid).toEqual({ transactions: 0, retailPayments: 0, walletTopUps: 0 });

    const { deleted } = await purgeDemoData(ADMIN);
    expect(deleted.users).toBe(preview.counts.users);
    expect(deleted.listings).toBe(preview.counts.listings);
    expect(deleted.transactions).toBe(preview.counts.transactions);
    expect(deleted.bids).toBe(preview.counts.bids);
  });

  it('deletes nothing itself', async () => {
    await previewDemoData(ADMIN);
    const left = await survivors();
    expect(left.users).toEqual(EVERYONE.slice().sort());
  });
});
