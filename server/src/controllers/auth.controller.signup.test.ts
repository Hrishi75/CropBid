// =============================================================================
// signupSchema tests: the identifier rule, and no role
// =============================================================================
// A new account signs up with a mobile number, which is required, and an email
// if it has one (decided 2026-11-03). There is
// no role: every account made at sign-up is a shopper, and a role sent by an
// old app build must be dropped rather than read.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { signupSchema } from './auth.controller';

const shopper = { name: 'Asha', password: 'Sup3rSecret' };

describe('signupSchema identifier', () => {
  it('refuses an email with no phone', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: 'asha@cropbid.test' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Enter your mobile number');
    // Pointed at a field so the form can highlight it.
    expect(parsed.error?.issues[0]?.path).toEqual(['phone']);
  });

  it('accepts a phone with no email', () => {
    expect(signupSchema.safeParse({ ...shopper, phone: '+919876543210' }).success).toBe(true);
  });

  it('accepts a phone and an email together', () => {
    expect(signupSchema.safeParse({ ...shopper, phone: '9876543210', email: 'asha@cropbid.test' }).success).toBe(true);
  });

  it('treats a blank phone as missing, and a blank email as absent', () => {
    const parsed = signupSchema.safeParse({ ...shopper, email: '', phone: '   ' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Enter your mobile number');

    const ok = signupSchema.safeParse({ ...shopper, email: '', phone: '9876543210' });
    expect(ok.success).toBe(true);
    expect(ok.data?.email).toBeUndefined();
  });

  it('still rejects an email that is malformed', () => {
    const parsed = signupSchema.safeParse({ ...shopper, phone: '9876543210', email: 'not-an-email' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Invalid email address');
  });
});

describe('signupSchema role', () => {
  // Old app builds had a role picker that defaulted to FARMER. The request must
  // still succeed, with the role gone, so the service can only make a shopper.
  it('drops a role sent by an old client instead of reading it', () => {
    for (const role of ['FARMER', 'BUYER', 'ADMIN']) {
      const parsed = signupSchema.safeParse({ ...shopper, phone: '9876543210', role });

      expect(parsed.success, `expected a ${role} request to be accepted`).toBe(true);
      expect(parsed.data).not.toHaveProperty('role');
    }
  });

  it('no longer asks a would-be buyer for both an email and a phone', () => {
    expect(signupSchema.safeParse({ ...shopper, phone: '+919876543210', role: 'BUYER' }).success).toBe(true);
  });
});
