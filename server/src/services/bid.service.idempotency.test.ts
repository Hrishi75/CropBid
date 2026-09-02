// =============================================================================
// Direct purchase idempotency — one intent, one order
// =============================================================================
// /bids/direct-purchase spends stock and opens an escrow transaction in one
// shot, and a client cannot tell a request that failed from one that succeeded
// and lost its response. Without a key that ambiguity is unresolvable: the lot
// still looks unsold, the shopper taps buy again, and they own two of it.
//
// The properties that have to hold:
//   1. A repeat of the same key returns the ORIGINAL order and claims no more
//      stock — the sequential case, where the first purchase has committed.
//   2. Losing the unique index to a concurrent twin gives the same answer
//      rather than an error — the simultaneous case.
//   3. Someone else's key is never handed over, and never silently becomes a
//      second purchase either.
//   4. No key at all still buys, because that is every client written before
//      this existed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    bid: { findFirst: vi.fn(), create: vi.fn() },
    listing: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./transaction.service', () => ({ createTransaction: vi.fn() }));
vi.mock('./notification.helpers', () => ({
  notifyNewBid: vi.fn(() => Promise.resolve()),
  notifyBidAccepted: vi.fn(() => Promise.resolve()),
  notifyBidRejected: vi.fn(() => Promise.resolve()),
  notifyBidCountered: vi.fn(() => Promise.resolve()),
  notifyDirectPurchase: vi.fn(() => Promise.resolve()),
}));
vi.mock('./orderAlert.service', () => ({ alertNewOrder: vi.fn() }));

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { createDirectPurchase } from './bid.service';
import { notifyDirectPurchase } from './notification.helpers';
import { alertNewOrder } from './orderAlert.service';

const findFirst = prisma.bid.findFirst as unknown as ReturnType<typeof vi.fn>;
const bidCreate = prisma.bid.create as unknown as ReturnType<typeof vi.fn>;
const listingFindUnique = prisma.listing.findUnique as unknown as ReturnType<typeof vi.fn>;
const listingUpdateMany = prisma.listing.updateMany as unknown as ReturnType<typeof vi.fn>;
const listingFindOrThrow = prisma.listing.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const runTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const CONSUMER = 'consumer-1';
const KEY = 'ck_01HQZX9ABCDEF';

const LISTING = {
  id: 'listing-1',
  status: 'ACTIVE',
  cropName: 'Tomato',
  unit: 'KG',
  currency: 'INR',
  directSaleEnabled: true,
  retailPricePerUnit: 30,
  remainingQuantity: 100,
  // Matches the buyer's city in beforeEach. Retail is city-scoped and the
  // service refuses an order it cannot deliver, so a fixture without a
  // location is a fixture that can never be bought.
  location: 'Pune',
  farmer: { userId: 'farmer-1' },
};

const EXISTING_ORDER = { id: 'bid-original', quantity: 2, totalAmount: 60, idempotencyKey: KEY };

// The tx client the service is handed inside $transaction. Every call is
// recorded so a test can assert that stock was, or was not, claimed.
function txClient() {
  return {
    listing: { updateMany: listingUpdateMany, findUniqueOrThrow: listingFindOrThrow, update: vi.fn() },
    bid: { create: bidCreate },
  };
}

function uniqueViolation(target: string[] = ['idempotencyKey']) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listingFindUnique.mockResolvedValue(LISTING);
  userFindUnique.mockResolvedValue({ id: CONSUMER, phone: '9876543210', location: 'Pune' });
  listingUpdateMany.mockResolvedValue({ count: 1 });
  listingFindOrThrow.mockResolvedValue({ ...LISTING, remainingQuantity: 98 });
  bidCreate.mockResolvedValue({ id: 'bid-new', quantity: 2, buyer: { name: 'Anita' } });
  runTransaction.mockImplementation(async (fn: any) => fn(txClient()));
});

const input = (extra: Record<string, unknown> = {}) => ({
  listingId: LISTING.id,
  quantity: 2,
  deliveryAddress: '12 MG Road, Pune',
  contactPhone: '9876543210',
  ...extra,
});

describe('createDirectPurchase — sequential replay', () => {
  it('returns the original order and buys nothing more', async () => {
    findFirst.mockResolvedValue(EXISTING_ORDER);

    const result = await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));

    expect(result.bid).toBe(EXISTING_ORDER);
    expect(result.replayed).toBe(true);
    // The whole point: no second claim on the stock, and no second order.
    expect(listingUpdateMany).not.toHaveBeenCalled();
    expect(bidCreate).not.toHaveBeenCalled();
  });

  // The farmer already heard about this sale. Telling them again would have
  // them packing a second crate for an order that does not exist.
  it('does not notify the farmer a second time', async () => {
    findFirst.mockResolvedValue(EXISTING_ORDER);
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(notifyDirectPurchase).not.toHaveBeenCalled();
    expect(alertNewOrder).not.toHaveBeenCalled();
  });

  // The replay must not be reachable by holding someone else's key.
  it('looks the key up scoped to the buyer', async () => {
    findFirst.mockResolvedValue(null);
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: KEY, buyerId: CONSUMER } }),
    );
  });
});

