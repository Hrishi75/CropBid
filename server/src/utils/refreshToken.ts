// =============================================================================
// Refresh Tokens: stored as a hash, never as themselves
// =============================================================================
// A refresh token is a live credential. Holding one is enough to mint access
// tokens for that account until it is rotated or revoked, so a database that
// stores them in the clear hands whoever reads it a working session for every
// signed-in user: a backup, a dump, a support query, a leak.
//
// So the database stores only the SHA-256 of the token, exactly as it does for
// password reset tokens (utils/resetToken.ts) and sign-in codes
// (utils/signupOtp.ts). The raw token lives in the httpOnly cookie, or in the
// app's secure storage, and nowhere else.
//
// WHY SHA-256 AND NOT BCRYPT. Bcrypt exists to slow down guessing of
// low-entropy secrets that humans choose. This is a signed JWT carrying 256
// bits of signature, not something anyone guesses, and it is verified on every
// refresh: a slow hash would tax the hot path for no gain. Same reasoning the
// reset token file spells out.
//
// WHAT THE HASH IS NOT GOOD FOR. It cannot be replayed as a token itself:
// refresh() verifies the JWT signature BEFORE it compares anything, and a
// SHA-256 digest is not a signed JWT. Stealing the column gets an attacker
// nothing they can present.
// =============================================================================

import crypto from 'crypto';

/** What goes in the database for a given refresh token. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Does `token` match what was stored for this user?
 *
 * Constant time, so the comparison cannot be used to learn the stored hash a
 * character at a time. Same guard as the Razorpay signature check, and free
 * here: both sides are fixed-length hex.
 */
export function refreshTokenMatches(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const presented = Buffer.from(hashRefreshToken(token));
  const stored = Buffer.from(storedHash);
  return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
}
