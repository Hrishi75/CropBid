// =============================================================================
// Admin flows that were broken, against a real Postgres
// =============================================================================
//   - the transport queue leaves out cancelled and refunded deals, and its
//     count is the whole queue, not the page
//   - a cancelled or refunded deal cannot be booked
//   - the users list can be filtered to shoppers
//   - each deal in the admin list says what the buyer paid, which is what a
//     refund owes them: goods plus their share of delivery
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));

import { prisma } from '../lib/prisma';
import { countAttentionItems, getAllTransactions, getAttentionItems, getUsers } from './admin.service';
import { bookShipment } from './logistics.service';

const BUYER = 'af-buyer';
const FARM = 'af-farm';
const SHOPPER = 'af-shopper';
const OPS = 'af-ops';
const ALL = [BUYER, FARM, SHOPPER, OPS];
const PROFILE = `${FARM}-profile`;
const ADMIN = { userId: OPS, role: 'ADMIN' };

let lotId = '';
let partnerId = '';

async function clean() {
  const lots = await prisma.listing.findMany({ where: { farmerId: PROFILE }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const txs = await prisma.transaction.findMany({ where: { listingId: { in: lotIds } }, select: { id: true } });
  await prisma.shipment.deleteMany({ where: { transactionId: { in: txs.map((t) => t.id) } } });
  await prisma.transaction.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.retailOrder.deleteMany({ where: { buyerId: { in: ALL } } });
  await prisma.bid.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.logisticsPartner.deleteMany({ where: { name: 'AF Test Carrier' } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({ data: { id: BUYER, name: 'AF Buyer', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER', phone: '9800000501' } });
  await prisma.user.create({ data: { id: SHOPPER, name: 'AF Shopper', email: `${SHOPPER}@test.local`, password: 'x', role: 'CONSUMER', phone: '9800000503' } });
  await prisma.user.create({ data: { id: OPS, name: 'AF Ops', email: `${OPS}@test.local`, password: 'x', role: 'ADMIN' } });
  await prisma.user.create({
    data: {
      id: FARM, name: 'AF Farmer', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000502',
      farmerProfile: { create: { id: PROFILE, state: 'Maharashtra', status: 'APPROVED' } },
    },
  });
  const lot = await prisma.listing.create({
    data: {
      farmerId: PROFILE, cropName: 'AF Gram', quantity: 10, remainingQuantity: 10, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 5000, pricePerUnitMax: 6000, location: 'Wardha', state: 'Maharashtra',
    },
  });
  lotId = lot.id;
  const partner = await prisma.logisticsPartner.create({
    data: {
      name: 'AF Test Carrier', type: 'TRUCKING', coverageRegions: ['Maharashtra'], coverageCountries: ['India'],
      vehicleTypes: ['10-ton truck'], minQuantityKg: 0, maxQuantityKg: 1_000_000, costPerKmPerKg: 0.01,
      avgDeliveryDays: 2, contactEmail: 'c@test.local', contactPhone: '1',
    },
  });
  partnerId = partner.id;
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

type Pay = 'ESCROW' | 'AWAITING_PAYMENT' | 'CANCELLED' | 'REFUNDED';

async function deal(paymentStatus: Pay, freight: { freightPaidBy?: 'FARMER' | 'SPLIT' | 'BUYER'; freightQuote?: number; retailOrderId?: string } = {}) {
  const bid = await prisma.bid.create({
    data: { listingId: lotId, buyerId: BUYER, bidPricePerUnit: 5500, quantity: 1, totalAmount: 5500, status: 'ACCEPTED' },
  });
  return prisma.transaction.create({
    data: {
      listingId: lotId, bidId: bid.id, farmerId: FARM, buyerId: BUYER,
      finalPricePerUnit: 5500, totalAmount: 5500, platformFeeAmount: 110, paymentStatus, ...freight,
    },
  });
}

const booking = (transactionId: string) => ({
  transactionId, logisticsPartnerId: partnerId, pickupLocation: 'Wardha', deliveryLocation: 'Nagpur',
  pickupDate: new Date().toISOString(), distanceKm: 80, totalWeightKg: 1_000, vehicleType: '10-ton truck',
});

describe('the transport queue', () => {
  it('leaves out cancelled and refunded deals, and counts the whole queue', async () => {
    const before = await countAttentionItems();
    const kept = await Promise.all([deal('ESCROW'), deal('AWAITING_PAYMENT')]);
    const dropped = await Promise.all([deal('CANCELLED'), deal('REFUNDED')]);

    const ids = new Set((await getAttentionItems(1000)).map((i) => i.transactionId));
    for (const t of kept) expect(ids.has(t.id)).toBe(true);
    for (const t of dropped) expect(ids.has(t.id)).toBe(false);
    expect(await countAttentionItems()).toBe(before + kept.length);
  });
});

describe('booking', () => {
  it('refuses a cancelled or refunded deal', async () => {
    for (const status of ['CANCELLED', 'REFUNDED'] as const) {
      const tx = await deal(status);
      await expect(bookShipment(booking(tx.id), ADMIN)).rejects.toMatchObject({ statusCode: 409, code: 'DEAL_CLOSED' });
      expect(await prisma.shipment.count({ where: { transactionId: tx.id } })).toBe(0);
    }
  });

  it('still books a paid deal', async () => {
    const tx = await deal('ESCROW');
    await bookShipment(booking(tx.id), ADMIN);
    expect(await prisma.shipment.count({ where: { transactionId: tx.id } })).toBe(1);
  });
});

describe('the users list', () => {
  it('filters to shoppers', async () => {
    const { users } = await getUsers('AF ', 'CONSUMER', 100, 0);
    expect(users.map((u) => u.id)).toEqual([SHOPPER]);
  });
});

describe('what a refund owes the buyer', () => {
  it('is the goods on a seller-pays deal, and goods plus their half on a split', async () => {
    const sellerPays = await deal('ESCROW');
    const split = await deal('ESCROW', { freightPaidBy: 'SPLIT', freightQuote: 1001 });
    const { transactions } = await getAllTransactions(undefined, 100, 0);
    const paid = new Map(transactions.map((t) => [t.id, t.buyerPaid]));
    expect(paid.get(sellerPays.id)).toBe(5500);
    expect(paid.get(split.id)).toBe(5500 + 500.5);
  });
});

describe("a shop order's delivery fee", () => {
  // Per order, not per lot, so each lot's row says how many of its order's
  // lots are refunded: the fee is owed back once, when all of them are.
  it("travels with each lot as the order's refund progress", async () => {
    const order = await prisma.retailOrder.create({
      data: { buyerId: SHOPPER, sellerId: FARM, itemsTotal: 11000, deliveryFee: 30, totalAmount: 11030 },
    });
    const first = await deal('REFUNDED', { retailOrderId: order.id });
    const second = await deal('ESCROW', { retailOrderId: order.id });

    const read = async () => {
      const { transactions } = await getAllTransactions(undefined, 100, 0);
      return new Map(transactions.map((t) => [t.id, t]));
    };

    let rows = await read();
    expect(rows.get(first.id)!.retailOrder).toEqual({ id: order.id, deliveryFee: 30, lots: 2, refundedLots: 1 });
    expect(rows.get(first.id)!.buyerPaid).toBe(5500);

    await prisma.transaction.update({ where: { id: second.id }, data: { paymentStatus: 'REFUNDED' } });
    rows = await read();
    expect(rows.get(second.id)!.retailOrder).toMatchObject({ lots: 2, refundedLots: 2 });
  });
});
