// =============================================================================
// resetToken tests — token generation, hashing, expiry
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  RESET_TOKEN_TTL_MS,
} from './resetToken';

describe('generateResetToken', () => {
  it('returns a 64-char hex token whose hash matches hashResetToken', () => {
    const { token, tokenHash } = generateResetToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes as hex
    expect(tokenHash).toBe(hashResetToken(token));
  });

  it('never stores the raw token as the hash', () => {
    const { token, tokenHash } = generateResetToken();
    expect(tokenHash).not.toBe(token);
  });

  it('generates a unique token every call', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateResetToken().token),
    );
    expect(tokens.size).toBe(100);
  });
});

describe('hashResetToken', () => {
  it('is deterministic — same input, same hash', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
  });

  it('different tokens produce different hashes', () => {
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
});

describe('resetTokenExpiry', () => {
  it('expires exactly RESET_TOKEN_TTL_MS after the given time', () => {
    const now = new Date('2026-07-03T10:00:00Z');
    expect(resetTokenExpiry(now).getTime()).toBe(now.getTime() + RESET_TOKEN_TTL_MS);
  });

  it('has a 1-hour TTL', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});
