// =============================================================================
// One open nag, however many captures land at once
// =============================================================================
// A seller who cannot be paid is asked for a UPI id or a bank account when
// money first reaches escrow for them, and asked once: a shop with six orders
// in a morning getting six identical notifications is how a bell stops being
// read.
//
// Against a REAL Postgres, because what holds the rule is an advisory lock and
// a mocked client would only prove this file calls itself. Review caught the
// version before this: looking for an unread nag and then writing one are two
// statements, and two captures landing together both looked, both found
// nothing, and both wrote.
//
// THE RACE TEST LOOPS. A single round passes on the broken code, because the
// first pair of transactions in a fresh process spends its time opening
// connections and accidentally serialises. Ten rounds is where it fails.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { notifySellersMissingPayoutDetails } from './notification.helpers';

const SELLER = 'nag-seller';
const PAYABLE = 'nag-payable';
const ALL = [SELLER, PAYABLE];

const NAG = { type: 'PAYOUT_DETAILS_MISSING' } as const;

async function seedSeller(id: string, payout: Record<string, string> = {}) {
  await prisma.user.create({
    data: { id, name: id, email: `${id}@test.local`, password: 'x', role: 'FARMER' },
  });
  await prisma.farmerProfile.create({
    data: { id, userId: id, state: 'Maharashtra', ...payout },
  });
}

const nagsFor = (userId: string) =>
  prisma.notification.count({ where: { userId, ...NAG, read: false } });

async function reset() {
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.farmerProfile.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await reset();
  await seedSeller(SELLER);
  // A seller who can be paid, to prove the nag is about the account and not
  // about having sold something.
  await seedSeller(PAYABLE, { payoutUpiId: 'ramesh@okhdfc' });
});

afterAll(reset);

describe('asking a seller for somewhere to send their money', () => {
  it('asks once when money first arrives', async () => {
    await notifySellersMissingPayoutDetails([SELLER]);

    expect(await nagsFor(SELLER)).toBe(1);
  });

  it('says nothing to a seller who can already be paid', async () => {
    await notifySellersMissingPayoutDetails([PAYABLE]);

    expect(await nagsFor(PAYABLE)).toBe(0);
  });

  it('does not ask again while the first is unread', async () => {
    await notifySellersMissingPayoutDetails([SELLER]);
    await notifySellersMissingPayoutDetails([SELLER]);
    // The same seller twice in one basket, which is one payment covering two
    // of their shop orders.
    await notifySellersMissingPayoutDetails([SELLER, SELLER]);

    expect(await nagsFor(SELLER)).toBe(1);
  });

  // The nag is the whole mechanism by which details arrive before they are
  // needed, so it has to come back once the seller has stopped looking at it.
  it('asks again after the seller has read it and still not added anything', async () => {
    await notifySellersMissingPayoutDetails([SELLER]);
    await prisma.notification.updateMany({ where: { userId: SELLER }, data: { read: true } });

    await notifySellersMissingPayoutDetails([SELLER]);

    expect(await nagsFor(SELLER)).toBe(1);
    expect(await prisma.notification.count({ where: { userId: SELLER, ...NAG } })).toBe(2);
  });

  it('stops once there is somewhere to send the money', async () => {
    await notifySellersMissingPayoutDetails([SELLER]);
    await prisma.notification.updateMany({ where: { userId: SELLER }, data: { read: true } });
    await prisma.farmerProfile.update({
      where: { userId: SELLER },
      data: { payoutUpiId: 'ramesh@okhdfc' },
    });

    await notifySellersMissingPayoutDetails([SELLER]);

    expect(await nagsFor(SELLER)).toBe(0);
  });

  // Two payments captured at the same moment, which is an ordinary Saturday
  // for a shop: a webhook and a browser callback, or simply two shoppers.
  it('asks once when four captures land together, over and over', async () => {
    for (let round = 0; round < 10; round += 1) {
      await prisma.notification.deleteMany({ where: { userId: SELLER } });

      await Promise.all([
        notifySellersMissingPayoutDetails([SELLER]),
        notifySellersMissingPayoutDetails([SELLER]),
        notifySellersMissingPayoutDetails([SELLER]),
        notifySellersMissingPayoutDetails([SELLER]),
      ]);

      expect(await nagsFor(SELLER)).toBe(1);
    }
  });

  // Two different shops have no reason to wait on each other, and both are
  // owed the ask.
  it('asks each unpayable seller in a batch', async () => {
    await prisma.farmerProfile.update({ where: { userId: PAYABLE }, data: { payoutUpiId: null } });

    await notifySellersMissingPayoutDetails([SELLER, PAYABLE]);

    expect(await nagsFor(SELLER)).toBe(1);
    expect(await nagsFor(PAYABLE)).toBe(1);
  });
});
