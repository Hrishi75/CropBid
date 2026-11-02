// =============================================================================
// Who pays for delivery, against a real Postgres
// =============================================================================
// What has to hold (utils/freight.ts):
//   - a split is 50/50 to the paisa and the two halves add up to the quote
//   - a bid carries the listing's terms, or the buyer's proposal, and a seller
//     editing the listing afterwards does not change a pending bid
//   - accepting copies the bid's terms onto the deal, and an accept made on
//     terms the buyer has since changed is refused
//   - ops quote only a deal where the buyer pays something, and not once the
//     buyer has opened the payment or a carrier is booked
//   - booking such a deal needs the quote and costs exactly the quote
//   - the seller's payout takes only the seller's share
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));
vi.mock('./orderAlert.service', () => ({ alertNewOrder: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { freightShares, parseFreightPayer } from '../utils/freight';
import { acceptBid, counterBid, placeBid, rejectBid, updateBid } from './bid.service';
import { updateListing } from './listing.service';
import { bookShipment, setFreightQuote } from './logistics.service';
import { freightSummary, getTransaction } from './transaction.service';

const BUYER = 'ft-buyer';
const FARM = 'ft-farm';
const OPS = 'ft-ops';
const ALL = [BUYER, FARM, OPS];
const ADMIN = { userId: OPS, role: 'ADMIN' };

let lotId = '';
let partnerId = '';

async function clean() {
  const lots = await prisma.listing.findMany({ where: { farmerId: `${FARM}-profile` }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const txs = await prisma.transaction.findMany({ where: { listingId: { in: lotIds } }, select: { id: true } });
  await prisma.shipment.deleteMany({ where: { transactionId: { in: txs.map((t) => t.id) } } });
  await prisma.transaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
  await prisma.bid.deleteMany({ where: { listingId: { in: lotIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.logisticsPartner.deleteMany({ where: { name: 'FT Test Carrier' } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: BUYER, name: 'Buyer', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER', phone: '9800000301', location: 'Nagpur',
      buyerProfile: { create: { companyName: 'Mill', companyType: 'PROCESSOR', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({
    data: {
      id: FARM, name: 'Farmer', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000302', location: 'Wardha',
      farmerProfile: { create: { id: `${FARM}-profile`, state: 'Maharashtra', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({ data: { id: OPS, name: 'Ops', email: `${OPS}@test.local`, password: 'x', role: 'ADMIN' } });
  const lot = await prisma.listing.create({
    data: {
      farmerId: `${FARM}-profile`, cropName: 'FT Soybean', quantity: 100, remainingQuantity: 100, unit: 'QUINTAL',
      qualityGrade: 'A', pricePerUnitMin: 4000, pricePerUnitMax: 5000, location: 'Wardha', state: 'Maharashtra',
      freightPaidBy: 'SPLIT',
    },
  });
  lotId = lot.id;
  const partner = await prisma.logisticsPartner.create({
    data: {
      name: 'FT Test Carrier', type: 'TRUCKING', coverageRegions: ['Maharashtra'], coverageCountries: ['India'],
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

async function dealOn(freightPaidBy?: 'FARMER' | 'SPLIT' | 'BUYER') {
  const bid = await placeBid(BUYER, { listingId: lotId, bidPricePerUnit: 4500, quantity: 100, freightPaidBy });
  await acceptBid(bid.id, FARM);
  return prisma.transaction.findUniqueOrThrow({ where: { bidId: bid.id } });
}

const booking = (transactionId: string) => ({
  transactionId, logisticsPartnerId: partnerId, pickupLocation: 'Wardha', deliveryLocation: 'Nagpur',
  pickupDate: new Date().toISOString(), distanceKm: 80, totalWeightKg: 10_000, vehicleType: '10-ton truck',
});

describe('shares', () => {
  it('splits 50/50 to the paisa and the halves add up to the quote', () => {
    expect(freightShares('SPLIT', 801)).toEqual({ buyer: 400.5, seller: 400.5 });
    expect(freightShares('SPLIT', 800.01)).toEqual({ buyer: 400.01, seller: 400 });
    expect(freightShares('BUYER', 800)).toEqual({ buyer: 800, seller: 0 });
    expect(freightShares('FARMER', 800)).toEqual({ buyer: 0, seller: 800 });
  });

  it('refuses a term that is not one of the three', () => {
    expect(parseFreightPayer(undefined)).toBeUndefined();
    expect(() => parseFreightPayer('HALF')).toThrow();
  });
});

describe('bids carry their own terms', () => {
  it("takes the listing's terms, and a later listing edit does not move a pending bid", async () => {
    const bid = await placeBid(BUYER, { listingId: lotId, bidPricePerUnit: 4500, quantity: 100 });
    expect(bid.freightPaidBy).toBe('SPLIT');

    await updateListing(lotId, FARM, { freightPaidBy: 'BUYER' });
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).freightPaidBy).toBe('SPLIT');
  });

  it("takes the buyer's proposal over the listing's, and accepting puts it on the deal", async () => {
    const deal = await dealOn('FARMER');
    expect(deal.freightPaidBy).toBe('FARMER');
    expect(deal.freightQuote).toBeNull();
  });

  it('refuses an accept made on terms the buyer has since changed', async () => {
    const bid = await placeBid(BUYER, { listingId: lotId, bidPricePerUnit: 4500, quantity: 100 });
    await updateBid(bid.id, BUYER, 4500, 'BUYER');

    await expect(acceptBid(bid.id, FARM, { freightPaidBy: 'SPLIT' })).rejects.toMatchObject({ statusCode: 409, code: 'BID_CHANGED' });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: lotId } })).status).toBe('ACTIVE');

    await acceptBid(bid.id, FARM, { freightPaidBy: 'BUYER' });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { bidId: bid.id } })).freightPaidBy).toBe('BUYER');
  });
});

describe('the quote', () => {
  it('is refused on a deal the seller pays for', async () => {
    const deal = await dealOn('FARMER');
    await expect(setFreightQuote(deal.id, 800, ADMIN)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('is for ops only', async () => {
    const deal = await dealOn();
    await expect(setFreightQuote(deal.id, 800, { userId: FARM, role: 'FARMER' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('can be corrected until the buyer opens the payment, then is fixed', async () => {
    const deal = await dealOn();
    await setFreightQuote(deal.id, 800, ADMIN);
    const corrected = await setFreightQuote(deal.id, 900, ADMIN);
    expect(corrected).toMatchObject({ freightQuote: 900, previousQuote: 800, buyerShare: 450, sellerShare: 450 });

    await prisma.transaction.update({ where: { id: deal.id }, data: { razorpayOrderId: `order_ft_${deal.id}` } });
    await expect(setFreightQuote(deal.id, 1000, ADMIN)).rejects.toMatchObject({ statusCode: 409, code: 'FREIGHT_QUOTE_LOCKED' });
  });
});

describe('booking', () => {
  it('needs the quote when the buyer pays part of it, then costs exactly that', async () => {
    const deal = await dealOn();
    await expect(bookShipment(booking(deal.id), ADMIN)).rejects.toMatchObject({ statusCode: 409, code: 'FREIGHT_QUOTE_REQUIRED' });

    await setFreightQuote(deal.id, 801, ADMIN);
    const shipment = await bookShipment(booking(deal.id), ADMIN);
    expect(shipment).toMatchObject({ transportCost: 801, paidBy: 'SPLIT', splitPercentBuyer: 50 });

    await expect(setFreightQuote(deal.id, 900, ADMIN)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('prices a seller-pays deal from the carrier rate, as before', async () => {
    const deal = await dealOn('FARMER');
    const shipment = await bookShipment(booking(deal.id), ADMIN);
    expect(shipment).toMatchObject({ transportCost: 8000, paidBy: 'FARMER', splitPercentBuyer: null });
  });
});

describe('what each side sees', () => {
  it("takes only the seller's share from the payout, and adds the buyer's to what they pay", async () => {
    const deal = await dealOn('BUYER');
    const before = await getTransaction(deal.id, BUYER, 'BUYER');
    expect(before.freight).toMatchObject({ paidBy: 'BUYER', amount: null, awaitingQuote: true, buyerPays: null });

    await setFreightQuote(deal.id, 800, ADMIN);
    const after = await getTransaction(deal.id, FARM, 'FARMER');
    // 450000 of goods, 2% fee 9000, buyer pays all 800 of delivery.
    expect(after.freight).toMatchObject({ amount: 800, buyerShare: 800, sellerShare: 0, awaitingQuote: false, buyerPays: 450800, sellerReceives: 441000 });
  });

  it('on a seller-pays deal, waits for a booking before naming an amount', () => {
    expect(freightSummary({ totalAmount: 1000, platformFeeAmount: 20, freightPaidBy: 'FARMER', freightQuote: null, shipment: null }))
      .toMatchObject({ amount: null, awaitingQuote: false, buyerPays: 1000, sellerReceives: null });
  });
});

describe('review fixes', () => {
  // A real race, ten rounds, asserting the deal and the bid agree whoever won.
  // Without the conditional write, an update reading PENDING just before the
  // accept committed reset the accepted bid to PENDING with new terms.
  it('never leaves an accepted bid disagreeing with its deal when an update races the accept', async () => {
    for (let round = 0; round < 10; round++) {
      const lot = await prisma.listing.create({
        data: {
          farmerId: `${FARM}-profile`, cropName: 'FT Race', quantity: 10, remainingQuantity: 10, unit: 'QUINTAL',
          qualityGrade: 'A', pricePerUnitMin: 4000, pricePerUnitMax: 5000, location: 'Wardha', state: 'Maharashtra',
          freightPaidBy: 'SPLIT',
        },
      });
      const bid = await placeBid(BUYER, { listingId: lot.id, bidPricePerUnit: 4500, quantity: 10 });
      await Promise.allSettled([acceptBid(bid.id, FARM), updateBid(bid.id, BUYER, 4600, 'BUYER')]);

      const after = await prisma.bid.findUniqueOrThrow({ where: { id: bid.id }, include: { transaction: true } });
      if (after.transaction) {
        expect(after.status).toBe('ACCEPTED');
        expect(after.transaction.freightPaidBy).toBe(after.freightPaidBy);
        expect(after.transaction.finalPricePerUnit).toBe(after.bidPricePerUnit);
      } else {
        expect(after).toMatchObject({ status: 'PENDING', freightPaidBy: 'BUYER', bidPricePerUnit: 4600 });
      }
    }
  });

  it("never returns the buyer's phone or address to the seller from accept, reject or counter", async () => {
    const one = await placeBid(BUYER, { listingId: lotId, bidPricePerUnit: 4500, quantity: 100, contactPhone: '9800000301', deliveryAddress: '1 Mill Road' });
    const countered = await counterBid(one.id, FARM, 4800);
    expect(countered).toMatchObject({ contactPhone: null, deliveryAddress: null });
    const rejected = await rejectBid(one.id, FARM);
    expect(rejected).toMatchObject({ contactPhone: null, deliveryAddress: null });

    const two = await placeBid(BUYER, { listingId: lotId, bidPricePerUnit: 4500, quantity: 100, contactPhone: '9800000301', deliveryAddress: '1 Mill Road' });
    const accepted = await acceptBid(two.id, FARM);
    expect(accepted).toMatchObject({ contactPhone: null, deliveryAddress: null });
  });

  it('locks delivery terms while the lot is in a live auction', async () => {
    await prisma.listing.update({ where: { id: lotId }, data: { status: 'IN_AUCTION' } });
    await expect(updateListing(lotId, FARM, { freightPaidBy: 'BUYER' })).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: lotId } })).freightPaidBy).toBe('SPLIT');
  });
});
