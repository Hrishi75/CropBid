// =============================================================================
// Payout details stored in the clear are encrypted at boot
// =============================================================================
// On a real Postgres, because the sweep's WHERE clauses are the whole of it:
// it must find every row with a clear value, leave sealed ones alone, and
// never overwrite details a seller saved while it was running.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'crypto';

const { key } = vi.hoisted(() => ({ key: { value: '' } }));
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    config: new Proxy(actual.config, {
      get: (target, prop) => (prop === 'payoutEncryptionKey' ? key.value : Reflect.get(target, prop)),
    }),
  };
});

import { prisma } from '../lib/prisma';
import { countSealedPayoutDetails, encryptStoredPayoutDetails } from './payoutDetails';
import { isSealed, open, seal } from '../utils/fieldCrypto';

const TAG = 'payout-encrypt-test';

async function clean() {
  await prisma.farmerProfile.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function seller(n: number, payout: Record<string, string | null>) {
  const user = await prisma.user.create({ data: { email: `${TAG}-${n}@x.test`, name: 's', role: 'FARMER' } });
  return prisma.farmerProfile.create({ data: { userId: user.id, state: 'Maharashtra', ...payout } });
}

beforeEach(async () => {
  key.value = randomBytes(32).toString('base64');
  await clean();
});
afterAll(clean);

describe('encryptStoredPayoutDetails', () => {
  it('encrypts clear values, leaves sealed ones, and keeps IFSC readable', async () => {
    const clear = await seller(1, {
      payoutUpiId: 'ramesh@okhdfc', payoutAccountName: 'Ramesh Patil',
      payoutAccountNumber: '50100123456789', payoutIfsc: 'HDFC0001234',
    });
    const alreadySealed = seal('sita@ybl')!;
    const sealed = await seller(2, { payoutUpiId: alreadySealed });
    const none = await seller(3, {});

    const count = await encryptStoredPayoutDetails();
    expect(count).toBe(1);

    const after = await prisma.farmerProfile.findUniqueOrThrow({ where: { id: clear.id } });
    expect(isSealed(after.payoutUpiId)).toBe(true);
    expect(isSealed(after.payoutAccountName)).toBe(true);
    expect(isSealed(after.payoutAccountNumber)).toBe(true);
    expect(open(after.payoutAccountNumber)).toBe('50100123456789');
    expect(after.payoutIfsc).toBe('HDFC0001234');

    expect((await prisma.farmerProfile.findUniqueOrThrow({ where: { id: sealed.id } })).payoutUpiId).toBe(alreadySealed);
    expect((await prisma.farmerProfile.findUniqueOrThrow({ where: { id: none.id } })).payoutUpiId).toBeNull();

    // A second run has nothing to do.
    expect(await encryptStoredPayoutDetails()).toBe(0);
  });

  it('does nothing without a key', async () => {
    key.value = '';
    const row = await seller(4, { payoutUpiId: 'ramesh@okhdfc' });
    expect(await encryptStoredPayoutDetails()).toBe(0);
    expect((await prisma.farmerProfile.findUniqueOrThrow({ where: { id: row.id } })).payoutUpiId).toBe('ramesh@okhdfc');
  });
});

// Boot refuses to start without the key once anything is encrypted, and this
// count is what it asks. Plain rows must not count, or a server that never had
// a key could never start.
describe('countSealedPayoutDetails', () => {
  it('counts encrypted rows and nothing else', async () => {
    await seller(5, { payoutUpiId: 'plain@okhdfc' });
    expect(await countSealedPayoutDetails()).toBe(0);
    await seller(6, { payoutAccountNumber: seal('50100123456789') });
    expect(await countSealedPayoutDetails()).toBeGreaterThanOrEqual(1);
  });
});
