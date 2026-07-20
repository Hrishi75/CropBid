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
