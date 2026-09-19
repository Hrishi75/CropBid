// =============================================================================
// Retail orders: one shop, one delivery, one payment
// =============================================================================
// A household basket is placed one shop at a time. The properties that have to
// hold:
//
//   THE DELIVERY FEE
//   1. A shop's items under ₹200 pay ₹30 for the run; from ₹200 it is free.
//   2. It is worked out on the SHOP's total, so two small items from one shop
//      travel free together.
//   3. A fee the shopper was not shown is refused, not charged.
//   4. One order is one shop: items from two sellers cannot share a fee.
//
//   REPLAY (unchanged from the one-lot purchase this grew out of)
//   5. A repeat of the same keys returns the ORIGINAL order and claims nothing.
//   6. Losing the unique index to a concurrent twin gives the same answer.
//   7. Someone else's key is never handed over, and never becomes a second
//      purchase either.
//   8. No key at all still buys, because that is every older client.
//
//   THE RULES THE CLIENT CANNOT BE TRUSTED TO KEEP
//   9. Locality, and unit agreement, enforced here and not only in the browser.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    bid: { findFirst: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    listing: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    retailOrder: { findUniqueOrThrow: vi.fn() },
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
import {
  createDirectPurchase,
  createRetailOrder,
  deliveryFeeFor,
  RETAIL_DELIVERY,
} from './retailOrder.service';
import { createTransaction } from './transaction.service';
import { notifyDirectPurchase } from './notification.helpers';
import { alertNewOrder } from './orderAlert.service';

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const bidFindFirst = mock(prisma.bid.findFirst);
const bidFindMany = mock(prisma.bid.findMany);
const bidFindOrThrow = mock(prisma.bid.findUniqueOrThrow);
const listingFindMany = mock(prisma.listing.findMany);
const userFindUnique = mock(prisma.user.findUnique);
const orderFindOrThrow = mock(prisma.retailOrder.findUniqueOrThrow);
const runTransaction = mock(prisma.$transaction);

// The tx client the service is handed inside $transaction. Every call is
// recorded so a test can assert that stock was, or was not, claimed.
const tx = {
  retailOrder: { create: vi.fn() },
  listing: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  bid: { create: vi.fn() },
};

const CONSUMER = 'consumer-1';
const SHOP = 'shop-user-1';
const KEY = 'ck_01HQZX9ABCDEF';
const KEY_2 = 'ck_01HQZX9GHIJKL';

function lot(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: 'ACTIVE',
    cropName: id === 'tomato' ? 'Tomato' : id === 'onion' ? 'Onion' : 'Coriander',
    unit: 'KG',
    currency: 'INR',
    directSaleEnabled: true,
    retailPricePerUnit: 100,
    remainingQuantity: 100,
    // Matches the buyer's city in beforeEach. Retail is city-scoped, so a
    // fixture without a location is a fixture that can never be bought.
    location: 'Pune',
    farmer: { userId: SHOP },
    ...extra,
  };
}

const EXISTING_BID = { id: 'bid-original', quantity: 2, totalAmount: 200, idempotencyKey: KEY };
const EXISTING_ORDER = { id: 'order-original', transactions: [{ id: 'tx-original', bidId: 'bid-original' }] };

function uniqueViolation(target: string[] = ['idempotencyKey']) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

let bidCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  bidCounter = 0;
  listingFindMany.mockResolvedValue([lot('tomato')]);
  userFindUnique.mockResolvedValue({ name: 'Anita', location: 'Pune' });
  bidFindFirst.mockResolvedValue(null);
  bidFindMany.mockResolvedValue([]);
  bidFindOrThrow.mockResolvedValue({ id: 'bid-new-1', quantity: 2 });
  tx.retailOrder.create.mockImplementation(async ({ data }: any) => ({ id: 'order-new', ...data }));
  tx.listing.updateMany.mockResolvedValue({ count: 1 });
  tx.listing.findUniqueOrThrow.mockResolvedValue({ remainingQuantity: 50 });
  tx.bid.create.mockImplementation(async () => ({ id: `bid-new-${++bidCounter}` }));
  orderFindOrThrow.mockImplementation(async ({ where }: any) => ({
    id: where.id,
    transactions: [{ id: 'tx-new-1', bidId: 'bid-new-1' }],
  }));
  runTransaction.mockImplementation(async (fn: any) => fn(tx));
});

const contact = { deliveryAddress: '12 MG Road, Pune', contactPhone: '9876543210' };

