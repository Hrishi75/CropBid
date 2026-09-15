// =============================================================================
// Wallet credits — the properties that must hold when money is involved
// =============================================================================
// A prepaid balance is the one place in this codebase where a client can make
// a number go up, so the interesting tests are all about what CANNOT happen:
//
//   1. The credited amount comes from Razorpay, never from the request. A
//      caller who could state what they had paid could mint credits for free.
//   2. A bad signature credits nothing.
//   3. A payment already on the ledger credits nothing a second time, and does
//      not surface as an error either. Retries and webhook races are normal.
//   4. A payment made for someone else's wallet is refused, because the order
//      id, payment id and signature all reach the client and none is a secret.
//   5. A spend cannot take the balance below zero. Credits are prepaid; there
//      is no overdraft to collect.
//   6. The ledger and the cached balance always agree.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../config', () => ({
  config: { razorpay: { keyId: 'rzp_test_key', keySecret: 'test_secret', webhookSecret: '' } },
}));

// hoisted, because vi.mock is lifted above every const in this file.
const { orders, payments } = vi.hoisted(() => ({
  orders: { create: vi.fn(), fetch: vi.fn() },
  payments: { fetch: vi.fn() },
}));
vi.mock('razorpay', () => ({
  default: class { orders = orders; payments = payments; },
}));

vi.mock('../lib/prisma', () => {
  const wallet = { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findUnique: vi.fn() };
  const walletEntry = { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  // The row lock. Asserted on below: without it two concurrent top-ups read the
  // same balance and one is lost.
  const $queryRaw = vi.fn(() => Promise.resolve([]));
  return {
    prisma: {
      wallet, walletEntry, user, $queryRaw,
      // Runs the callback against the same mocks, so an "interactive
      // transaction" behaves like the real one for the purposes of these tests.
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({ wallet, walletEntry, $queryRaw })),
    },
  };
});

import { prisma } from '../lib/prisma';
import { spend, verifyTopup, createTopupOrder, MIN_TOPUP, MAX_TOPUP } from './wallet.service';

const SECRET = 'test_secret';
const WALLET = { id: 'w1', userId: 'u1', balance: 0, currency: 'INR' };

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const w = prisma.wallet as unknown as Record<string, ReturnType<typeof vi.fn>>;
const e = prisma.walletEntry as unknown as Record<string, ReturnType<typeof vi.fn>>;
const u = prisma.user as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** The wallet as it stands, wired through every mock that reads it. */
function walletAt(balance: number) {
  const current = { ...WALLET, balance };
  u.findUnique.mockResolvedValue({ currency: 'INR' });
  w.upsert.mockResolvedValue(current);
  w.findUniqueOrThrow.mockResolvedValue(current);
  w.update.mockImplementation(({ data }: { data: { balance: number } }) =>
    Promise.resolve({ ...current, balance: data.balance }));
  e.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'e1', ...data }));
  return current;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ownership is proved from the ORDER's notes now, not the payment's:
  // Razorpay does not copy order notes onto the payment entity, so the old
  // check passed by default whenever they were absent.
  orders.fetch.mockResolvedValue({ id: 'order_1', notes: { kind: 'wallet_topup', walletId: 'w1' } });
});

describe('the wallet row is locked before it is read', () => {
  // Re-reading inside the transaction is not enough. Postgres defaults to READ
  // COMMITTED, so two concurrent top-ups both read the same balance and the
  // second `set` erases the first: both ledger rows commit and the balance
  // reflects one of them. The unique payment-id index does not help, because
  // these are two DIFFERENT payments.
  it('takes FOR UPDATE before computing the new balance', async () => {
    walletAt(0);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'captured', amount: 50_000, notes: { walletId: 'w1' },
    });

    await verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1'));

    const raw = (prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw;
    expect(raw).toHaveBeenCalled();
    const sql = raw.mock.calls[0][0].join?.('?') ?? String(raw.mock.calls[0][0]);
    expect(sql).toMatch(/FOR UPDATE/i);
  });
});

describe('the credited amount', () => {
  it('comes from Razorpay, not from anything the caller can say', async () => {
    walletAt(0);
    // Razorpay reports 500 rupees, in paise.
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'captured', amount: 50_000, notes: { walletId: 'w1' },
    });

    const { wallet } = await verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1'));

    // 50000 paise is 500 credits. Nothing in the request said "500".
    expect(wallet.balance).toBe(500);
    expect(e.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 500, type: 'TOPUP' }) }),
    );
  });

  it('is refused when the payment was for a different order', async () => {
    walletAt(0);
    payments.fetch.mockResolvedValue({
      order_id: 'someone_elses_order', status: 'captured', amount: 50_000, notes: {},
    });

    await expect(verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1')))
      .rejects.toThrow(/different order/i);
    expect(e.create).not.toHaveBeenCalled();
  });

  it('is refused when the payment has not been captured', async () => {
    walletAt(0);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'failed', amount: 50_000, notes: { walletId: 'w1' },
    });

    await expect(verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1')))
      .rejects.toThrow(/not captured/i);
    expect(e.create).not.toHaveBeenCalled();
  });
});

describe('the signature', () => {
  it('credits nothing when it is wrong', async () => {
    walletAt(0);

    await expect(verifyTopup('u1', 'order_1', 'pay_1', 'not-the-signature'))
      .rejects.toThrow(/signature/i);
    // Not even fetched: the check happens before we ask Razorpay anything.
    expect(payments.fetch).not.toHaveBeenCalled();
    expect(e.create).not.toHaveBeenCalled();
  });

  it('credits nothing when it is the right length but the wrong value', async () => {
    // A same-length forgery, so the timingSafeEqual path is the one exercised
    // rather than the length guard in front of it.
    walletAt(0);
    const forged = sign('other_order', 'other_payment');

    await expect(verifyTopup('u1', 'order_1', 'pay_1', forged)).rejects.toThrow(/signature/i);
    expect(e.create).not.toHaveBeenCalled();
  });
});

