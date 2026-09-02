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

/**
 * `kg` expressed in `unit` — the denomination every API quantity is in.
 *
 * Six decimal places, not the two used elsewhere: half a kilo of a
 * quintal-denominated lot is 0.005 quintal, and rounding that to 2dp would
 * turn it into 0.01 and order twice what the shopper asked for. This is the
 * one conversion that runs on the way OUT to the server, so it is the one
 * place that resolution has to survive.
 */
export function fromKg(kg: number, unit: Unit): number {
  return Math.round((kg / KG_PER_UNIT[unit]) * 1e6) / 1e6;
}

/**
 * What one kilogram costs, for a lot priced per `unit`.
 *
 * Deliberately unrounded: the caller multiplies by a weight and rounds the
 * result, so rounding here would compound into a total that disagrees with the
 * server's own `retailPricePerUnit × quantity`.
 */
export function pricePerKg(pricePerUnit: number, unit: Unit): number {
  return pricePerUnit / KG_PER_UNIT[unit];
}

/**
 * A weight the way a shopper says it: grams below a kilo, kilos above.
 * "500 g", not "0.5 kg"; "1.5 kg", not "1.50 kg".
 */
export function formatWeight(kg: number): string {
  if (kg <= 0) return '0 g';
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${Number(kg.toFixed(2))} kg`;
}
