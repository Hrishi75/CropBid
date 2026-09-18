// =============================================================================
// signupSchema tests: which identifiers each role must give
// =============================================================================
// A shopper signs up with an email OR a phone, whichever they have. A buyer
// must give both: the email is the address deals and password resets reach
// them on, and a buyer who signs up without one has no way back into their
// account. Both rules span fields, so they are cross-field checks rather than
// plain required properties.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { signupSchema } from './auth.controller';

const base = {
  name: 'Rajesh',
  phone: '+919876543210',
  password: 'Sup3rSecret',
};

describe('signupSchema email requirement', () => {
  it('rejects a buyer with no email at all', () => {
    const parsed = signupSchema.safeParse({ ...base, role: 'BUYER' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Email is required for buyer accounts');
    // Pointed at the field so the form can highlight it.
    expect(parsed.error?.issues[0]?.path).toEqual(['email']);
  });

  it('rejects a buyer whose form submitted an empty email string', () => {
    // The preprocess step turns '' into undefined — the buyer rule must still
    // fire, not be fooled into thinking a value was supplied.
    const parsed = signupSchema.safeParse({ ...base, role: 'BUYER', email: '' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Email is required for buyer accounts');
  });

  it('still rejects a buyer email that is malformed', () => {
    const parsed = signupSchema.safeParse({ ...base, role: 'BUYER', email: 'not-an-email' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Invalid email address');
  });

  it('accepts a buyer with a valid email', () => {
    const parsed = signupSchema.safeParse({
      ...base,
      role: 'BUYER',
      email: 'buyer@cropbid.test',
    });

    expect(parsed.success).toBe(true);
  });

  it('leaves email optional for farmers and consumers', () => {
    for (const role of ['FARMER', 'CONSUMER'] as const) {
      const parsed = signupSchema.safeParse({ ...base, role });
      expect(parsed.success, `expected ${role} to sign up without an email`).toBe(true);
    }
  });
});

// The sign-up form asks for an email OR a phone, whichever the person has, and
// sends no role: every account starts as a shopper.
describe('signupSchema identifier and role', () => {
  const shopper = { name: 'Asha', password: 'Sup3rSecret' };

  it('makes a shopper when no role is sent', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: 'asha@cropbid.test' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.role).toBe('CONSUMER');
  });

  it('accepts an email with no phone', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: 'asha@cropbid.test' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.phone).toBeUndefined();
  });

  it('accepts a phone with no email', () => {
    expect(signupSchema.safeParse({ ...shopper, phone: '+919876543210' }).success).toBe(true);
  });

  it('treats blank fields as absent, so a form with neither filled is refused', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: '', phone: '   ' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Enter an email address or a phone number');
  });

  it('still requires a phone from a buyer', () => {
    const parsed = signupSchema.safeParse({ ...shopper, role: 'BUYER', email: 'buyer@cropbid.test' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Phone is required for buyer accounts');
    expect(parsed.error?.issues[0]?.path).toEqual(['phone']);
  });
});
