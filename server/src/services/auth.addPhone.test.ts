// =============================================================================
// Adding a phone to an account with none (the Google sign-in prompt)
// =============================================================================
// Against a real Postgres, because "taken" is decided by SQL over the stored
// numbers, which are kept in whatever form people typed.
// =============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { addPhone, signup } from './auth.service';

const DOMAIN = '@add-phone.test';
const NAME = 'add-phone-test';

async function cleanUp() {
  await prisma.user.deleteMany({ where: { OR: [{ email: { endsWith: DOMAIN } }, { name: NAME }] } });
}

beforeEach(cleanUp);
afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

const googleAccount = () =>
  prisma.user.create({ data: { name: 'Asha', email: `asha${DOMAIN}`, googleId: 'sub-add-phone', role: 'CONSUMER' } });
const holder = (phone: string) =>
  prisma.user.create({ data: { name: NAME, phone, password: 'hash', role: 'CONSUMER' } });

describe('addPhone', () => {
  it('stores the number the way sign-up does, so sign-in finds it typed the same way', async () => {
    const me = await googleAccount();
    const user = await addPhone(me.id, '+91 98765 43210');
    expect(user.phone).toBe('+919876543210');
  });

  it.each(['9876543210', '+919876543210', '09876543210'])(
    'refuses a number already on another account as %s, whatever form it is typed in',
    async (stored) => {
      await holder(stored);
      const me = await googleAccount();
      await expect(addPhone(me.id, '+91 98765-43210')).rejects.toMatchObject({ statusCode: 409, code: 'PHONE_TAKEN' });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).phone).toBeNull();
    },
  );

  it('accepts the same number twice, and never replaces a different one', async () => {
    const me = await googleAccount();
    await addPhone(me.id, '9876543210');
    await expect(addPhone(me.id, '9876543210')).resolves.toMatchObject({ phone: '9876543210' });
    await expect(addPhone(me.id, '9123456789')).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).phone).toBe('9876543210');
  });

  // Ten rounds, naming the winner: one round alone can pass by accident while
  // connections are still being opened (CLAUDE.md section 9, address book).
  it('gives one number to one account when two save it at once in different forms', async () => {
    for (let round = 0; round < 10; round++) {
      await cleanUp();
      const a = await prisma.user.create({ data: { name: NAME, email: `a${DOMAIN}`, googleId: 'sub-a', role: 'CONSUMER' } });
      const b = await prisma.user.create({ data: { name: NAME, email: `b${DOMAIN}`, googleId: 'sub-b', role: 'CONSUMER' } });
      const results = await Promise.allSettled([addPhone(a.id, '+919876543210'), addPhone(b.id, '9876543210')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const holders = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] }, phone: { not: null } } });
      expect(holders).toHaveLength(1);
      const winner = results[0].status === 'fulfilled' ? a.id : b.id;
      expect(holders[0].id).toBe(winner);
    }
  });

  // Sign-up holds the same lock, so two sign-ups typing one number two ways,
  // or a sign-up racing a save from the prompt, end with one holder.
  it('gives one number to one account when two sign up with it at once in different forms', async () => {
    for (let round = 0; round < 10; round++) {
      await cleanUp();
      const make = (phone: string) =>
        signup({ name: NAME, phone, password: 'Sup3rSecret', consent: true });
      const results = await Promise.allSettled([make('+919876543210'), make('9876543210')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const holders = await prisma.user.findMany({ where: { name: NAME } });
      expect(holders).toHaveLength(1);
      const winner = results[0].status === 'fulfilled' ? '+919876543210' : '9876543210';
      expect(holders[0].phone).toBe(winner);
    }
    // Twenty sign-ups, each hashing a password at bcrypt cost 12 on purpose:
    // over vitest's 5 seconds on a CI runner.
  }, 60_000);
});
