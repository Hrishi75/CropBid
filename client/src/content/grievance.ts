// =============================================================================
// The Grievance Officer: one place, read by /privacy and /terms
// =============================================================================
// The IT (Intermediary Guidelines) Rules 2021 and the Consumer Protection
// (E-Commerce) Rules 2020 both require a marketplace to publish the name and
// contact details of a grievance officer; the DPDP Rules require the contact of
// someone who can answer questions about personal data. This is that person.
//
// The time limits are the stricter of the two marketplace rules (IT Rules: 24
// hours to acknowledge, 15 days to resolve), which also meets the e-commerce
// rules' 48 hours and one month. They are a published promise: ops must keep
// them. The app's Help screen carries its own copy of these details
// (mobile/src/screens/profile/HelpScreen.tsx); change both together.
// =============================================================================

export const GRIEVANCE_OFFICER = {
  name: 'Ayush Gaikwad',
  designation: 'Grievance Officer',
  email: 'ayush.gaikwad@cropbid.in',
  phoneDisplay: '+91 86260 47528',
  phoneHref: 'tel:+918626047528',
  acknowledgeWithin: '24 hours',
  resolveWithin: '15 days',
} as const;
