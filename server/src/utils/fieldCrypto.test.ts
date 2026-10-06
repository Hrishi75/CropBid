// =============================================================================
// Payout details encrypted at rest
// =============================================================================
// What has to hold: a sealed value never contains the plaintext, opens back to
// it, and a value written before encryption existed still reads. And with no
// key, nothing changes, so a deploy that forgot the key keeps working.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';

const { mockConfig } = vi.hoisted(() => ({ mockConfig: { payoutEncryptionKey: '' } }));
vi.mock('../config', () => ({ config: mockConfig }));

import { open, seal, isSealed, assertEncryptionKeyValid } from './fieldCrypto';
import { maskPayoutDetails, sealPayoutColumns } from '../services/payoutDetails';

const ACCOUNT = '50100123456789';

beforeEach(() => {
  mockConfig.payoutEncryptionKey = randomBytes(32).toString('base64');
});

describe('seal and open', () => {
  it('hides the value and opens back to it', () => {
    const sealed = seal(ACCOUNT)!;
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain(ACCOUNT);
    expect(open(sealed)).toBe(ACCOUNT);
  });

  it('never seals the same value to the same text', () => {
    expect(seal(ACCOUNT)).not.toBe(seal(ACCOUNT));
  });

  it('reads a value stored before encryption was switched on', () => {
    expect(open(ACCOUNT)).toBe(ACCOUNT);
  });

  it('does not seal twice', () => {
    const once = seal(ACCOUNT)!;
    expect(seal(once)).toBe(once);
  });

  it('refuses a value tampered with in the database', () => {
    const sealed = seal(ACCOUNT)!;
    const raw = Buffer.from(sealed.slice('enc:v1:'.length), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => open('enc:v1:' + raw.toString('base64'))).toThrow();
  });

  it('cannot open with a different key', () => {
    const sealed = seal(ACCOUNT)!;
    mockConfig.payoutEncryptionKey = randomBytes(32).toString('base64');
    expect(() => open(sealed)).toThrow();
  });
});

describe('with no key', () => {
  beforeEach(() => { mockConfig.payoutEncryptionKey = ''; });

  it('stores the value as before', () => {
    expect(seal(ACCOUNT)).toBe(ACCOUNT);
  });

  it('refuses to pretend it can read a sealed value', () => {
    mockConfig.payoutEncryptionKey = randomBytes(32).toString('base64');
    const sealed = seal(ACCOUNT)!;
    mockConfig.payoutEncryptionKey = '';
    expect(() => open(sealed)).toThrow(/PAYOUT_ENCRYPTION_KEY/);
  });
});

it('a key of the wrong length fails at boot', () => {
  mockConfig.payoutEncryptionKey = randomBytes(16).toString('base64');
  expect(() => assertEncryptionKeyValid()).toThrow(/32 bytes/);
});

// The seller's own screen masks what is stored. It has to open it first, or
// the last four digits shown would be the last four of the ciphertext.
it('the seller still sees their real last four', () => {
  const stored = sealPayoutColumns({
    payoutUpiId: 'ramesh@okhdfc',
    payoutAccountName: 'Ramesh Patil',
    payoutAccountNumber: ACCOUNT,
    payoutIfsc: 'HDFC0001234',
  });
  const masked = maskPayoutDetails(stored);
  expect(masked.payoutAccountNumber).toMatch(/6789$/);
  expect(masked.payoutUpiId).toMatch(/@okhdfc$/);
  expect(masked.payoutAccountName).toBe('Ramesh Patil');
  expect(masked.payoutIfsc).toBe('HDFC0001234');
});
