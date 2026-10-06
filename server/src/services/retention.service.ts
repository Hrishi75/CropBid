// =============================================================================
// Retention: personal data that has outlived its purpose
// =============================================================================
// The DPDP Act says personal data is erased once the purpose it was collected
// for is served. Most rows here are erased by the flow that used them: a code
// that is entered is deleted on the spot. This sweeps up the ones nobody came
// back for, which otherwise sat in the database forever under an email or a
// phone number: a sign-in code never entered, a sign-up never finished, a
// reset link never clicked.
//
// Each row is kept a day past its expiry rather than taken the moment it
// lapses, so nothing is deleted from under a person who is part way through
// and asks for a fresh code.
// =============================================================================

import { prisma } from '../lib/prisma';

export const EXPIRED_GRACE_MS = 24 * 60 * 60 * 1000;

export interface PurgeResult {
  phoneChallenges: number;
  pendingSignups: number;
  resetTokens: number;
}

export async function purgeExpiredSignInData(now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - EXPIRED_GRACE_MS);

  const [phoneChallenges, pendingSignups, resetTokens] = await Promise.all([
    prisma.phoneChallenge.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    // Only the hash is stored, and an expired one is refused anyway; clearing
    // it is tidiness, conditioned on the expiry so a fresh link requested a
    // moment ago is never touched.
    prisma.user.updateMany({
      where: { passwordResetExpires: { lt: cutoff } },
      data: { passwordResetToken: null, passwordResetExpires: null },
    }),
  ]);

  return {
    phoneChallenges: phoneChallenges.count,
    pendingSignups: pendingSignups.count,
    resetTokens: resetTokens.count,
  };
}
