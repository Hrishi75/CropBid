// =============================================================================
// Adding a phone to an account with none (the Google sign-in prompt)
// =============================================================================
// Against a real Postgres, because "taken" is decided by SQL over the stored
// numbers, which are kept in whatever form people typed.
// =============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { addPhone } from './auth.service';

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
});