// The fee lands in retailOrder.create; this reads it back.
const createdOrder = () => tx.retailOrder.create.mock.calls[0][0].data;

// =============================================================================
// The delivery fee
// =============================================================================
describe('the delivery fee', () => {
  it('is ₹30 under ₹200 and free from ₹200', () => {
    expect(RETAIL_DELIVERY).toEqual({ freeFrom: 200, fee: 30 });
    expect(deliveryFeeFor(0.01)).toBe(30);
    expect(deliveryFeeFor(199.99)).toBe(30);
    // Exactly ₹200 is free. A strict > would charge the shopper for an order
    // that the cart told them had reached free delivery.
    expect(deliveryFeeFor(200)).toBe(0);
    expect(deliveryFeeFor(1000)).toBe(0);
  });

  it('charges ₹30 on a small order and still places it', async () => {
    // 1 kg at ₹100: the order that used to be refused outright.
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 1 }], ...contact });

    expect(createdOrder()).toMatchObject({ itemsTotal: 100, deliveryFee: 30, totalAmount: 130 });
    expect(tx.listing.updateMany).toHaveBeenCalled();
  });

  it('is free once the shop total reaches ₹200', async () => {
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 2 }], ...contact });
    expect(createdOrder()).toMatchObject({ itemsTotal: 200, deliveryFee: 0, totalAmount: 200 });
  });

  // The reason the fee is per shop and not per lot: two small items from the
  // same counter are one delivery run.
  it('is worked out on the whole shop order, not each item', async () => {
    listingFindMany.mockResolvedValue([lot('tomato', { retailPricePerUnit: 60 }), lot('onion', { retailPricePerUnit: 50 })]);

    await createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 2 }, { listingId: 'onion', quantity: 2 }],
      ...contact,
    });

    // ₹120 + ₹100: each item is under ₹200 on its own, together they are not.
    expect(createdOrder()).toMatchObject({ itemsTotal: 220, deliveryFee: 0, totalAmount: 220 });
    expect(tx.bid.create).toHaveBeenCalledTimes(2);
  });

  it('is kept out of every lot, so the seller is never paid it', async () => {
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 1 }], ...contact });

    // The lot is priced at its own value; the ₹30 lives on the shop order only.
    expect(tx.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 100 }) }),
    );
  });

  it('rounds the total to paise before comparing it with ₹200', async () => {
    // 1.99999 kg at ₹100 is ₹199.999, which rounds to ₹200.00: the same sum the
    // basket shows, so the same answer.
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 1.99999 }], ...contact });
    expect(createdOrder()).toMatchObject({ itemsTotal: 200, deliveryFee: 0 });
  });

  describe('when the shopper says what fee they were shown', () => {
    it('places the order when it matches', async () => {
      await expect(createRetailOrder(CONSUMER, {
        lines: [{ listingId: 'tomato', quantity: 1 }], ...contact, deliveryFee: 30,
      })).resolves.toBeDefined();
    });

    // A re-price across ₹200 between the basket and the request would
    // otherwise charge ₹30 to a shopper who was told delivery was free.
    it('refuses, and claims nothing, when it does not', async () => {
      await expect(createRetailOrder(CONSUMER, {
        lines: [{ listingId: 'tomato', quantity: 1 }], ...contact, deliveryFee: 0,
      })).rejects.toMatchObject({ statusCode: 409 });
      expect(tx.listing.updateMany).not.toHaveBeenCalled();
    });

    it('names the fee it would have charged', async () => {
      await expect(createRetailOrder(CONSUMER, {
        lines: [{ listingId: 'tomato', quantity: 1 }], ...contact, deliveryFee: 0,
      })).rejects.toThrow(/₹30/);
    });
  });
});

