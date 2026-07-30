// =============================================================================
// Signup OTP codes
// =============================================================================
// Buyer signup is a two-step flow: the details go into a PendingSignup row and
// a 6-digit code goes to the email address. No User row exists until the code
// comes back, so an unverified address can never occupy the unique email index.
//
// WHY 6 DIGITS AND NOT A LONG TOKEN? People retype this from their inbox by
// hand. The entropy shortfall is covered operationally instead: the code lives
// for 10 minutes, survives 5 wrong guesses, and the route sits behind
// authLimiter — so an attacker gets nowhere near the 10^6 guesses they'd need.
//
// WHY SHA-256 AND NOT BCRYPT? Same reasoning as resetToken.ts, but the entropy
// argument runs the other way, so it's worth stating. A 6-digit code IS weak
// enough to brute-force offline if the table ever leaked. That doesn't buy an
// attacker anything here: a leaked PendingSignup row already contains the name,
// phone and email it would create, and the password is a bcrypt hash the
// attacker chose. The row is not a credential to anything that already exists.
// =============================================================================

import crypto from 'crypto';

export const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const SIGNUP_OTP_MAX_ATTEMPTS = 5;
export const SIGNUP_OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

// The raw code goes into the email; the hash goes into the database.
export function generateSignupOtp(): { code: string; codeHash: string } {
  // randomInt is uniform over the range — "% 1000000" on random bytes is not,
  // and would make low codes measurably likelier.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, codeHash: hashSignupOtp(code) };
}

export function hashSignupOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function signupOtpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SIGNUP_OTP_TTL_MS);
}

// Constant-time compare so a timing side-channel can't leak the code digit by
// digit. Both sides are fixed-length hex, so a length mismatch means the stored
// value is corrupt — treat it as a miss rather than letting timingSafeEqual
// throw on differing buffer lengths.
export function signupOtpMatches(code: string, codeHash: string): boolean {
  const presented = Buffer.from(hashSignupOtp(code), 'hex');
  const stored = Buffer.from(codeHash, 'hex');
  if (presented.length !== stored.length) return false;
  return crypto.timingSafeEqual(presented, stored);
}
