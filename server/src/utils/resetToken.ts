// =============================================================================
// Password Reset Tokens
// =============================================================================
// THE PATTERN (industry standard):
//   1. Generate a random token, email it to the user inside a link.
//   2. Store ONLY the SHA-256 hash of the token in the database.
//   3. When the link is used, hash the presented token and look up the hash.
//
// WHY HASH IT? If the database leaks, raw tokens would let an attacker reset
// any account with a pending request. Hashes are useless to them — SHA-256
// can't be reversed, and 32 random bytes can't be brute-forced.
//
// WHY SHA-256 AND NOT BCRYPT? Bcrypt exists to slow down guessing of
// low-entropy secrets (human passwords). This token has 256 bits of entropy,
// so a fast hash is safe — and it lets us look the user up by hash directly.
// =============================================================================

import crypto from 'crypto';

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// The raw token goes into the email; the hash goes into the database.
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}
