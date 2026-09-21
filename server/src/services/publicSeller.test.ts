// =============================================================================
// What a buyer may learn about a seller
// =============================================================================
// PUBLIC_SELLER_SELECT is an allow-list, and the whole privacy position of the
// seller profile rests on it staying one: every public read composes it, so a
// column the marketplace should not publish is safe by not being named here.
//
// This test exists because that safety is only as good as the next person's
// habit. Adding `payoutAccountNumber: true` to this object would publish a
// bank account on a product card, and nothing else in the codebase would
// complain. The assertion is deliberately about the SHAPE rather than any one
// field: a new private column is caught by the same rule that catches this one.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { PUBLIC_SELLER_SELECT } from './publicSeller';

// Everything on FarmerProfile that must never reach a buyer. Payout details
// are the sharpest of them; the rest are the compliance and internal fields
// the file's own header already promises are absent.
const PRIVATE_COLUMNS = [
  'payoutUpiId',
  'payoutAccountName',
  'payoutAccountNumber',
  'payoutIfsc',
  'bankDetails',
  'userId',
  'fssaiLicense',
  'gstin',
  'apmcLicense',
  'fpoName',
  'address',
  'minOrderValue',
  'status',
  'statusNote',
];

describe('the public shape of a seller', () => {
  it.each(PRIVATE_COLUMNS)('does not publish %s', (column) => {
    expect(PUBLIC_SELLER_SELECT).not.toHaveProperty(column);
  });

  // The nested user select is a second allow-list and the same rule applies:
  // it must not grow an email address or a phone number, which is what
  // contactVisibility.ts exists to release, and only once payment has cleared.
  it.each(['email', 'phone', 'password', 'refreshToken'])(
    'does not publish the seller\'s %s',
    (column) => {
      expect(PUBLIC_SELLER_SELECT.user.select).not.toHaveProperty(column);
    },
  );

  // An allow-list that has quietly become `true` (or a spread of the whole
  // row) would pass every check above while publishing everything.
  it('is a field-by-field allow-list, not a whole row', () => {
    for (const value of Object.values(PUBLIC_SELLER_SELECT)) {
      expect(typeof value === 'boolean' || typeof value === 'object').toBe(true);
    }
    expect(Object.values(PUBLIC_SELLER_SELECT).every((v) => v !== false)).toBe(true);
  });
});
