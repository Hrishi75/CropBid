// =============================================================================
// signupSchema tests: the identifier rule, and no role
// =============================================================================
// A new account signs up with an email OR a phone, whichever the person has,
// and at least one is required because it is what they sign in with. There is
// no role: every account made at sign-up is a shopper, and a role sent by an
// old app build must be dropped rather than read.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { signupSchema } from './auth.controller';

const shopper = { name: 'Asha', password: 'Sup3rSecret' };

describe('signupSchema identifier', () => {
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
    // Pointed at a field so the form can highlight it.
    expect(parsed.error?.issues[0]?.path).toEqual(['email']);
  });

  it('still rejects an email that is malformed', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: 'not-an-email' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Invalid email address');
  });
});

describe('signupSchema role', () => {
  // Old app builds had a role picker that defaulted to FARMER. The request must
  // still succeed, with the role gone, so the service can only make a shopper.
  it('drops a role sent by an old client instead of reading it', () => {
    for (const role of ['FARMER', 'BUYER', 'ADMIN']) {
      const parsed = signupSchema.safeParse({ ...shopper, email: 'asha@cropbid.test', role });

      expect(parsed.success, `expected a ${role} request to be accepted`).toBe(true);
      expect(parsed.data).not.toHaveProperty('role');
    }
  });

  it('no longer asks a would-be buyer for both an email and a phone', () => {
    expect(signupSchema.safeParse({ ...shopper, phone: '+919876543210', role: 'BUYER' }).success).toBe(true);
  });
});
