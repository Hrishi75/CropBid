// =============================================================================
// Consent at sign-up: what is recorded, and which policy it was given to
// =============================================================================
// The DPDP Act puts the burden of proving consent on CropBid, so "the sign-up
// page said so" is not enough: the row has to carry when the person ticked the
// box, and the version of the terms and privacy policy that box pointed at.
//
// Both sign-up forms carry one tickbox: "I am 18 or older and agree to the
// Terms and Privacy Policy". Ticking it is the consent and the age declaration
// in one act, so one timestamp records both.
//
// `consent` is optional on the wire because app builds from before 2026-10-05
// never send it, and refusing them would break sign-up until they update. Such
// an account is made with no consent recorded (null), which is the truth about
// it. An explicit `false` is refused: that client showed the box and it was
// not ticked.
//
// Change POLICY_VERSION whenever /terms or /privacy change in substance. It is
// the "Last updated" date of the privacy policy.
// =============================================================================

import { ApiError } from './ApiError';

export const POLICY_VERSION = '2026-10-06';

export const CONSENT_REQUIRED_MESSAGE =
  'Tick the box to confirm you are 18 or older and agree to the terms and privacy policy';

/** Refuses an explicit no. Absent is a pre-consent app build (see above). */
export function assertConsentNotRefused(consent: boolean | undefined): void {
  if (consent === false) throw new ApiError(400, CONSENT_REQUIRED_MESSAGE);
}

/** The columns to write on a new account. */
export function consentFields(consent: boolean | undefined, now = new Date()) {
  return consent === true ? { consentAt: now, consentVersion: POLICY_VERSION } : {};
}
