// =============================================================================
// Unit conversion — the weight behind a Unit
// =============================================================================
// Listings are denominated in the unit the SELLER trades in, and every quantity
// the API takes or returns is in that same unit. The retail surface is
// denominated in kilograms instead, because a household buys half a kilo of
// chillies and not 0.005 tonne.
//
// The client carries the same table (client/src/utils/units.ts). It has to:
// the conversion happens on both sides of the wire, and the two must agree or a
// shopper is billed for something other than what they picked. Keep them in
// step — a change here is a change there.
// =============================================================================

import type { Unit } from '../generated/prisma/enums';

export const KG_PER_UNIT: Record<Unit, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

/** Weight of `qty` of `unit`, in kilograms. */
export function toKg(qty: number, unit: Unit): number {
  return Math.round(qty * KG_PER_UNIT[unit] * 100) / 100;
}

/**
 * What one kilogram costs, for a lot priced per `unit`.
 *
 * Unrounded on purpose: prices are compared across shops before they are ever
 * displayed, and rounding here would make two genuinely different prices tie.
 */
export function pricePerKg(pricePerUnit: number, unit: Unit): number {
  return pricePerUnit / KG_PER_UNIT[unit];
}
