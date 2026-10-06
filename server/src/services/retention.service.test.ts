// =============================================================================
// Expired sign-in data is deleted, and nothing live is
// =============================================================================
// Runs on a real Postgres, because what matters is the WHERE clause: a sweep
// that deleted a code still inside its window would lock a person out mid
// sign-in, and one that matched nothing would pass any mock.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { purgeExpiredSignInData, EXPIRED_GRACE_MS } from './retention.service';

const NOW = new Date('2026-10-05T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const TAG = 'retention-test';

async function clean() {
  await prisma.phoneChallenge.deleteMany({ where: { phone: { startsWith: TAG } } });
  await prisma.pendingSignup.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
}

beforeEach(clean);
afterAll(clean);

describe('purgeExpiredSignInData', () => {
  it('deletes rows expired past the grace period and keeps the rest', async () => {
    const old = ago(EXPIRED_GRACE_MS + 60_000);
    const recent = ago(60_000); // expired, but inside the day's grace
    const live = new Date(NOW.getTime() + 5 * 60_000);

    await prisma.phoneChallenge.createMany({
      data: [
        { phone: `${TAG}-old`, codeHash: 'x', expiresAt: old },
        { phone: `${TAG}-recent`, codeHash: 'x', expiresAt: recent },
        { phone: `${TAG}-live`, codeHash: 'x', expiresAt: live },
      ],
    });
    await prisma.pendingSignup.createMany({
      data: [
        { email: `${TAG}-old@x.test`, phone: '1', name: 'a', password: 'h', role: 'CONSUMER', codeHash: 'x', expiresAt: old },
        { email: `${TAG}-live@x.test`, phone: '2', name: 'b', password: 'h', role: 'CONSUMER', codeHash: 'x', expiresAt: live },
      ],
    });
    await prisma.user.createMany({
      data: [
        { email: `${TAG}-u-old@x.test`, name: 'a', role: 'CONSUMER', passwordResetToken: `${TAG}-t1`, passwordResetExpires: old },
        { email: `${TAG}-u-live@x.test`, name: 'b', role: 'CONSUMER', passwordResetToken: `${TAG}-t2`, passwordResetExpires: live },
      ],
    });

    const result = await purgeExpiredSignInData(NOW);
    expect(result).toEqual({ phoneChallenges: 1, pendingSignups: 1, resetTokens: 1 });

    const phones = (await prisma.phoneChallenge.findMany({ where: { phone: { startsWith: TAG } } })).map((r) => r.phone);
    expect(phones.sort()).toEqual([`${TAG}-live`, `${TAG}-recent`]);

    const signups = (await prisma.pendingSignup.findMany({ where: { email: { startsWith: TAG } } })).map((r) => r.email);
    expect(signups).toEqual([`${TAG}-live@x.test`]);

    const token = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).passwordResetToken;
    expect(await token(`${TAG}-u-old@x.test`)).toBeNull();
    expect(await token(`${TAG}-u-live@x.test`)).toBe(`${TAG}-t2`);
  });
});