describe('a payment that has already been credited', () => {
  it('does not credit twice, and does not read as an error', async () => {
    const current = walletAt(500);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'captured', amount: 50_000, notes: { walletId: 'w1' },
    });
    // The unique index on razorpayPaymentId fires.
    const duplicate = Object.assign(new Error('Unique constraint'), {
      code: 'P2002', meta: { target: ['razorpayPaymentId'] },
    });
    e.create.mockRejectedValue(duplicate);
    w.findUniqueOrThrow.mockResolvedValue(current);
    e.findUnique.mockResolvedValue({ id: 'e-existing', amount: 500, balanceAfter: 500 });

    const { wallet, entry } = await verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1'));

    // The balance is what it already was: 500, not 1000.
    expect(wallet.balance).toBe(500);
    expect(entry.id).toBe('e-existing');
    expect(w.update).not.toHaveBeenCalled();
  });
});

describe('an order that is not a top-up', () => {
  it('is refused rather than credited', async () => {
    // A signed payment from any other flow on this account. Its order carries
    // no wallet stamp, and an absent stamp used to mean "no check to do".
    walletAt(0);
    payments.fetch.mockResolvedValue({ order_id: 'order_1', status: 'captured', amount: 50_000 });
    orders.fetch.mockResolvedValue({ id: 'order_1', notes: {} });

    await expect(verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1')))
      .rejects.toThrow(/not for your wallet/i);
    expect(e.create).not.toHaveBeenCalled();
  });
});

describe('an authorized but uncaptured payment', () => {
  it('creates no credits', async () => {
    // Authorization reserves the funds; the capture can still fail or never
    // happen. Crediting on it hands out spendable balance for money that never
    // arrived.
    walletAt(0);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'authorized', amount: 50_000,
    });

    await expect(verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1')))
      .rejects.toThrow(/not captured/i);
    expect(e.create).not.toHaveBeenCalled();
  });
});

describe("somebody else's payment", () => {
  it('cannot be replayed into your own wallet', async () => {
    // The order id, payment id and signature all reach the browser, so none of
    // them is a secret. What stops the replay is the walletId on the order.
    walletAt(0);
    payments.fetch.mockResolvedValue({ order_id: 'order_1', status: 'captured', amount: 500_000 });
    // The binding lives on the ORDER. Razorpay does not copy order notes onto
    // the payment, so checking the payment found nothing and let this through.
    orders.fetch.mockResolvedValue({
      id: 'order_1', notes: { kind: 'wallet_topup', walletId: 'someone-elses-wallet' },
    });

    await expect(verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1')))
      .rejects.toThrow(/not for your wallet/i);
    expect(e.create).not.toHaveBeenCalled();
  });
});

describe('spending', () => {
  it('takes credits off and records the running total', async () => {
    walletAt(500);

    const { wallet, entry } = await spend('u1', 120, 'Order #1');

    expect(wallet.balance).toBe(380);
    expect(entry).toMatchObject({ type: 'SPEND', amount: -120, balanceAfter: 380 });
  });

  it('refuses to go below zero rather than running an overdraft', async () => {
    walletAt(50);

    await expect(spend('u1', 120, 'Order #1')).rejects.toThrow(/not enough credits/i);
    expect(w.update).not.toHaveBeenCalled();
  });

  it('allows spending the balance down to exactly zero', async () => {
    walletAt(120);

    const { wallet } = await spend('u1', 120, 'Order #1');

    expect(wallet.balance).toBe(0);
  });
});

describe('rounding', () => {
  it('keeps the balance at 2dp instead of accumulating float dust', async () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754. Persisted, it compounds.
    walletAt(0.1);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'captured', amount: 20, notes: { walletId: 'w1' },
    });

    const { wallet } = await verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1'));

    expect(wallet.balance).toBe(0.3);
  });

  it('writes the same figure to the ledger row and the balance', async () => {
    walletAt(10.005);
    payments.fetch.mockResolvedValue({
      order_id: 'order_1', status: 'captured', amount: 1_000, notes: { walletId: 'w1' },
    });

    const { wallet, entry } = await verifyTopup('u1', 'order_1', 'pay_1', sign('order_1', 'pay_1'));

    // The statement must never disagree with the balance, even by a paisa.
    expect(entry.balanceAfter).toBe(wallet.balance);
  });
});

describe('top-up limits', () => {
  beforeEach(() => {
    walletAt(0);
    orders.create.mockResolvedValue({ id: 'order_1' });
  });

  it('refuses an amount under the floor', async () => {
    await expect(createTopupOrder('u1', MIN_TOPUP - 1)).rejects.toThrow(/smallest top-up/i);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses an amount over the ceiling', async () => {
    await expect(createTopupOrder('u1', MAX_TOPUP + 1)).rejects.toThrow(/largest top-up/i);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('sends paise to Razorpay, not rupees', async () => {
    await createTopupOrder('u1', 500);

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50_000, currency: 'INR' }),
    );
  });

  it('stamps the wallet onto the order, which is what blocks a replay', async () => {
    await createTopupOrder('u1', 500);

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.objectContaining({ walletId: 'w1' }) }),
    );
  });

  it('creates no credits, because no money has moved yet', async () => {
    await createTopupOrder('u1', 500);

    expect(e.create).not.toHaveBeenCalled();
    expect(w.update).not.toHaveBeenCalled();
  });
});
