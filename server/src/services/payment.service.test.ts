// =============================================================================
// Paying for a shop order: one payment, every lot, the fee included
// =============================================================================
// A household's lots from one shop are one RetailOrder. What has to hold:
//
//   1. Paying for any of its lots opens ONE Razorpay order for the whole shop
//      order, delivery fee included. There is no way to pay a shop's lots one
//      by one and skip the fee.
//   2. Only the shopper who placed it can pay for it, and only while every lot
//      is still awaiting payment.
//   3. A captured payment moves every lot into ESCROW together, whether the
//      browser callback or the webhook reports it, and reporting it twice
//      changes nothing the second time.
//   4. Trade deals (no shop order) pay exactly as they always did.
// =============================================================================

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config', () => ({
  config: { razorpay: { keyId: 'rzp_test_key', keySecret: 'test_secret', webhookSecret: 'hook_secret' } },
}));

// hoisted, because vi.mock is lifted above every const in this file.
const { orders } = vi.hoisted(() => ({ orders: { create: vi.fn() } }));

vi.mock('razorpay', () => ({
  default: class { orders = orders; },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    transaction: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    retailOrder: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { createOrder, createRetailOrderPayment, verifyPayment, handleWebhook } from './payment.service';

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const txFindUnique = mock(prisma.transaction.findUnique);
const txUpdate = mock(prisma.transaction.update);
const txUpdateMany = mock(prisma.transaction.updateMany);
const orderFindUnique = mock(prisma.retailOrder.findUnique);
const orderFindOrThrow = mock(prisma.retailOrder.findUniqueOrThrow);
const orderUpdateMany = mock(prisma.retailOrder.updateMany);
const runTransaction = mock(prisma.$transaction);

const SHOPPER = 'consumer-1';

// ₹100 of items from one shop, so the ₹30 delivery applies.
const SHOP_ORDER = {
  id: 'order-1',
  buyerId: SHOPPER,
  itemsTotal: 100,
  deliveryFee: 30,
  totalAmount: 130,
  currency: 'INR',
  razorpayOrderId: null as string | null,
  paidAt: null as Date | null,
  transactions: [{ paymentStatus: 'AWAITING_PAYMENT' }, { paymentStatus: 'AWAITING_PAYMENT' }],
};

// One of that shop order's lots, priced at its own ₹60.
const RETAIL_LOT = {
  id: 'tx-1',
  buyerId: SHOPPER,
  totalAmount: 60,
  currency: 'INR',
  paymentStatus: 'AWAITING_PAYMENT',
  razorpayOrderId: null,
  retailOrderId: 'order-1',
};

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', 'test_secret').update(`${orderId}|${paymentId}`).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  orders.create.mockResolvedValue({ id: 'order_rzp_1' });
  orderFindUnique.mockResolvedValue({ ...SHOP_ORDER });
  orderUpdateMany.mockResolvedValue({ count: 1 });
  txUpdateMany.mockResolvedValue({ count: 2 });
  orderFindOrThrow.mockResolvedValue({ ...SHOP_ORDER, transactions: [{ id: 'tx-1' }, { id: 'tx-2' }] });
  // The batch form of $transaction: the writes have already been built, so
  // resolving them is running them.
  runTransaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
});

describe('opening a payment for a shop order', () => {
  it('charges the whole shop order, delivery included, when asked about one lot', async () => {
    txFindUnique.mockResolvedValue(RETAIL_LOT);

    const answer = await createOrder('tx-1', SHOPPER);

    // ₹130 in paise: both lots and the ₹30 run, not the ₹60 lot on its own.
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 13000 }));
    expect(answer).toMatchObject({ orderId: 'order_rzp_1', amount: 13000, retailOrderId: 'order-1', transactionId: 'tx-1' });
    // Stored on the shop order, never on the lot, so the lot can never be paid
    // for on its own.
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', razorpayOrderId: null },
      data: { razorpayOrderId: 'order_rzp_1' },
    });
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('reuses the Razorpay order it already opened', async () => {
    orderFindUnique.mockResolvedValue({ ...SHOP_ORDER, razorpayOrderId: 'order_rzp_old' });

    const answer = await createRetailOrderPayment('order-1', SHOPPER);

    expect(answer.orderId).toBe('order_rzp_old');
    expect(orders.create).not.toHaveBeenCalled();
  });

  // Two Pay presses racing: both open a Razorpay order, one gets stored. The
  // loser must hand back the stored one, or the shopper pays an order that no
  // webhook can match back to anything.
  it('hands back the stored order when it loses a race to store its own', async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
    orderFindOrThrow.mockResolvedValue({ ...SHOP_ORDER, razorpayOrderId: 'order_rzp_winner' });

    const answer = await createRetailOrderPayment('order-1', SHOPPER);

    expect(answer.orderId).toBe('order_rzp_winner');
  });

  it('refuses anyone but the shopper who placed it', async () => {
    await expect(createRetailOrderPayment('order-1', 'someone-else'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses a shop order that has already been paid', async () => {
    orderFindUnique.mockResolvedValue({ ...SHOP_ORDER, paidAt: new Date() });
    await expect(createRetailOrderPayment('order-1', SHOPPER)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses when any lot has moved on from awaiting payment', async () => {
    orderFindUnique.mockResolvedValue({
      ...SHOP_ORDER,
      transactions: [{ paymentStatus: 'AWAITING_PAYMENT' }, { paymentStatus: 'ESCROW' }],
    });
    await expect(createRetailOrderPayment('order-1', SHOPPER)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('capturing a shop order payment', () => {
  beforeEach(() => {
    // No trade deal carries this Razorpay order; the shop order does.
    txFindUnique.mockResolvedValue(null);
    orderFindUnique.mockResolvedValue({ ...SHOP_ORDER, razorpayOrderId: 'order_rzp_1' });
  });

  it('moves every lot into ESCROW together on a valid callback', async () => {
    const result = await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));

    expect(result.kind).toBe('retailOrder');
    expect(orderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', paidAt: null },
      data: expect.objectContaining({ razorpayPaymentId: 'pay_1' }),
    }));
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { retailOrderId: 'order-1', paymentStatus: 'AWAITING_PAYMENT' },
      data: { paymentStatus: 'ESCROW', razorpayPaymentId: 'pay_1' },
    });
    // One database transaction for both writes, so a shop order is never paid
    // with only some of its lots in escrow.
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a forged signature and moves nothing', async () => {
    await expect(verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_other')))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(txUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses a callback from someone other than the shopper', async () => {
    await expect(verifyPayment('someone-else', 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1')))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(txUpdateMany).not.toHaveBeenCalled();
  });

  // The webhook is the backstop for a browser closed mid-payment.
  it('is recorded from the webhook too', async () => {
    const body = Buffer.from(JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_rzp_1' } } },
    }));
    const signature = crypto.createHmac('sha256', 'hook_secret').update(body).digest('hex');

    await handleWebhook(body, signature);

    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { retailOrderId: 'order-1', paymentStatus: 'AWAITING_PAYMENT' },
    }));
  });

  // Both writes only touch rows still waiting, which is what makes the
  // callback and the webhook safe to arrive in either order, or both.
  it('only ever touches rows still waiting for payment', async () => {
    await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));
    expect(orderUpdateMany.mock.calls[0][0].where).toMatchObject({ paidAt: null });
    expect(txUpdateMany.mock.calls[0][0].where).toMatchObject({ paymentStatus: 'AWAITING_PAYMENT' });
  });
});

describe('a trade deal with no shop order', () => {
  it('still gets a Razorpay order of its own, for its own amount', async () => {
    txFindUnique.mockResolvedValue({ ...RETAIL_LOT, retailOrderId: null, totalAmount: 5000 });
    txUpdate.mockResolvedValue({});

    const answer = await createOrder('tx-1', SHOPPER);

    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 500000 }));
    expect(answer).toMatchObject({ transactionId: 'tx-1' });
    expect(orderFindUnique).not.toHaveBeenCalled();
  });
});
