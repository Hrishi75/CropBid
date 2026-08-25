// =============================================================================
// Unit conversion — the weight behind a Unit
// =============================================================================
// Listings are denominated in the unit the FARMER sells in, and every quantity
// the API takes is expressed in that same unit. A shopper thinks in kilos, so
// the retail surface converts for display: "1 quintal" means nothing to someone
// buying vegetables, "100 kg" does.
//
// Lives in utils rather than beside the stepper that first needed it: a module
// exporting both a component and a constant breaks Fast Refresh, and the
// conversion is not a component concern.
// =============================================================================

import type { Unit } from '../types';

export const KG_PER_UNIT: Record<Unit, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

/** Weight of `qty` of `unit`, in kilograms, rounded to 2dp. */
export function toKg(qty: number, unit: Unit): number {
  return Math.round(qty * KG_PER_UNIT[unit] * 100) / 100;
}