describe('createDirectPurchase — concurrent replay', () => {
  it('hands the loser of the unique race the winner’s order', async () => {
    // Nothing committed when the pre-check ran, then the insert loses.
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(EXISTING_ORDER);
    runTransaction.mockRejectedValue(uniqueViolation());

    const result = await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));

    expect(result.bid).toBe(EXISTING_ORDER);
    expect(result.replayed).toBe(true);
  });

  // A key that exists but is not this buyer's. Minting a second order under a
  // fresh key would be worse than refusing: the caller believes this key
  // identifies their purchase, and it does not.
  it('refuses rather than buying twice when the key is not the buyer’s', async () => {
    findFirst.mockResolvedValue(null);
    runTransaction.mockRejectedValue(uniqueViolation());

    await expect(createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY })))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // A collision on some other unique field is a real error and must not be
  // answered with somebody's order.
  it('rethrows a unique violation on a different column', async () => {
    // Nothing to replay, and the collision is not ours: the raw P2002 has to
    // come back out rather than being converted into a 409 about a key, or
    // answered with an order.
    findFirst.mockResolvedValue(null);
    runTransaction.mockRejectedValue(uniqueViolation(['bidId']));

    await expect(createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY })))
      .rejects.toMatchObject({ code: 'P2002' });
    // One lookup only — the pre-check. The conflict path never ran.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('createDirectPurchase — without a key', () => {
  it('still buys, and never looks for a replay', async () => {
    const result = await createDirectPurchase(CONSUMER, input());

    expect(result.replayed).toBe(false);
    expect(result.bid).toMatchObject({ id: 'bid-new' });
    expect(findFirst).not.toHaveBeenCalled();
    expect(listingUpdateMany).toHaveBeenCalled();
  });

  it('writes null rather than undefined into the unique column', async () => {
    await createDirectPurchase(CONSUMER, input());
    expect(bidCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: null }) }),
    );
  });

  it('stores the key when one is given', async () => {
    findFirst.mockResolvedValue(null);
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(bidCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: KEY }) }),
    );
  });
});

// =============================================================================
// The two rules the client cannot be trusted to keep
// =============================================================================
// Both of these were enforced only in the browser, which means they were not
// enforced. The shelf, the shop page and the cart all decline to check locality
// when the shopper has no city at all, and no amount of client-side conversion
// can survive a seller re-denominating a lot between the last fetch and the
// request landing. Reviewed onto the server, and pinned here.
// =============================================================================
describe('createDirectPurchase — locality', () => {
  it('refuses a lot that ships from another city', async () => {
    findFirst.mockResolvedValue(null);
    listingFindUnique.mockResolvedValue({ ...LISTING, location: 'Nagpur' });

    await expect(createDirectPurchase(CONSUMER, input()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(listingUpdateMany).not.toHaveBeenCalled();
  });

  // A shopper who has never picked a city is exactly the case the client-side
  // rule skips, so it is the one the server has to answer.
  it('refuses when the buyer has no city at all', async () => {
    findFirst.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ id: CONSUMER, phone: '9876543210', location: null });

    await expect(createDirectPurchase(CONSUMER, input()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(listingUpdateMany).not.toHaveBeenCalled();
  });

  it('matches the city case-insensitively', async () => {
    findFirst.mockResolvedValue(null);
    listingFindUnique.mockResolvedValue({ ...LISTING, location: 'pune' });

    await expect(createDirectPurchase(CONSUMER, input())).resolves.toBeDefined();
  });
});

describe('createDirectPurchase — unit agreement', () => {
  it('refuses a quantity converted with a unit the listing no longer uses', async () => {
    findFirst.mockResolvedValue(null);

    // The caller converted kilograms as if this were a QUINTAL lot; it is KG.
    // Accepting it would buy a hundred times what was asked for.
    await expect(createDirectPurchase(CONSUMER, input({ unit: 'QUINTAL' })))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(listingUpdateMany).not.toHaveBeenCalled();
  });

  it('buys when the caller and the listing agree', async () => {
    findFirst.mockResolvedValue(null);
    await expect(createDirectPurchase(CONSUMER, input({ unit: 'KG' }))).resolves.toBeDefined();
  });

  // Every client written before the field existed omits it, and must keep working.
  it('buys when no unit is sent at all', async () => {
    findFirst.mockResolvedValue(null);
    await expect(createDirectPurchase(CONSUMER, input())).resolves.toBeDefined();
  });
});
