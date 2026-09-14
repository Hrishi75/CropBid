// =============================================================================
// Wallet — prepaid credits
// =============================================================================
// A shopper tops the wallet up with money and holds credits. 1 CREDIT IS 1
// RUPEE: no exchange rate, no bonus multiplier, no expiry. Every one of those
// is a pricing decision nobody has taken, and putting one here would show a
// number on screen that no one can justify.
//
// THE LEDGER IS THE RECORD, THE BALANCE IS A CACHE. `WalletEntry` rows are the
// truth; `Wallet.balance` is the running total kept beside them so the navbar
// does not sum history on every paint. Both move inside one interactive
// transaction, so they cannot drift.
//
// WHAT MAKES A DOUBLE CREDIT IMPOSSIBLE: `WalletEntry.razorpayPaymentId` is
// UNIQUE. The verify endpoint can be called twice by a retrying client, or by a
// webhook racing the checkout callback, and the second insert loses to the
// constraint rather than crediting the account again. That is a database
// guarantee, not a check-then-act, so it holds under genuine concurrency where
// a "have we seen this payment?" lookup would not.
//
// THIS IS REAL MONEY IN, and unlike settlement (CLAUDE.md §6) the credit side
// is genuinely complete: the rupees reach the platform account and the credits
// exist. What credits CANNOT do yet is pay for an order. `spend()` is written
// and tested, but nothing calls it: wiring it into checkout changes escrow and
// refunds and is its own piece of work. Until then a shopper can load a wallet
// and not spend it, which is why the app says so on the wallet screen.
// =============================================================================

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';
import type { Prisma, WalletEntryType } from '../generated/prisma/client';

// Single shared client, mirroring payment.service. Null when keys are absent so
// the app still boots and everything else keeps working.
const razorpay = config.razorpay.keyId && config.razorpay.keySecret
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

function requireRazorpay(): Razorpay {
  if (!razorpay) {
    throw new ApiError(503, 'Payments are not configured (missing RAZORPAY_KEY_ID/SECRET)');
  }
  return razorpay;
}

/**
 * The smallest and largest single top-up.
 *
 * A floor because a ₹1 top-up costs more in payment-gateway fees than it adds.
 * A ceiling because an unbounded prepaid balance is a money-laundering surface
 * and a support problem, and because a mistyped amount should bounce rather
 * than charge somebody ₹500,000. Neither number is sacred; both are one edit.
 */
export const MIN_TOPUP = 100;
export const MAX_TOPUP = 50_000;

/**
 * Credits are rounded to 2dp on every write.
 *
 * `Float` is the wrong type for money and it is what the rest of the schema
 * uses (Transaction.totalAmount, Bid.totalAmount), so this does not make it
 * worse. What it does is stop 0.1 + 0.2 from persisting as
 * 0.30000000000000004 and then compounding entry after entry.
 */
function credits(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * The caller's wallet, created on first read.
 *
 * Created lazily rather than at signup because most accounts never top one up,
 * and a row per user that is permanently zero exists only to be joined against.
 * `upsert` rather than find-then-create so two simultaneous first reads cannot
 * both try to insert.
 */
export async function getWallet(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true },
  });
  if (!user) throw new ApiError(404, 'Account not found');

  return prisma.wallet.upsert({
    where: { userId },
    // The wallet follows the ACCOUNT's currency. A wallet holding INR for a USD
    // account would be a bug that only shows up at the till.
    create: { userId, currency: user.currency },
    update: {},
  });
}

/**
 * Move credits, and write the ledger row that explains the movement.
 *
 * The only function that writes `Wallet.balance`. Everything else goes through
 * here, so there is exactly one place where the balance and the ledger can
 * disagree, and it is a place with a transaction around it.
 *
 * `delta` is signed: positive adds, negative removes.
 */
async function applyEntry(
  tx: Prisma.TransactionClient,
  input: {
    walletId: string;
    type: WalletEntryType;
    delta: number;
    note?: string | null;
    razorpayPaymentId?: string | null;
    razorpayOrderId?: string | null;
  },
) {
  const delta = credits(input.delta);

  // Re-read INSIDE the transaction. The balance read before it opened is a
  // number from the past, and adding to a stale one is how two concurrent
  // top-ups both land on the same starting figure and one of them vanishes.
  const wallet = await tx.wallet.findUniqueOrThrow({
    where: { id: input.walletId },
    select: { balance: true },
  });

  const balanceAfter = credits(wallet.balance + delta);

  // Refuse rather than allow a negative balance. Credits are prepaid: there is
  // no overdraft, and a wallet that can go below zero is a debt the product has
  // no way to collect.
  if (balanceAfter < 0) {
    throw new ApiError(400, 'Not enough credits');
  }

  const entry = await tx.walletEntry.create({
    data: {
      walletId: input.walletId,
      type: input.type,
      amount: delta,
      balanceAfter,
      note: input.note ?? null,
      razorpayPaymentId: input.razorpayPaymentId ?? null,
      razorpayOrderId: input.razorpayOrderId ?? null,
    },
  });

  // `set` rather than `increment`, because balanceAfter is the number already
  // written onto the ledger row and the two must be the same figure. An
  // increment could round differently and leave the statement disagreeing with
  // the balance by a paisa.
  const updated = await tx.wallet.update({
    where: { id: input.walletId },
    data: { balance: balanceAfter },
  });

  return { wallet: updated, entry };
}

