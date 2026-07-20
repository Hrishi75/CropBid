// =============================================================================
// auth.service phone normalization tests
// =============================================================================
// Phone is a unique login identifier, so every spelling of the same number has
// to collapse to one stored form — otherwise a farmer who signs up with
// "+91-98765 43210" cannot log in typing "+919876543210", and the unique index
// would happily hold both as separate accounts.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { normalizePhone } from './auth.service';
import { signupSchema } from '../controllers/auth.controller';

describe('normalizePhone', () => {
  it('collapses every separator spelling of one number to the same value', () => {
    const spellings = [
      '+91-9876543210',
      '+91 9876543210',
      '+919876543210',
      '  +91 (98765) 43210  ',
      '+91-98765-43210',
    ];

    const normalized = spellings.map(normalizePhone);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('+919876543210');
  });

  it('keeps a leading + but never invents one', () => {
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
    expect(normalizePhone('9876543210')).toBe('9876543210');
  });

  it('keeps different numbers distinct', () => {
    expect(normalizePhone('+91-9876543210')).not.toBe(normalizePhone('+91-9876543211'));
  });

  it('normalizes non-phone text to an empty value (login guards on this)', () => {
    // An email identifier must not turn into a phone lookup arm.
    expect(normalizePhone('rajesh@cropbid.test')).toBe('');
  });

  it('matches the SQL backfill in the phone_primary_contact migration', () => {
    // The migration does: (leading '+' if present) || regexp_replace(phone, '[^0-9]', '', 'g')
    const sqlBackfill = (p: string) => (p.startsWith('+') ? '+' : '') + p.replace(/[^0-9]/g, '');
    for (const p of ['+91-9876543210', '+1-555-0101', '+254-700-1234', '9876543210']) {
      expect(normalizePhone(p)).toBe(sqlBackfill(p));
    }
  });
});

// The signup schema is what stands between a user and an unusable account:
// anything it accepts must still carry digits after normalization, or login
// has nothing to match on and a phone-only account is locked out for good.
describe('signup phone validation', () => {
  const parse = (phone: string) =>
    signupSchema.safeParse({
      name: 'Rajesh',
      phone,
      password: 'Sup3rSecret',
      role: 'FARMER',
    });

  it('rejects separator-only input that normalizes to no digits', () => {
    for (const junk of ['+      ', '-------', '(  )  -  ', '+()-  ()']) {
      expect(parse(junk).success, `expected ${JSON.stringify(junk)} to be rejected`).toBe(false);
      // The thing that makes it unusable: nothing left to look up at login.
      expect(normalizePhone(junk).replace('+', '')).toBe('');
    }
  });

  it('rejects a number with too few digits', () => {
    expect(parse('+91-123').success).toBe(false);
  });

  it('accepts real numbers however they are spelled', () => {
    for (const ok of ['+91-9876543210', '+91 9876543210', '9876543210', '+1 (555) 0101']) {
      expect(parse(ok).success, `expected ${JSON.stringify(ok)} to be accepted`).toBe(true);
    }
  });

  it('leaves every accepted number with digits for login to match', () => {
    for (const ok of ['+91-9876543210', '9876543210', '+1 (555) 0101']) {
      expect(normalizePhone(ok).replace('+', '').length).toBeGreaterThanOrEqual(7);
    }
  });
});
