// =============================================================================
// signupSchema tests — the email rule differs by role
// =============================================================================
// Phone is the primary contact for every account, but a buyer must also give an
// email: that is the address deals and password resets reach them on, and a
// buyer who signs up without one has no way back into their account. Farmers
// and consumers stay phone-only by design, so the check has to be cross-field
// rather than a plain required email.
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
