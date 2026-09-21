// =============================================================================
// Payout details: what may be stored, and what may be shown
// =============================================================================
// Two rules carry the whole feature, so both are pinned here rather than left
// to the forms:
//
//   1. What is stored is payable. A UPI id or a complete bank account, never
//      two thirds of one, and never the mask we showed the seller.
//   2. What is shown back to the seller is not usable. The mask is the only
//      thing standing between /auth/me and an account number, because that
//      endpoint returns the seller's own profile row.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  MASK_CHAR,
  hasPayoutDetails,
  maskPayoutDetails,
  maskUserPayoutDetails,
  parsePayoutDetails,
} from './payoutDetails';

const BANK = {
  payoutAccountName: 'Ramesh Patil',
  payoutAccountNumber: '50100123456789',
  payoutIfsc: 'HDFC0001234',
};

const parse = (input: Parameters<typeof parsePayoutDetails>[0]) => parsePayoutDetails(input);
const message = (input: Parameters<typeof parsePayoutDetails>[0]) => {
  try {
    parsePayoutDetails(input);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

describe('what may be stored', () => {
  it('takes a UPI id on its own', () => {
    expect(parse({ payoutUpiId: 'ramesh@okhdfc' })).toEqual({
      payoutUpiId: 'ramesh@okhdfc',
      payoutAccountName: null,
      payoutAccountNumber: null,
      payoutIfsc: null,
    });
  });

  it('takes a bank account on its own', () => {
    expect(parse(BANK)).toEqual({ payoutUpiId: null, ...BANK });
  });

  it('takes both', () => {
    const saved = parse({ payoutUpiId: 'ramesh@okhdfc', ...BANK });
    expect(saved).toEqual({ payoutUpiId: 'ramesh@okhdfc', ...BANK });
  });

  // The seller typed nothing about payout, which is most applications. Their
  // existing account must not be cleared by a resubmission that ignored it.
  it('leaves what is on file alone when nothing was sent', () => {
    expect(parse({})).toBeNull();
    expect(parse({ payoutUpiId: undefined })).toBeNull();
  });

  // But an explicit clear is honoured, or a wrong number could only be
  // removed by writing in and asking.
  it('clears everything when every field is sent empty', () => {
    expect(parse({ payoutUpiId: '', payoutAccountName: '', payoutAccountNumber: '', payoutIfsc: '' })).toEqual({
      payoutUpiId: null,
      payoutAccountName: null,
      payoutAccountNumber: null,
      payoutIfsc: null,
    });
  });

  it('cleans up how people actually type', () => {
    expect(parse({ ...BANK, payoutAccountNumber: '5010 0123 456789', payoutIfsc: 'hdfc0001234' })).toEqual({
      payoutUpiId: null,
      payoutAccountName: 'Ramesh Patil',
      payoutAccountNumber: '50100123456789',
      payoutIfsc: 'HDFC0001234',
    });
  });
});

describe('what may not be stored', () => {
  // Two thirds of a bank account is not a partial record to be completed
  // later: it is money that cannot be sent.
  it('refuses a half-filled bank account, naming what is missing', () => {
    expect(message({ payoutAccountNumber: BANK.payoutAccountNumber, payoutIfsc: BANK.payoutIfsc }))
      .toMatch(/name on the bank account/i);
    expect(message({ payoutAccountName: BANK.payoutAccountName, payoutIfsc: BANK.payoutIfsc }))
      .toMatch(/account number/i);
    expect(message({ payoutAccountName: BANK.payoutAccountName, payoutAccountNumber: BANK.payoutAccountNumber }))
      .toMatch(/IFSC/i);
  });

  it('refuses a UPI id that is not one', () => {
    for (const bad of ['ramesh', 'ramesh@', '@okhdfc', 'ramesh@okhdfc1', 'ramesh okhdfc@ybl']) {
      expect(message({ payoutUpiId: bad })).toMatch(/UPI id/i);
    }
  });

  it('refuses an IFSC that is not one', () => {
    // Right length, wrong shape: the fifth character is a literal zero.
    expect(message({ ...BANK, payoutIfsc: 'HDFC1001234' })).toMatch(/IFSC/i);
    expect(message({ ...BANK, payoutIfsc: 'HDFC000123' })).toMatch(/IFSC/i);
    expect(message({ ...BANK, payoutIfsc: 'HD0FC001234' })).toMatch(/IFSC/i);
  });

  it('refuses an account number that is not 9 to 18 digits', () => {
    expect(message({ ...BANK, payoutAccountNumber: '12345678' })).toMatch(/9 to 18 digits/i);
    expect(message({ ...BANK, payoutAccountNumber: '1234567890123456789' })).toMatch(/9 to 18 digits/i);
    expect(message({ ...BANK, payoutAccountNumber: '50100123456789X' })).toMatch(/9 to 18 digits/i);
  });

  // A seller who opens the form and saves it without touching anything is
  // posting back the mask they were shown. Storing it would leave an account
  // number of bullet points and nobody any the wiser until payout day.
  it('refuses the mask it showed the seller', () => {
    const masked = maskPayoutDetails({ payoutUpiId: 'ramesh@okhdfc', ...BANK });
    expect(message({ payoutUpiId: masked.payoutUpiId! })).toMatch(/again in full/i);
    expect(message({ ...BANK, payoutAccountNumber: masked.payoutAccountNumber! })).toMatch(/again in full/i);
  });
});

describe('what the seller is shown', () => {
  it('keeps the last four of the account number and nothing before it', () => {
    const shown = maskPayoutDetails(BANK);

    expect(shown.payoutAccountNumber).toMatch(/6789$/);
    expect(shown.payoutAccountNumber).not.toContain('50100');
    expect(shown.payoutAccountNumber!.startsWith(MASK_CHAR)).toBe(true);
  });

  // An IFSC names a branch and the account name is the seller's own: shown
  // whole on purpose, so they can tell a right entry from a wrong one.
  it('leaves the branch and the account holder readable', () => {
    const shown = maskPayoutDetails(BANK);
    expect(shown.payoutIfsc).toBe('HDFC0001234');
    expect(shown.payoutAccountName).toBe('Ramesh Patil');
  });

  it('keeps the UPI provider and hides the rest of the id', () => {
    const shown = maskPayoutDetails({ payoutUpiId: 'rameshpatil@okhdfc' });
    expect(shown.payoutUpiId).toBe(`${MASK_CHAR.repeat(7)}atil@okhdfc`);
  });

  // A short id would otherwise be shown nearly whole by a keep-the-last-four
  // rule, which is the case where masking matters most.
  it('hides a short value completely', () => {
    expect(maskPayoutDetails({ payoutUpiId: 'ab@ybl' }).payoutUpiId).toBe(`${MASK_CHAR.repeat(2)}@ybl`);
  });

  it('says nothing is on file when nothing is', () => {
    const shown = maskPayoutDetails({});
    expect(shown.payoutUpiId).toBeNull();
    expect(shown.payoutAccountNumber).toBeNull();
    expect(shown.hasPayoutDetails).toBe(false);
  });

  // The guard that makes the mask hold everywhere: every auth response goes
  // through this, so an endpoint returning a user cannot leak an account
  // number by not having thought about it.
  it('masks the profile hanging off a user', () => {
    const user = maskUserPayoutDetails({ id: 'u1', farmerProfile: { ...BANK } });

    expect(user.farmerProfile.payoutAccountNumber).not.toBe(BANK.payoutAccountNumber);
    expect(user.id).toBe('u1');
  });

  it('leaves a user with no seller profile alone', () => {
    expect(maskUserPayoutDetails({ id: 'u1', farmerProfile: null })).toEqual({ id: 'u1', farmerProfile: null });
    expect(maskUserPayoutDetails({ id: 'u1' })).toEqual({ id: 'u1' });
  });
});

describe('whether there is anywhere to send money', () => {
  it('is true for a UPI id, or a complete bank account', () => {
    expect(hasPayoutDetails({ payoutUpiId: 'ramesh@okhdfc' })).toBe(true);
    expect(hasPayoutDetails(BANK)).toBe(true);
  });

  // The case the nag exists for: something is on file, and none of it can be
  // paid into.
  it('is false for a half-filled account, an empty row, or no row', () => {
    expect(hasPayoutDetails({ payoutAccountNumber: BANK.payoutAccountNumber, payoutIfsc: BANK.payoutIfsc })).toBe(false);
    expect(hasPayoutDetails({ payoutUpiId: '   ' })).toBe(false);
    expect(hasPayoutDetails({})).toBe(false);
    expect(hasPayoutDetails(null)).toBe(false);
  });
});
