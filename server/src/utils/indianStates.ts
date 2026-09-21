// =============================================================================
// Indian states and union territories, spelled one way
// =============================================================================
// /inputs groups and filters products by the state stored on them, and a
// product takes its state from its shop. So a shop saved as "Maharastra" would
// make a second state on the public filter, and its products would be missing
// from Maharashtra. The admin shop form reads this list from the API rather
// than keeping its own copy, and the server refuses anything not on it.
// =============================================================================

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

const BY_LOWER = new Map<string, string>(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

/** The list's own spelling of a state typed in any case, or null if it is not one. */
export function canonicalState(input: string): string | null {
  return BY_LOWER.get(input.trim().replace(/\s+/g, ' ').toLowerCase()) ?? null;
}