// =============================================================================
// One order is one shop
// =============================================================================
describe('one shop per order', () => {
  it('refuses items from two sellers, and claims nothing', async () => {
    listingFindMany.mockResolvedValue([lot('tomato'), lot('onion', { farmer: { userId: 'another-shop' } })]);

    await expect(createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 1 }, { listingId: 'onion', quantity: 1 }],
      ...contact,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  it('records the seller on the order', async () => {
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 2 }], ...contact });
    expect(createdOrder()).toMatchObject({ buyerId: CONSUMER, sellerId: SHOP });
  });

  it('ties every lot to its shop order', async () => {
    listingFindMany.mockResolvedValue([lot('tomato'), lot('onion')]);
    await createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 1 }, { listingId: 'onion', quantity: 1 }],
      ...contact,
    });

    expect(createTransaction).toHaveBeenCalledTimes(2);
    for (const call of mock(createTransaction).mock.calls) {
      expect(call[2]).toEqual({ retailOrderId: 'order-new' });
    }
  });

  it('refuses the same item twice', async () => {
    await expect(createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 1 }, { listingId: 'tomato', quantity: 1 }],
      ...contact,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  // A fee worked out on four items is wrong for three, so one lot selling out
  // underneath the order fails the whole shop order rather than part of it.
  it('fails the whole order when one lot has run out', async () => {
    listingFindMany.mockResolvedValue([lot('tomato'), lot('onion')]);
    tx.listing.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 1 }, { listingId: 'onion', quantity: 1 }],
      ...contact,
    })).rejects.toMatchObject({ statusCode: 409 });
    // Nothing after the commit ran, because nothing committed.
    expect(notifyDirectPurchase).not.toHaveBeenCalled();
    expect(alertNewOrder).not.toHaveBeenCalled();
  });

  it('tells the seller and ops about each lot once the order commits', async () => {
    listingFindMany.mockResolvedValue([lot('tomato'), lot('onion')]);
    await createRetailOrder(CONSUMER, {
      lines: [{ listingId: 'tomato', quantity: 1 }, { listingId: 'onion', quantity: 1 }],
      ...contact,
    });
    expect(notifyDirectPurchase).toHaveBeenCalledTimes(2);
    expect(alertNewOrder).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Replay
// =============================================================================
describe('replay of a shop order', () => {
  const twoLines = () => ({
    lines: [
      { listingId: 'tomato', quantity: 1, idempotencyKey: KEY },
      { listingId: 'onion', quantity: 1, idempotencyKey: KEY_2 },
    ],
    ...contact,
  });

  it('returns the original order and buys nothing more', async () => {
    bidFindMany.mockResolvedValue([
      { transaction: { retailOrderId: 'order-original' } },
      { transaction: { retailOrderId: 'order-original' } },
    ]);

    const result = await createRetailOrder(CONSUMER, twoLines());

    expect(result.replayed).toBe(true);
    expect(result.order.id).toBe('order-original');
    expect(runTransaction).not.toHaveBeenCalled();
    expect(notifyDirectPurchase).not.toHaveBeenCalled();
  });

  it('looks the keys up scoped to the buyer', async () => {
    listingFindMany.mockResolvedValue([lot('tomato'), lot('onion')]);
    await createRetailOrder(CONSUMER, twoLines());
    expect(bidFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: { in: [KEY, KEY_2] }, buyerId: CONSUMER } }),
    );
  });

  // Half a basket already ordered cannot be finished by buying the other half:
  // the fee was worked out on the whole. The shopper is sent to look instead.
  it('refuses a basket that is only partly ordered', async () => {
    bidFindMany.mockResolvedValue([{ transaction: { retailOrderId: 'order-original' } }]);

    await expect(createRetailOrder(CONSUMER, twoLines())).rejects.toMatchObject({ statusCode: 409 });
    expect(runTransaction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// The one-lot path older app builds still call
// =============================================================================
const input = (extra: Record<string, unknown> = {}) => ({
  listingId: 'tomato',
  quantity: 2,
  ...contact,
  ...extra,
});

describe('createDirectPurchase — sequential replay', () => {
  it('returns the original order and buys nothing more', async () => {
    bidFindFirst.mockResolvedValue(EXISTING_BID);

    const result = await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));

    expect(result.bid).toBe(EXISTING_BID);
    expect(result.replayed).toBe(true);
    // The whole point: no second claim on the stock, and no second order.
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.bid.create).not.toHaveBeenCalled();
  });

  // The seller already heard about this sale. Telling them again would have
  // them packing a second crate for an order that does not exist.
  it('does not notify the seller a second time', async () => {
    bidFindFirst.mockResolvedValue(EXISTING_BID);
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(notifyDirectPurchase).not.toHaveBeenCalled();
    expect(alertNewOrder).not.toHaveBeenCalled();
  });

  it('looks the key up scoped to the buyer', async () => {
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(bidFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: KEY, buyerId: CONSUMER } }),
    );
  });
});

