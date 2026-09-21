// =============================================================================
// Where a settled deal's money goes
// =============================================================================
// Settlement moves no money by itself (CLAUDE.md §6): release flips a column
// and a person then makes the transfer by hand. Until this existed there was
// nowhere for that person to read the account from, so money reached escrow
// with no way out of it.
//
// A seller gives a UPI id, or a bank account, or both, and at least one before
// anything can be paid out. Not required to apply, because a blank field is a
// bad reason to hold up a review, and not required to list either: it is
// required by the time money is actually sitting there, which is when the
// seller is asked for it (notifySellerPayoutDetailsMissing).
//
// THREE AUDIENCES, THREE ANSWERS:
//   - the admin making the transfer sees all of it, and every such read writes
//     an audit row (admin.service.getPartnerPayoutDetails)
//   - the seller sees it masked, which is enough to recognise their own
//     account and not enough to be worth stealing off a shoulder
//   - everybody else sees nothing at all. PUBLIC_SELLER_SELECT is an
//     allow-list, so a buyer cannot reach these columns; maskPayoutDetails is
//     what stops the seller's OWN endpoints handing them back in full.
// =============================================================================

import { ApiError } from '../utils/ApiError';

// A UPI id is <handle>@<psp>: "ramesh@okhdfc", "9822055667@ybl". The local part
// is loose by design (banks allow dots, hyphens, underscores) and the PSP side
// is letters only. This rejects typing errors, not fraud: nothing here proves
// the id exists, which only a payout attempt or a penny drop can do.
const UPI_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,255}@[a-zA-Z]{2,64}$/;

// IFSC is fixed by RBI: four letters for the bank, a literal 0, then six
// alphanumerics for the branch. Always 11 characters, always that shape.
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Indian account numbers run 9 to 18 digits depending on the bank. Digits only:
// a number typed with spaces or dashes is cleaned up before this sees it.
const ACCOUNT_PATTERN = /^[0-9]{9,18}$/;

export interface PayoutDetailsInput {
  payoutUpiId?: string | null;
  payoutAccountName?: string | null;
  payoutAccountNumber?: string | null;
  payoutIfsc?: string | null;
}

export interface PayoutDetailsColumns {
  payoutUpiId: string | null;
  payoutAccountName: string | null;
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
}

// What a masked value is padded with. Exported so the clients and the tests
// agree on it rather than each keeping their own bullet.
export const MASK_CHAR = '\u2022';

const blank = (value: string | null | undefined) => (value ?? '').trim() === '';

/**
 * Normalise and check what a seller typed, returning exactly the four columns
 * to write. Throws ApiError(400) with a message meant for the seller to read.
 *
 * Returns null when the caller sent no payout fields at all, which is the
 * ordinary case: an application that does not mention payout leaves whatever
 * is on file alone rather than clearing it.
 */
