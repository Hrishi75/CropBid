// =============================================================================
// authLimiter key derivation tests
// =============================================================================
// The auth limiter keys on (ip + account) so an attacker can't rotate IPs to
// get unlimited attempts at one account. That only holds if the key reads the
// same body field the login handler does — when phone became the login
// identifier, the limiter kept reading `email`, every login silently collapsed
// into an IP-only bucket, and per-account brute-force protection was off with
// nothing failing. These tests pin the field-reading contract.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { accountKey } from './rateLimiter';

describe('accountKey', () => {
  it('reads the identifier the login handler actually sends', () => {
    // The regression: clients POST { identifier }, not { email }.
    expect(accountKey({ identifier: '+919876543210', password: 'x' })).toBe(':+919876543210');
  });

  it('still reads email from older mobile builds', () => {
    // auth.controller falls back to `email`, so the limiter must too.
    expect(accountKey({ email: 'farmer@cropbid.test', password: 'x' })).toBe(':farmer@cropbid.test');
  });

  it('reads phone from the signup body', () => {
    expect(accountKey({ phone: '+919876543210', name: 'Rajesh' })).toBe(':+919876543210');
  });

  it('gives one bucket to every spelling of the same number', () => {
    // Otherwise an attacker varies the punctuation for a fresh 15 attempts.
    const keys = [
      '+91-9876543210',
      '+91 9876543210',
      '+919876543210',
      '  +91 (98765) 43210  ',
    ].map((identifier) => accountKey({ identifier }));

    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(':+919876543210');
  });

  it('lowercases emails so case changes do not open a new bucket', () => {
    expect(accountKey({ identifier: 'Farmer@CropBid.test' })).toBe(':farmer@cropbid.test');
  });

  it('keeps emails with digits distinct from each other', () => {
    // Guards the "@" branch: normalizing these as phones would reduce both to
    // ":123" and collide two unrelated accounts into one shared limit.
    expect(accountKey({ identifier: 'a123@x.com' })).not.toBe(accountKey({ identifier: 'b123@y.com' }));
  });

  it('falls back to an IP-only bucket when the body names no account', () => {
    // /refresh carries no identifier — it must not throw or invent a key.
    expect(accountKey({ refreshToken: 'abc' })).toBe('');
    expect(accountKey(undefined)).toBe('');
    expect(accountKey({ identifier: '   ' })).toBe('');
    expect(accountKey({ identifier: 42 })).toBe('');
  });
});
