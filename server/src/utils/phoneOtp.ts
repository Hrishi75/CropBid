// =============================================================================
// Phone sign-in OTP codes
// =============================================================================
// The passwordless front door: a 6-digit code sent by SMS both proves the
// number and signs the person in, creating the account on first use.
//
// The crypto is deliberately identical to signupOtp.ts (SHA-256 of a uniformly
// random 6-digit code, constant-time compare) and is reused from there rather
// than reimplemented — one hashing routine to audit, not two. What differs is
// the policy, and only the policy lives here:
//
//   TTL 5 min, not 10 — an SMS lands in seconds, unlike an email that can sit
//   in a spam folder. A shorter window is a smaller guessing window.
//   3 attempts, not 5 — retyping 6 digits off a notification is easy, and the
//   number being attacked is a real person's, so the tolerance is tighter.
//
// WHY A HASH AND NOT BCRYPT? A leaked PhoneChallenge row is not a credential:
// it holds a phone number and a code that dies in five minutes. Bcrypt's cost
// would buy nothing an attacker can't get by simply requesting a fresh code.
// =============================================================================

import { generateSignupOtp, hashSignupOtp, signupOtpMatches } from './signupOtp';

export const PHONE_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const PHONE_OTP_MAX_ATTEMPTS = 3;
export const PHONE_OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

/** The raw code goes to the handset; the hash goes into the database. */
export function generatePhoneOtp(): { code: string; codeHash: string } {
  return generateSignupOtp();
}

export function hashPhoneOtp(code: string): string {
  return hashSignupOtp(code);
}

export function phoneOtpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PHONE_OTP_TTL_MS);
}

export function phoneOtpMatches(code: string, codeHash: string): boolean {
  return signupOtpMatches(code, codeHash);
}
