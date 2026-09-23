// =============================================================================
// Which accounts an admin can hard-delete
// =============================================================================
// The panel has a Delete button now, so the rule behind it is worth pinning.
// Against a real Postgres, because what matters is what the cascade takes
// with it: a wallet and its entries go with the user row, and a top-up is
// money CropBid took from that person. Deleting it would keep the money and
// lose the record of whose it is.
//
//   1. An account with wallet history is refused, and nothing is deleted.
//   2. An account that never transacted or topped up is deleted.
//   3. The user list says, per row, why an account cannot be deleted, from the
//      same rule, so the panel never offers a delete the server refuses.
//   4. A top-up that commits WHILE the delete runs is not cascaded away with
//      the account.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { deleteUser, getUsers } from './admin.service';

const ADMIN = 'adm-del-admin';
const PLAIN = 'adm-del-plain';
const TOPPED_UP = 'adm-del-wallet';
const EMPTY_WALLET = 'adm-del-empty-wallet';
const EVERYONE = [ADMIN, PLAIN, TOPPED_UP, EMPTY_WALLET];

async function reset() {
  await prisma.user.deleteMany({ where: { id: { in: EVERYONE } } });
}

function user(id: string, role: 'ADMIN' | 'CONSUMER' = 'CONSUMER') {
  return { id, name: `Delete test ${id}`, email: `${id}@test.local`, password: 'x', role };
}

beforeEach(async () => {
  await reset();
  await prisma.user.createMany({
    data: [user(ADMIN, 'ADMIN'), user(PLAIN), user(TOPPED_UP), user(EMPTY_WALLET)],
  });
  await prisma.wallet.create({
    data: {
      userId: TOPPED_UP,
      balance: 500,
      entries: { create: { type: 'TOPUP', amount: 500, balanceAfter: 500, razorpayPaymentId: 'pay_adm_del_test' } },
    },
  });
  // A wallet row with nothing in it is not money: opening the wallet screen
  // makes one.
  await prisma.wallet.create({ data: { userId: EMPTY_WALLET } });
});

afterAll(reset);

describe('deleteUser', () => {
  it('refuses an account that has topped up its wallet, and deletes nothing', async () => {
    await expect(deleteUser(TOPPED_UP, ADMIN)).rejects.toMatchObject({ statusCode: 409 });

    expect(await prisma.user.count({ where: { id: TOPPED_UP } })).toBe(1);
    expect(await prisma.walletEntry.count({ where: { razorpayPaymentId: 'pay_adm_del_test' } })).toBe(1);
  });

  it('deletes an account that never transacted or topped up', async () => {
    await expect(deleteUser(PLAIN, ADMIN)).resolves.toMatchObject({ id: PLAIN });
    expect(await prisma.user.count({ where: { id: PLAIN } })).toBe(0);
  });

  it('deletes an account whose wallet was opened but never used', async () => {
    await expect(deleteUser(EMPTY_WALLET, ADMIN)).resolves.toMatchObject({ id: EMPTY_WALLET });
    expect(await prisma.user.count({ where: { id: EMPTY_WALLET } })).toBe(0);
  });

  it('refuses an admin account', async () => {
    const other = 'adm-del-admin-2';
    await prisma.user.create({ data: user(other, 'ADMIN') });
    try {
      await expect(deleteUser(other, ADMIN)).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await prisma.user.deleteMany({ where: { id: other } });
    }
  });
});

// The check used to run outside the delete transaction, so an account with no
// entries at that moment could be deleted a moment after one was paid for,
// taking the ledger row with it. Ten rounds, because a single round of this
// passes on the broken code whenever the two happen not to overlap.
describe('a top-up landing mid-delete', () => {
  it('survives, ten times over', async () => {
    for (let round = 0; round < 10; round++) {
      await prisma.user.deleteMany({ where: { id: PLAIN } });
      await prisma.user.create({ data: user(PLAIN) });
      const wallet = await prisma.wallet.create({ data: { userId: PLAIN } });

      // What applyEntry does: lock the wallet row, then write the entry.
      const topUp = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
        await new Promise((r) => setTimeout(r, 60));
        await tx.walletEntry.create({
          data: { walletId: wallet.id, type: 'TOPUP', amount: 100, balanceAfter: 100, razorpayPaymentId: `pay_del_race_${round}` },
        });
      });

      await new Promise((r) => setTimeout(r, 20));
      const outcome = await deleteUser(PLAIN, ADMIN).then(() => 'deleted').catch(() => 'refused');
      await topUp;

      expect(outcome).toBe('refused');
      expect(await prisma.walletEntry.count({ where: { razorpayPaymentId: `pay_del_race_${round}` } })).toBe(1);
      expect(await prisma.user.count({ where: { id: PLAIN } })).toBe(1);
    }
  }, 30000);
});

describe('the user list', () => {
  it('says why each account cannot be deleted, and sends no counts', async () => {
    const { users } = await getUsers('adm-del-', undefined, 50, 0);
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));

    expect(byId[PLAIN].deleteBlocker).toBeNull();
    expect(byId[EMPTY_WALLET].deleteBlocker).toBeNull();
    expect(byId[TOPPED_UP].deleteBlocker).toBe('WALLET');
    expect(byId[ADMIN].deleteBlocker).toBe('ADMIN');
    expect(byId[PLAIN]).not.toHaveProperty('_count');
    expect(byId[PLAIN]).not.toHaveProperty('wallet');
  });
});
