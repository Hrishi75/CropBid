// =============================================================================
// Refund, release and delivery moves, against a real Postgres
// =============================================================================
// What has to hold:
//   - a refund and the buyer's confirmation cannot both win: the deal ends
//     either REFUNDED or RELEASED, never one written over the other, and the
//     trust bump comes only with a release
//   - two confirmations arriving together move the deal once
//   - a cancelled or refunded deal's delivery cannot move, and an unpaid one
//     cannot be confirmed
//   - the admin listing feed carries the seller's name and score, and none of
//     the profile's compliance or payout columns
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));
vi.mock('./notification.helpers', () => ({
  notifyDeliveryUpdate: vi.fn(() => Promise.resolve()),
  notifyPaymentReleased: vi.fn(() => Promise.resolve()),
}));

import { prisma } from '../lib/prisma';
import { refundTransaction, releasePayment, updateDeliveryStatus } from './transaction.service';
import { getAllListings } from './admin.service';

const BUYER = 'rr-buyer';
const FARM = 'rr-farm';
const ALL = [BUYER, FARM];
const PROFILE = `${FARM}-profile`;
const START_TRUST = 50;

let lotId = '';

async function clean() {
  const lots = await prisma.listing.findMany({ where: { farmerId: PROFILE }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.transaction.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.bid.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({
    data: { id: BUYER, name: 'Buyer', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER', phone: '9800000401', trustScore: START_TRUST },
  });
  await prisma.user.create({
    data: {
      id: FARM, name: 'Farmer', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000402', trustScore: START_TRUST,
      farmerProfile: {
        create: {
          id: PROFILE, state: 'Maharashtra', status: 'APPROVED',
          pan: 'ABCDE1234F', farmerId: '12345678901', payoutAccountNumber: '123456789012',
          payoutAccountName: 'Farmer', payoutIfsc: 'SBIN0000001', payoutUpiId: 'farmer@upi',
        },
      },
    },
  });
  const lot = await prisma.listing.create({
    data: {
      farmerId: PROFILE, cropName: 'RR Wheat', quantity: 10, remainingQuantity: 10, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 2000, pricePerUnitMax: 2500, location: 'Wardha', state: 'Maharashtra',
    },
  });
  lotId = lot.id;
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

async function deal(paymentStatus: 'ESCROW' | 'AWAITING_PAYMENT' | 'CANCELLED' | 'REFUNDED', deliveryStatus: 'PENDING' | 'DELIVERED') {
  const bid = await prisma.bid.create({
    data: { listingId: lotId, buyerId: BUYER, bidPricePerUnit: 2200, quantity: 1, totalAmount: 2200, status: 'ACCEPTED' },
  });
  return prisma.transaction.create({
    data: {
      listingId: lotId, bidId: bid.id, farmerId: FARM, buyerId: BUYER,
      finalPricePerUnit: 2200, totalAmount: 2200, platformFeeAmount: 44,
      paymentStatus, deliveryStatus,
    },
  });
}

async function state(id: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id }, select: { paymentStatus: true, deliveryStatus: true } });
  const farmer = await prisma.user.findUniqueOrThrow({ where: { id: FARM }, select: { trustScore: true } });
  return { ...tx, farmerTrust: farmer.trustScore };
}

describe('refund against release', () => {
  it('a release after a refund does nothing', async () => {
    const tx = await deal('ESCROW', 'DELIVERED');
    await refundTransaction(tx.id);
    expect(await releasePayment(tx.id)).toBe(false);
    expect(await state(tx.id)).toMatchObject({ paymentStatus: 'REFUNDED', farmerTrust: START_TRUST });
  });

  it('a refund after a release is refused', async () => {
    const tx = await deal('ESCROW', 'DELIVERED');
    expect(await releasePayment(tx.id)).toBe(true);
    await expect(refundTransaction(tx.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(await state(tx.id)).toMatchObject({ paymentStatus: 'RELEASED', farmerTrust: START_TRUST + 2 });
  });

  // Ten rounds, asserting who won rather than how many: a single round in a
  // fresh process tends to serialise by accident.
  it('raced, exactly one wins and the deal says which', async () => {
    for (let round = 0; round < 10; round++) {
      await prisma.user.update({ where: { id: FARM }, data: { trustScore: START_TRUST } });
      const tx = await deal('ESCROW', 'DELIVERED');
      const [refund, release] = await Promise.allSettled([refundTransaction(tx.id), releasePayment(tx.id)]);
      const refunded = refund.status === 'fulfilled';
      const released = release.status === 'fulfilled' && release.value === true;
      expect(refunded !== released).toBe(true);
      expect(await state(tx.id)).toMatchObject(
        refunded
          ? { paymentStatus: 'REFUNDED', farmerTrust: START_TRUST }
          : { paymentStatus: 'RELEASED', farmerTrust: START_TRUST + 2 },
      );
    }
  });
});

describe('delivery moves', () => {
  it('two confirmations together move the deal once and bump trust once', async () => {
    for (let round = 0; round < 10; round++) {
      await prisma.user.update({ where: { id: FARM }, data: { trustScore: START_TRUST } });
      const tx = await deal('ESCROW', 'DELIVERED');
      const results = await Promise.allSettled([
        updateDeliveryStatus(tx.id, BUYER, 'CONFIRMED'),
        updateDeliveryStatus(tx.id, BUYER, 'CONFIRMED'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await state(tx.id)).toMatchObject({ paymentStatus: 'RELEASED', deliveryStatus: 'CONFIRMED', farmerTrust: START_TRUST + 2 });
    }
  });

  it('refuses to move a cancelled or refunded deal', async () => {
    for (const status of ['CANCELLED', 'REFUNDED'] as const) {
      const tx = await deal(status, 'PENDING');
      await expect(updateDeliveryStatus(tx.id, FARM, 'IN_TRANSIT')).rejects.toMatchObject({ statusCode: 409 });
      expect((await state(tx.id)).deliveryStatus).toBe('PENDING');
    }
  });

  it('refuses to confirm a deal nobody has paid for', async () => {
    const tx = await deal('AWAITING_PAYMENT', 'DELIVERED');
    await expect(updateDeliveryStatus(tx.id, BUYER, 'CONFIRMED')).rejects.toMatchObject({ statusCode: 409 });
    expect(await state(tx.id)).toMatchObject({ paymentStatus: 'AWAITING_PAYMENT', deliveryStatus: 'DELIVERED' });
  });
});

describe('admin listing feed', () => {
  it("carries the seller's name and score and nothing from the compliance or payout columns", async () => {
    const { listings } = await getAllListings(undefined, 100, 0);
    const row = listings.find((l) => l.id === lotId)!;
    expect(row.farmer.user).toMatchObject({ name: 'Farmer', trustScore: START_TRUST });
    const leaked = ['pan', 'farmerId', 'fssaiLicense', 'gstin', 'payoutAccountNumber', 'payoutUpiId', 'payoutAccountName', 'payoutIfsc', 'bankDetails']
      .filter((k) => k in row.farmer);
    expect(leaked).toEqual([]);
  });
});
