// =============================================================================
// signatureMatches: constant-time compare of a Razorpay signature
// =============================================================================
// timingSafeEqual throws when its two buffers differ in length, and the three
// call sites used to guard it by comparing STRING lengths. A signature with a
// multi-byte character has the right string length and the wrong byte length,
// so it threw, and a forged signature came back as a 500 instead of a refusal.
// The lengths compared here are the buffers' own.

import crypto from 'crypto';

export function signatureMatches(expected: string, given: string | undefined | null): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
