// =============================================================================
// Sign in with Google: who it finds, who it links, who it refuses
// =============================================================================
// Google itself is stood in for (verifyGoogleIdToken is mocked): what is under
// test is what the database holds afterwards, so this runs against a real
// Postgres like the address book does. The link is a conditional write, and the
// only way to know it holds when two first sign-ins race is to commit and look.
// =============================================================================
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../utils/googleIdToken', () => ({ verifyGoogleIdToken: vi.fn() }));

import { prisma } from '../lib/prisma';
import { verifyGoogleIdToken } from '../utils/googleIdToken';
import { signInWithGoogle } from './auth.service';
import { hashRefreshToken } from '../utils/refreshToken';

const verify = verifyGoogleIdToken as unknown as ReturnType<typeof vi.fn>;
const DOMAIN = '@google-signin.test';
const SUB = 'google-sub-asha';

function googleSays(email: string, sub = SUB, name: string | null = 'Asha Patil') {
  verify.mockResolvedValue({ sub, email, name });
}

async function cleanUp() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  verify.mockReset();
  await cleanUp();
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('a new person', () => {
  it('gets a shopper account with no password, linked to their Google id', async () => {
    googleSays(`Asha${DOMAIN}`);
    const result = await signInWithGoogle('token');

    expect(result.created).toBe(true);
    const row = await prisma.user.findFirstOrThrow({ where: { googleId: SUB } });
    expect(row).toMatchObject({ role: 'CONSUMER', password: null, name: 'Asha Patil', email: `asha${DOMAIN}` });
    expect(row.refreshToken).toBe(hashRefreshToken(result.refreshToken));
  });

  it('never sends the Google id back', async () => {
    googleSays(`asha${DOMAIN}`);
    const result = await signInWithGoogle('token');
    expect(result.user).not.toHaveProperty('googleId');
    expect(result.user).not.toHaveProperty('password');
  });

  it('is named after their email when Google gives no name', async () => {
    googleSays(`kisan.r${DOMAIN}`, SUB, null);
    await signInWithGoogle('token');
    expect((await prisma.user.findFirstOrThrow({ where: { googleId: SUB } })).name).toBe('kisan.r');
  });

  it('comes back to the same account next time', async () => {
    googleSays(`asha${DOMAIN}`);
    const first = await signInWithGoogle('token');
    const second = await signInWithGoogle('token');
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });
});

describe('an account that already has the email', () => {
  async function passwordAccount(email: string, extra: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { name: 'Asha', email, password: 'hash', role: 'CONSUMER', refreshToken: 'old-session', ...extra },
    });
  }

  it('is linked and signed in, whatever the case of the stored address', async () => {
    const existing = await passwordAccount(`Asha${DOMAIN}`);
    googleSays(`asha${DOMAIN}`);

    const result = await signInWithGoogle('token');

    expect(result).toMatchObject({ created: false });
    expect(result.user.id).toBe(existing.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(row.googleId).toBe(SUB);
    // The password still works; the earlier session does not.
    expect(row.password).toBe('hash');
    expect(row.refreshToken).toBe(hashRefreshToken(result.refreshToken));
    expect(await prisma.auditLog.count({ where: { entityId: existing.id, action: 'auth.google.linked' } })).toBe(1);
  });

  it('is found by Google id even after the Google address changes', async () => {
    const existing = await passwordAccount(`asha${DOMAIN}`, { googleId: SUB });
    googleSays(`asha.new${DOMAIN}`);
    const result = await signInWithGoogle('token');
    expect(result.user.id).toBe(existing.id);
  });

  it('is refused when it is linked to a different Google account', async () => {
    await passwordAccount(`asha${DOMAIN}`, { googleId: 'somebody-else' });
    googleSays(`asha${DOMAIN}`);
    await expect(signInWithGoogle('token')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('is refused when it is an admin', async () => {
    const admin = await passwordAccount(`asha${DOMAIN}`, { role: 'ADMIN' });
    googleSays(`asha${DOMAIN}`);
    await expect(signInWithGoogle('token')).rejects.toMatchObject({ statusCode: 403 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).googleId).toBeNull();
  });

  it('is refused when it is suspended, and not linked', async () => {
    const suspended = await passwordAccount(`asha${DOMAIN}`, { suspended: true });
    googleSays(`asha${DOMAIN}`);
    await expect(signInWithGoogle('token')).rejects.toMatchObject({ statusCode: 403 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: suspended.id } })).googleId).toBeNull();
  });

  // Two first sign-ins at once both find the account by email with no link.
  // Two different Google accounts (an address can move between them) must not
  // both get in: exactly one is linked and holds the session, and the other is
  // told to try again, which then refuses it as a different Google account.
  // Ten rounds asserting who won, because one round can serialise by accident.
  it('is linked to exactly one Google account when two race for it', async () => {
    verify.mockImplementation(async (credential: string) => ({
      sub: `sub-${credential}`, email: `asha${DOMAIN}`, name: 'Asha',
    }));
    for (let round = 0; round < 10; round++) {
      await cleanUp();
      const existing = await passwordAccount(`asha${DOMAIN}`);

      const results = await Promise.allSettled([signInWithGoogle('a'), signInWithGoogle('b')]);

      const won = results.flatMap((r, i) => (r.status === 'fulfilled' ? [{ i, value: r.value }] : []));
      expect(won).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ statusCode: 409 });

      const row = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
      expect(row.googleId).toBe(`sub-${['a', 'b'][won[0].i]}`);
      expect(row.refreshToken).toBe(hashRefreshToken(won[0].value.refreshToken));
    }
  });
});