/**
 * Start a top-up: a Razorpay order for `amount` rupees.
 *
 * No credits are created here. They are created on verify, once the money is
 * real. An order is only an intent, and a shopper who opens checkout and walks
 * away must not end up with a balance.
 */
export async function createTopupOrder(userId: string, amount: number) {
  const client = requireRazorpay();

  if (!Number.isFinite(amount)) throw new ApiError(400, 'Enter an amount');
  const value = credits(amount);
  if (value < MIN_TOPUP) throw new ApiError(400, `The smallest top-up is ₹${MIN_TOPUP}`);
  if (value > MAX_TOPUP) throw new ApiError(400, `The largest top-up is ₹${MAX_TOPUP.toLocaleString('en-IN')}`);

  const wallet = await getWallet(userId);

  const order = await client.orders.create({
    // Razorpay works in the smallest unit, so rupees become paise. Rounded
    // rather than truncated: 0.1 + 0.2 in paise would otherwise short the
    // charge by one.
    amount: Math.round(value * 100),
    currency: wallet.currency,
    receipt: `wallet_${wallet.id.slice(0, 8)}_${Date.now()}`,
    notes: { kind: 'wallet_topup', userId, walletId: wallet.id },
  });

  return {
    orderId: order.id,
    amount: value,
    currency: wallet.currency,
    keyId: config.razorpay.keyId,
  };
}

/**
 * Finish a top-up: check Razorpay's signature, then credit the wallet.
 *
 * Razorpay signs the handshake as HMAC_SHA256(order_id + "|" + payment_id).
 * A caller who cannot produce that signature has not paid, so the check comes
 * before anything is written.
 */
export async function verifyTopup(
  userId: string,
  orderId: string,
  paymentId: string,
  signature: string,
) {
  const client = requireRazorpay();

  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // timingSafeEqual guards against signature-comparison timing attacks, and the
  // length check guards timingSafeEqual, which throws on a length mismatch.
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) throw new ApiError(400, 'Payment signature verification failed');

  // THE AMOUNT COMES FROM RAZORPAY, NEVER FROM THE CLIENT. A request that got
  // to say how much it had paid would be a request that could mint credits for
  // free, and the signature above proves only that the payment is genuine, not
  // what it was worth.
  const payment = await client.payments.fetch(paymentId);

  if (payment.order_id !== orderId) {
    throw new ApiError(400, 'This payment belongs to a different order');
  }
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    throw new ApiError(400, `Payment is ${payment.status}, not captured`);
  }

  const wallet = await getWallet(userId);

  // The order carries who started it. Without this check a signature and
  // payment id lifted from someone else's successful top-up would credit the
  // thief's wallet: both values reach the client, so neither is a secret.
  if (payment.notes?.walletId && payment.notes.walletId !== wallet.id) {
    throw new ApiError(403, 'This payment was not for your wallet');
  }

  const amount = credits(Number(payment.amount) / 100);

  try {
    return await prisma.$transaction((tx) =>
      applyEntry(tx, {
        walletId: wallet.id,
        type: 'TOPUP',
        delta: amount,
        note: `Added ₹${amount.toLocaleString('en-IN')}`,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
      }),
    );
  } catch (e) {
    // The unique index on razorpayPaymentId fired, so this payment has already
    // been credited. That is a retry or a webhook racing the callback, not an
    // error the shopper should see: hand back the wallet as it stands, which is
    // the answer they were asking for.
    if (isDuplicatePayment(e)) {
      const settled = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const entry = await prisma.walletEntry.findUnique({
        where: { razorpayPaymentId: paymentId },
      });
      return { wallet: settled, entry: entry! };
    }
    throw e;
  }
}

/** P2002 on razorpayPaymentId: this payment is already on the ledger. */
function isDuplicatePayment(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null &&
    (e as { code?: string }).code === 'P2002' &&
    JSON.stringify((e as { meta?: unknown }).meta ?? '').includes('razorpayPaymentId')
  );
}

/**
 * Spend credits.
 *
 * WRITTEN AND TESTED, BUT NOTHING CALLS IT YET. Paying for an order in credits
 * changes escrow (there is no Razorpay capture to hold), refunds (they would
 * have to come back as credits, not to a card) and the 2% fee basis. That is
 * its own piece of work, and shipping half of it would leave orders that
 * settlement does not know how to finish.
 *
 * Takes an optional `tx` so that, when checkout does call it, the spend and the
 * order can commit or fail together. A wallet debited for an order that was
 * never created is the worst outcome available here.
 */
export async function spend(
  userId: string,
  amount: number,
  note: string,
  tx?: Prisma.TransactionClient,
) {
  const value = credits(amount);
  if (!(value > 0)) throw new ApiError(400, 'Enter an amount to spend');

  const wallet = await getWallet(userId);
  const run = (client: Prisma.TransactionClient) =>
    applyEntry(client, { walletId: wallet.id, type: 'SPEND', delta: -value, note });

  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * A page of the statement, newest first.
 *
 * Cursor-paged rather than offset-paged: a statement grows at the end a shopper
 * is reading from, so an offset shifts under them between pages and repeats a
 * row.
 */
export async function listEntries(userId: string, limit = 25, cursor?: string) {
  const wallet = await getWallet(userId);

  const entries = await prisma.walletEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100) + 1, // one extra, to detect a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const capped = Math.min(Math.max(limit, 1), 100);
  const hasMore = entries.length > capped;

  return {
    entries: hasMore ? entries.slice(0, capped) : entries,
    nextCursor: hasMore ? entries[capped - 1].id : null,
  };
}
