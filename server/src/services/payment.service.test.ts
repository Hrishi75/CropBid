// =============================================================================
// Paying for a basket: one payment, every shop order in it, the fees included
// =============================================================================
// A household's lots from one shop are one RetailOrder, and a RetailPayment
// covers one or more of those orders with a single Razorpay order. What has to
// hold:
//
//   1. Several shop orders are paid with ONE Razorpay order for their combined
//      total, delivery fees included. Paying from any one lot pays its whole
//      shop order, so there is no way to pay a shop's lots one by one.
//   2. Only the shopper who placed them can pay, and only while every order is
//      still awaiting payment. The same set asked for again gets the same
//      Razorpay order back rather than a second one to pay.
//   3. A captured payment marks every order it covers paid and moves their lots
//      into ESCROW together, from the callback or the webhook, and a second
//      report changes nothing.
//   4. An order that another payment already paid is not paid twice: that share
//      is recorded as owed back, and the admins are told.
//   5. Trade deals (no shop order) pay exactly as they always did.
// =============================================================================

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config', () => ({
  config: { razorpay: { keyId: 'rzp_test_key', keySecret: 'test_secret', webhookSecret: 'hook_secret' } },
}));

// hoisted, because vi.mock is lifted above every const in this file.
const { orders, tx } = vi.hoisted(() => ({
  orders: { create: vi.fn() },
  // The interactive-transaction client both opening and capturing run against.
  // Opening one is a transaction too, because looking for an open payment and
  // creating one has to be atomic (see the lock test below).
  tx: {
    $executeRaw: vi.fn(),
    retailPayment: {
      findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
    },
    retailOrder: { updateMany: vi.fn() },
    transaction: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('razorpay', () => ({
  default: class { orders = orders; },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    transaction: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    retailOrder: { findMany: vi.fn() },
    retailPayment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./notification.helpers', () => ({ notifyAdminsRetailOverpaid: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { notifyAdminsRetailOverpaid } from './notification.helpers';
import { createOrder, createRetailPayment, verifyPayment, handleWebhook } from './payment.service';

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const txFindUnique = mock(prisma.transaction.findUnique);
const txUpdate = mock(prisma.transaction.update);
const ordersFindMany = mock(prisma.retailOrder.findMany);
const paymentsFindMany = mock(tx.retailPayment.findMany);
const paymentCreate = mock(tx.retailPayment.create);
const paymentFindUnique = mock(prisma.retailPayment.findUnique);
const paymentFindOrThrow = mock(prisma.retailPayment.findUniqueOrThrow);
const runTransaction = mock(prisma.$transaction);

const SHOPPER = 'consumer-1';

// Two shop orders from one basket: ₹100 of items + ₹30 delivery from one shop,
// ₹204 with free delivery from the other.
const awaiting = { transactions: [{ paymentStatus: 'AWAITING_PAYMENT' }] };
const SHOP_A = { id: 'order-a', buyerId: SHOPPER, totalAmount: 130, currency: 'INR', paidAt: null, ...awaiting };
const SHOP_B = { id: 'order-b', buyerId: SHOPPER, totalAmount: 204, currency: 'INR', paidAt: null, ...awaiting };

// One of shop A's lots, priced at its own ₹60.
const RETAIL_LOT = {
  id: 'tx-1',
  buyerId: SHOPPER,
  totalAmount: 60,
  currency: 'INR',
  paymentStatus: 'AWAITING_PAYMENT',
  razorpayOrderId: null,
  retailOrderId: 'order-a',
};

// The payment capture finds, covering both shop orders.
const BASKET_PAYMENT = {
  id: 'pay-basket',
  buyerId: SHOPPER,
  amount: 334,
  currency: 'INR',
  razorpayOrderId: 'order_rzp_1',
  paidAt: null,
  orders: [{ id: 'order-a', totalAmount: 130 }, { id: 'order-b', totalAmount: 204 }],
  buyer: { name: 'Priya' },
};

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', 'test_secret').update(`${orderId}|${paymentId}`).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  orders.create.mockResolvedValue({ id: 'order_rzp_1' });
  ordersFindMany.mockResolvedValue([SHOP_A, SHOP_B]);
  paymentsFindMany.mockResolvedValue([]);
  paymentCreate.mockResolvedValue({});
  paymentFindUnique.mockResolvedValue(BASKET_PAYMENT);
  paymentFindOrThrow.mockResolvedValue(BASKET_PAYMENT);
  tx.$executeRaw.mockResolvedValue(1);
  tx.auditLog.create.mockResolvedValue({});
  tx.retailPayment.updateMany.mockResolvedValue({ count: 1 });
  tx.retailPayment.findUniqueOrThrow.mockResolvedValue(BASKET_PAYMENT);
  tx.retailOrder.updateMany.mockResolvedValue({ count: 1 });
  tx.transaction.updateMany.mockResolvedValue({ count: 1 });
  runTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
});

describe('opening a payment for a basket', () => {
  it('opens ONE Razorpay order for every shop order in it, fees included', async () => {
    const answer = await createRetailPayment(['order-a', 'order-b'], SHOPPER);

    // ₹130 + ₹204 in paise.
    expect(orders.create).toHaveBeenCalledTimes(1);
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 33400 }));
    expect(answer).toMatchObject({ orderId: 'order_rzp_1', amount: 33400, retailOrderIds: ['order-a', 'order-b'] });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buyerId: SHOPPER,
        amount: 334,
        razorpayOrderId: 'order_rzp_1',
        orders: { connect: [{ id: 'order-a' }, { id: 'order-b' }] },
      }),
    });
  });

  it('pays a lot’s whole shop order when asked about the lot', async () => {
    txFindUnique.mockResolvedValue(RETAIL_LOT);
    ordersFindMany.mockResolvedValue([SHOP_A]);

    const answer = await createOrder('tx-1', SHOPPER);

    // ₹130: the shop order with its delivery, not the ₹60 lot on its own.
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 13000 }));
    expect(answer).toMatchObject({ retailOrderIds: ['order-a'], transactionId: 'tx-1' });
    // Never a Razorpay order on the lot itself.
    expect(txUpdate).not.toHaveBeenCalled();
  });

  // Two Pay presses landing together both found nothing and both opened a
  // payable window, so the shopper could complete both. The lookup and the
  // creation now share one transaction, which takes a lock on this shopper's
  // payments first.
  it('looks and creates under a lock on this shopper', async () => {
    await createRetailPayment(['order-a', 'order-b'], SHOPPER);

    expect(tx.$executeRaw).toHaveBeenCalled();
    const lock = tx.$executeRaw.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(paymentsFindMany.mock.invocationCallOrder[0]);
    expect(lock).toBeLessThan(paymentCreate.mock.invocationCallOrder[0]);
  });

  it('hands back the open Razorpay order when the same basket is paid again', async () => {
    paymentsFindMany.mockResolvedValue([
      { id: 'pay-open', amount: 334, razorpayOrderId: 'order_rzp_open', orders: [{ id: 'order-b' }, { id: 'order-a' }] },
    ]);

    const answer = await createRetailPayment(['order-a', 'order-b'], SHOPPER);

    expect(answer.orderId).toBe('order_rzp_open');
    expect(orders.create).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  // Shop A was opened in the basket, then the shopper paid for shop B alone:
  // a different set is a different payment.
  it('opens a new one for a different set of orders', async () => {
    ordersFindMany.mockResolvedValue([SHOP_B]);
    paymentsFindMany.mockResolvedValue([
      { id: 'pay-open', amount: 334, razorpayOrderId: 'order_rzp_open', orders: [{ id: 'order-a' }, { id: 'order-b' }] },
    ]);

    await createRetailPayment(['order-b'], SHOPPER);

    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 20400 }));
  });

  // The other direction: an open payment for shop A alone must not be handed
  // out for A and B together, or the shopper pays ₹130 for a ₹334 basket.
  it('does not reuse a payment that covers only part of the basket', async () => {
    paymentsFindMany.mockResolvedValue([
      { id: 'pay-a', amount: 130, razorpayOrderId: 'order_rzp_a', orders: [{ id: 'order-a' }] },
    ]);

    const answer = await createRetailPayment(['order-a', 'order-b'], SHOPPER);

    expect(answer.orderId).toBe('order_rzp_1');
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 33400 }));
  });

  it('counts an order named twice once', async () => {
    await createRetailPayment(['order-a', 'order-b', 'order-a'], SHOPPER);
    expect(ordersFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['order-a', 'order-b'] } } }));
  });

  it('refuses anyone but the shopper who placed them', async () => {
    await expect(createRetailPayment(['order-a', 'order-b'], 'someone-else'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses an order that does not exist', async () => {
    ordersFindMany.mockResolvedValue([SHOP_A]);
    await expect(createRetailPayment(['order-a', 'order-gone'], SHOPPER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses when any order has already been paid', async () => {
    ordersFindMany.mockResolvedValue([SHOP_A, { ...SHOP_B, paidAt: new Date() }]);
    await expect(createRetailPayment(['order-a', 'order-b'], SHOPPER)).rejects.toMatchObject({ statusCode: 400 });
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses an order that has been cancelled', async () => {
    ordersFindMany.mockResolvedValue([SHOP_A, { ...SHOP_B, cancelledAt: new Date() }]);
    await expect(createRetailPayment(['order-a', 'order-b'], SHOPPER)).rejects.toMatchObject({ statusCode: 400 });
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses when any lot has moved on from awaiting payment', async () => {
    ordersFindMany.mockResolvedValue([SHOP_A, { ...SHOP_B, transactions: [{ paymentStatus: 'REFUNDED' }] }]);
    await expect(createRetailPayment(['order-a', 'order-b'], SHOPPER)).rejects.toMatchObject({ statusCode: 400 });
  });

  // Razorpay first, then the row: a failed call must leave no payment behind
  // that names a Razorpay order which does not exist.
  it('stores nothing when Razorpay refuses the order', async () => {
    ordersFindMany.mockResolvedValue([SHOP_A]);
    orders.create.mockRejectedValue(new Error('razorpay down'));
    await expect(createRetailPayment(['order-a'], SHOPPER)).rejects.toThrow('razorpay down');
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

describe('capturing a basket payment', () => {
  beforeEach(() => {
    // No trade deal carries this Razorpay order; the basket payment does.
    txFindUnique.mockResolvedValue(null);
  });

  it('marks every shop order paid and moves all their lots into ESCROW', async () => {
    const result = await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));

    expect(result.kind).toBe('retailPayment');
    expect(tx.retailPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-basket', paidAt: null },
      data: expect.objectContaining({ razorpayPaymentId: 'pay_1' }),
    });
    for (const id of ['order-a', 'order-b']) {
      // cancelledAt null as well: an order called off while this payment was
      // open is not paid by it, it is money owed back (see the overpaid test).
      expect(tx.retailOrder.updateMany).toHaveBeenCalledWith({
        where: { id, paidAt: null, cancelledAt: null },
        data: expect.objectContaining({ paidAt: expect.any(Date) }),
      });
      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { retailOrderId: id, paymentStatus: 'AWAITING_PAYMENT' },
        data: { paymentStatus: 'ESCROW', razorpayPaymentId: 'pay_1' },
      });
    }
    // One database transaction for all of it, so a basket is never recorded
    // paid with only some of its orders in escrow.
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(notifyAdminsRetailOverpaid).not.toHaveBeenCalled();
  });

  // The callback and the webhook both arrive. The second finds the payment
  // already stamped and touches nothing.
  it('does nothing the second time it is reported', async () => {
    tx.retailPayment.updateMany.mockResolvedValue({ count: 0 });

    await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));

    expect(tx.retailOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  // Shop A was paid on its own in another tab while the basket's checkout was
  // still open, and then the basket was paid too. Shop A must not be paid
  // twice over: its ₹130 is owed back, and a person has to send it.
  it('does not pay an order cancelled while this payment was open', async () => {
    // The shopper cancelled shop A, then paid the basket window that was still
    // open. Its ₹130 was taken and is owed back.
    tx.retailOrder.updateMany.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ({ count: where.id === 'order-a' ? 0 : 1 }));

    await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));

    expect(tx.transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(notifyAdminsRetailOverpaid).toHaveBeenCalledWith('Priya', 130, 'INR', 'pay_1', 'pay-basket');
  });

  it('pays only what is still unpaid, and flags the rest as owed back', async () => {
    tx.retailOrder.updateMany.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ({ count: where.id === 'order-a' ? 0 : 1 }));

    await verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1'));

    // Shop B's lots move; shop A's are left alone.
    expect(tx.transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { retailOrderId: 'order-b', paymentStatus: 'AWAITING_PAYMENT' },
    }));
    // Written inside the capture's own transaction, so a lost audit cannot
    // leave a double charge with no durable trace.
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'retail_payment.overpaid',
        entityId: 'pay-basket',
        metadata: expect.objectContaining({ refundDue: 130, retailOrderIds: ['order-a'] }),
      }),
    });
    expect(notifyAdminsRetailOverpaid).toHaveBeenCalledWith('Priya', 130, 'INR', 'pay_1', 'pay-basket');
  });

  it('refuses a forged signature and moves nothing', async () => {
    await expect(verifyPayment(SHOPPER, 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_other')))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('refuses a callback from someone other than the shopper', async () => {
    await expect(verifyPayment('someone-else', 'order_rzp_1', 'pay_1', sign('order_rzp_1', 'pay_1')))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  // The webhook is the backstop for an app closed mid-payment.
  it('is recorded from the webhook too', async () => {
    const body = Buffer.from(JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_rzp_1' } } },
    }));
    const signature = crypto.createHmac('sha256', 'hook_secret').update(body).digest('hex');

    await handleWebhook(body, signature);

    expect(paymentFindUnique).toHaveBeenCalledWith({ where: { razorpayOrderId: 'order_rzp_1' } });
    expect(tx.transaction.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('a trade deal with no shop order', () => {
  it('still gets a Razorpay order of its own, for its own amount', async () => {
    txFindUnique.mockResolvedValue({ ...RETAIL_LOT, retailOrderId: null, totalAmount: 5000 });
    txUpdate.mockResolvedValue({});

    const answer = await createOrder('tx-1', SHOPPER);

    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 500000 }));
    expect(answer).toMatchObject({ transactionId: 'tx-1' });
    expect(ordersFindMany).not.toHaveBeenCalled();
  });
});