export function parsePayoutDetails(input: PayoutDetailsInput): PayoutDetailsColumns | null {
  const mentioned =
    input.payoutUpiId !== undefined ||
    input.payoutAccountName !== undefined ||
    input.payoutAccountNumber !== undefined ||
    input.payoutIfsc !== undefined;
  if (!mentioned) return null;

  const upi = (input.payoutUpiId ?? '').trim();
  const name = (input.payoutAccountName ?? '').trim();
  // People write their account number in groups and their IFSC in lower case.
  // Both are cleaned here rather than refused, because neither is a mistake.
  const account = (input.payoutAccountNumber ?? '').replace(/[\s-]/g, '');
  const ifsc = (input.payoutIfsc ?? '').replace(/\s/g, '').toUpperCase();

  // Everything cleared. Allowed: a seller may take an account off the file,
  // and refusing that would mean the only way to remove a wrong number is to
  // ask us to do it.
  if (blank(upi) && blank(name) && blank(account) && blank(ifsc)) {
    return { payoutUpiId: null, payoutAccountName: null, payoutAccountNumber: null, payoutIfsc: null };
  }

  // The seller is shown their own details masked, so a form that posts back
  // what it was given would otherwise store "••••8901" as an account number
  // and quietly make the account unpayable. Clients send these fields only
  // when they were edited; this is the guard for the ones that get it wrong.
  if ([upi, name, account, ifsc].some((f) => f.includes(MASK_CHAR))) {
    throw new ApiError(400, 'Type your payout details again in full');
  }

  if (upi && !UPI_PATTERN.test(upi)) {
    throw new ApiError(400, 'Enter a UPI id like name@bank');
  }

  // A bank account is all three fields or none of them. Two out of three is
  // not a partial record to be completed later: it is unpayable, and storing
  // it would put a half-filled account in front of whoever makes the transfer.
  const bankFields = [name, account, ifsc];
  const givenBankFields = bankFields.filter((f) => !blank(f)).length;
  if (givenBankFields > 0 && givenBankFields < bankFields.length) {
    if (blank(name)) throw new ApiError(400, 'Enter the name on the bank account');
    if (blank(account)) throw new ApiError(400, 'Enter the bank account number');
    throw new ApiError(400, 'Enter the IFSC code of your bank branch');
  }

  if (givenBankFields === bankFields.length) {
    if (!ACCOUNT_PATTERN.test(account)) {
      throw new ApiError(400, 'A bank account number is 9 to 18 digits');
    }
    if (!IFSC_PATTERN.test(ifsc)) {
      throw new ApiError(400, 'Enter a valid IFSC code, like HDFC0001234');
    }
    if (name.length < 2 || name.length > 120) {
      throw new ApiError(400, 'Enter the name on the bank account');
    }
  }

  // The rule this file exists for: something payable, or nothing at all.
  if (blank(upi) && givenBankFields === 0) {
    throw new ApiError(400, 'Add a UPI id or a bank account so we can pay you');
  }

  return {
    payoutUpiId: upi || null,
    payoutAccountName: name || null,
    payoutAccountNumber: account || null,
    payoutIfsc: ifsc || null,
  };
}

/** Is there anything here that a person could actually pay into? */
export function hasPayoutDetails(profile: PayoutDetailsInput | null | undefined): boolean {
  if (!profile) return false;
  const bankComplete =
    !blank(profile.payoutAccountName) &&
    !blank(profile.payoutAccountNumber) &&
    !blank(profile.payoutIfsc);
  return !blank(profile.payoutUpiId) || bankComplete;
}

// Keep the last `keep` characters, and show the rest as dots. Short values
// would otherwise be shown almost whole, so anything at or under the keep
// length is masked completely.
function maskTail(value: string, keep = 4): string {
  if (value.length <= keep) return MASK_CHAR.repeat(value.length);
  return MASK_CHAR.repeat(Math.min(value.length - keep, 8)) + value.slice(-keep);
}

/**
 * What the seller gets back about their own account: enough to recognise it,
 * not enough to be read off their screen and used.
 *
 * The account number keeps its last four, the convention every bank statement
 * uses. The UPI id keeps its provider, because "which of my two accounts is
 * this" is the question being answered and the provider is most of the answer.
 * The IFSC and the account holder's name are left whole on purpose: an IFSC
 * names a branch, not an account, and hiding both would leave the seller
 * unable to tell a wrong entry from a right one, which is the whole point of
 * showing them anything.
 */
export function maskPayoutDetails<T extends PayoutDetailsInput>(profile: T): T & {
  payoutUpiId: string | null;
  payoutAccountNumber: string | null;
  hasPayoutDetails: boolean;
} {
  const upi = (profile.payoutUpiId ?? '').trim();
  const account = (profile.payoutAccountNumber ?? '').trim();
  const [local, psp] = upi.includes('@') ? [upi.slice(0, upi.lastIndexOf('@')), upi.slice(upi.lastIndexOf('@'))] : [upi, ''];

  return {
    ...profile,
    payoutUpiId: upi ? `${maskTail(local)}${psp}` : null,
    payoutAccountNumber: account ? maskTail(account) : null,
    hasPayoutDetails: hasPayoutDetails(profile),
  };
}

/**
 * Apply the mask wherever a seller profile is about to be handed back with a
 * user. Every auth response goes through this, so a new endpoint that returns
 * a user cannot leak an account number by forgetting to think about it.
 */
export function maskUserPayoutDetails<T extends { farmerProfile?: PayoutDetailsInput | null }>(user: T): T {
  if (!user.farmerProfile) return user;
  return { ...user, farmerProfile: maskPayoutDetails(user.farmerProfile) };
}