describe('createDirectPurchase — concurrent replay', () => {
  it('hands the loser of the unique race the winner’s order', async () => {
    // Nothing committed when the pre-checks ran, then the insert loses.
    bidFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ transaction: { retailOrderId: 'order-original' } }]);
    orderFindOrThrow.mockResolvedValue(EXISTING_ORDER);
    bidFindOrThrow.mockResolvedValue(EXISTING_BID);
    runTransaction.mockRejectedValue(uniqueViolation());

    const result = await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));

    expect(result.bid).toBe(EXISTING_BID);
    expect(result.replayed).toBe(true);
  });

  // A key that exists but is not this buyer's. Minting a second order under a
  // fresh key would be worse than refusing: the caller believes this key
  // identifies their purchase, and it does not.
  it('refuses rather than buying twice when the key is not the buyer’s', async () => {
    runTransaction.mockRejectedValue(uniqueViolation());

    await expect(createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY })))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // A collision on some other unique field is a real error and must not be
  // answered with somebody's order.
  it('rethrows a unique violation on a different column', async () => {
    runTransaction.mockRejectedValue(uniqueViolation(['bidId']));

    await expect(createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY })))
      .rejects.toMatchObject({ code: 'P2002' });
    // One lookup only, the pre-check. The conflict path never ran.
    expect(bidFindMany).toHaveBeenCalledTimes(1);
  });
});

describe('createDirectPurchase — without a key', () => {
  it('still buys, and never looks for a replay', async () => {
    const result = await createDirectPurchase(CONSUMER, input());

    expect(result.replayed).toBe(false);
    expect(result.bid).toMatchObject({ id: 'bid-new-1' });
    expect(bidFindFirst).not.toHaveBeenCalled();
    expect(bidFindMany).not.toHaveBeenCalled();
    expect(tx.listing.updateMany).toHaveBeenCalled();
  });

  it('writes null rather than undefined into the unique column', async () => {
    await createDirectPurchase(CONSUMER, input());
    expect(tx.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: null }) }),
    );
  });

  it('stores the key when one is given', async () => {
    await createDirectPurchase(CONSUMER, input({ idempotencyKey: KEY }));
    expect(tx.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: KEY }) }),
    );
  });

  // The ₹150 floor is gone, so a one-lot order under ₹200 is taken. It carries
  // NO delivery fee: these clients show "Delivery: Free" and cannot send back
  // what they were shown, so charging them would be a fee nobody displayed.
  it('takes a small order, and charges the old clients no delivery', async () => {
    await expect(createDirectPurchase(CONSUMER, input({ quantity: 1 }))).resolves.toBeDefined();
    expect(createdOrder()).toMatchObject({ itemsTotal: 100, deliveryFee: 0, totalAmount: 100 });
  });

  // The fee lives on the basket endpoint, which every current client uses.
  it('still charges delivery on the same order placed as a shop order', async () => {
    await createRetailOrder(CONSUMER, { lines: [{ listingId: 'tomato', quantity: 1 }], ...contact });
    expect(createdOrder()).toMatchObject({ itemsTotal: 100, deliveryFee: 30, totalAmount: 130 });
  });
});

describe('locality', () => {
  it('refuses a lot that ships from another city', async () => {
    listingFindMany.mockResolvedValue([lot('tomato', { location: 'Nagpur' })]);

    await expect(createDirectPurchase(CONSUMER, input()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  // A shopper who has never picked a city is exactly the case the client-side
  // rule skips, so it is the one the server has to answer.
  it('refuses when the buyer has no city at all', async () => {
    userFindUnique.mockResolvedValue({ name: 'Anita', location: null });

    await expect(createDirectPurchase(CONSUMER, input()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  it('matches the city case-insensitively', async () => {
    listingFindMany.mockResolvedValue([lot('tomato', { location: 'pune' })]);
    await expect(createDirectPurchase(CONSUMER, input())).resolves.toBeDefined();
  });
});

describe('unit agreement', () => {
  it('refuses a quantity converted with a unit the listing no longer uses', async () => {
    // The caller converted kilograms as if this were a QUINTAL lot; it is KG.
    // Accepting it would buy a hundred times what was asked for.
    await expect(createDirectPurchase(CONSUMER, input({ unit: 'QUINTAL' })))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  it('buys when the caller and the listing agree', async () => {
    await expect(createDirectPurchase(CONSUMER, input({ unit: 'KG' }))).resolves.toBeDefined();
  });

  // Every client written before the field existed omits it, and must keep working.
  it('buys when no unit is sent at all', async () => {
    await expect(createDirectPurchase(CONSUMER, input())).resolves.toBeDefined();
  });
});
