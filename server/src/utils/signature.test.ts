import { describe, it, expect } from 'vitest';
import { signatureMatches } from './signature';

const HEX = 'a'.repeat(64);

describe('signatureMatches', () => {
  it('matches the same signature', () => {
    expect(signatureMatches(HEX, HEX)).toBe(true);
  });

  it('refuses a different one', () => {
    expect(signatureMatches(HEX, 'b'.repeat(64))).toBe(false);
  });

  // Same string length, different byte length: the old guard compared string
  // lengths, so timingSafeEqual threw and the request came back as a 500.
  it('refuses a multi-byte signature of the right string length without throwing', () => {
    expect(() => signatureMatches(HEX, 'é' + 'a'.repeat(63))).not.toThrow();
    expect(signatureMatches(HEX, 'é' + 'a'.repeat(63))).toBe(false);
  });

  it('refuses a missing one', () => {
    expect(signatureMatches(HEX, undefined)).toBe(false);
    expect(signatureMatches(HEX, '')).toBe(false);
  });
});
