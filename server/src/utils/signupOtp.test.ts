// =============================================================================
// signupOtp tests — code generation and comparison
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  generateSignupOtp,
  hashSignupOtp,
  signupOtpExpiry,
  signupOtpMatches,
  SIGNUP_OTP_TTL_MS,
} from './signupOtp';

describe('generateSignupOtp', () => {
  it('always produces exactly six digits', () => {
    // padStart matters: randomInt can return 42, and "42" is not a code anyone
    // can type into a six-box input.
    for (let i = 0; i < 200; i++) {
      expect(generateSignupOtp().code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('returns the hash of the code it generated', () => {
    const { code, codeHash } = generateSignupOtp();
    expect(codeHash).toBe(hashSignupOtp(code));
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateSignupOtp().code));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe('signupOtpMatches', () => {
  it('accepts the right code', () => {
    const { code, codeHash } = generateSignupOtp();
    expect(signupOtpMatches(code, codeHash)).toBe(true);
  });

  it('rejects the wrong code', () => {
    const { code, codeHash } = generateSignupOtp();
    const wrong = code === '000000' ? '111111' : '000000';
    expect(signupOtpMatches(wrong, codeHash)).toBe(false);
  });

  it('returns false rather than throwing on a corrupt stored hash', () => {
    // timingSafeEqual throws on differing buffer lengths, which would surface as
    // a 500 on a verify attempt instead of a plain "wrong code".
    expect(() => signupOtpMatches('123456', 'not-a-hash')).not.toThrow();
    expect(signupOtpMatches('123456', 'not-a-hash')).toBe(false);
    expect(signupOtpMatches('123456', '')).toBe(false);
  });
});

describe('signupOtpExpiry', () => {
  it('sits one TTL ahead of the given moment', () => {
    const now = new Date('2026-07-29T10:00:00Z');
    expect(signupOtpExpiry(now).getTime()).toBe(now.getTime() + SIGNUP_OTP_TTL_MS);
  });
});
