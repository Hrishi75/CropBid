// =============================================================================
// Phone sign-in OTP tests
// =============================================================================
// A 6-digit code is the ONLY thing standing between a phone number and a
// session, so the properties that make it safe are worth pinning down: the
// code is uniform over the whole range, only its hash is ever storable, the
// comparison is by hash rather than by value, and the policy numbers are
// tighter than the email flow's on purpose.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  PHONE_OTP_MAX_ATTEMPTS,
  PHONE_OTP_RESEND_COOLDOWN_MS,
  PHONE_OTP_TTL_MS,
  generatePhoneOtp,
  hashPhoneOtp,
  phoneOtpExpiry,
  phoneOtpMatches,
} from './phoneOtp';
import { SIGNUP_OTP_MAX_ATTEMPTS, SIGNUP_OTP_TTL_MS } from './signupOtp';

describe('generatePhoneOtp', () => {
  it('always produces exactly six digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePhoneOtp().code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('pads low numbers rather than shortening the code', () => {
    // "42" must be sent as "000042" — a 2-character code would be trivially
    // guessable and would fail the client's six-digit validation.
    const codes = Array.from({ length: 400 }, () => generatePhoneOtp().code);
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  it('returns the hash of its own code, never the code itself', () => {
    const { code, codeHash } = generatePhoneOtp();
    expect(codeHash).toBe(hashPhoneOtp(code));
    expect(codeHash).not.toContain(code);
    expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat itself across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generatePhoneOtp().code));
    // 50 draws from a million-wide space: collisions are possible but a single
    // repeated value across all 50 would mean the generator is stuck.
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('phoneOtpMatches', () => {
  it('accepts the code that produced the hash', () => {
    const { code, codeHash } = generatePhoneOtp();
    expect(phoneOtpMatches(code, codeHash)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const { code, codeHash } = generatePhoneOtp();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(phoneOtpMatches(wrong, codeHash)).toBe(false);
  });

  it('returns false instead of throwing on a corrupt stored hash', () => {
    // timingSafeEqual throws on differing buffer lengths; a truncated column
    // value must read as a miss, not crash the sign-in endpoint.
    expect(phoneOtpMatches('123456', 'deadbeef')).toBe(false);
    expect(phoneOtpMatches('123456', '')).toBe(false);
  });
});

describe('phoneOtpExpiry', () => {
  it('expires TTL milliseconds after the given moment', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(phoneOtpExpiry(now).getTime()).toBe(now.getTime() + PHONE_OTP_TTL_MS);
  });
});

describe('phone OTP policy', () => {
  // These are deliberate differences from the email flow, documented in
  // phoneOtp.ts. If someone loosens them, this test should make them say why.
  it('is shorter-lived and less forgiving than the email code', () => {
    expect(PHONE_OTP_TTL_MS).toBeLessThan(SIGNUP_OTP_TTL_MS);
    expect(PHONE_OTP_MAX_ATTEMPTS).toBeLessThan(SIGNUP_OTP_MAX_ATTEMPTS);
  });

  it('leaves a resend cooldown well inside the code lifetime', () => {
    // A cooldown longer than the TTL would strand someone: the code they hold
    // would die before they were allowed to ask for another.
    expect(PHONE_OTP_RESEND_COOLDOWN_MS).toBeGreaterThan(0);
    expect(PHONE_OTP_RESEND_COOLDOWN_MS).toBeLessThan(PHONE_OTP_TTL_MS);
  });
});
