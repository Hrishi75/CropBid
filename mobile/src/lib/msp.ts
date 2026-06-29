// Government Minimum Support Price (MSP) reference data for India, used to warn
// farmers and buyers when a price drops below the official floor for a crop.
//
// Source: Government of India, CCEA announcements —
//   • Kharif Marketing Season 2025-26 (announced Jun 2025)
//   • Rabi Marketing Season 2025-26 (announced Oct 2024)
//   • Sugarcane uses the Fair & Remunerative Price (FRP) 2025-26 sugar season,
//     which is a separate statutory price, not an MSP.
// All base values are ₹ per QUINTAL (1 quintal = 100 kg).
//
// MSP only legally covers the ~23 mandated crops. Crops in our catalogue that
// have NO central price (Potato, Onion, Tomato, Coffee, Tea, Pepper, Coconut,
// Banana, Turmeric) are intentionally omitted — no floor is enforced for them.
// Keys match the CROPS list in CreateListingScreen. Update annually when the
// Cabinet revises rates.

export const MSP_PER_QUINTAL: Record<string, number> = {
  Rice: 2369, // Paddy (Common), KMS 2025-26
  Wheat: 2425, // RMS 2025-26
  Cotton: 7710, // Medium staple, KMS 2025-26
  Soybean: 5328, // Yellow, KMS 2025-26
  Sugarcane: 355, // FRP 2025-26 (₹/qtl @ 10.25% recovery)
  'Chana Dal': 5650, // Gram (Chana), RMS 2025-26
  Mustard: 5950, // Rapeseed & Mustard, RMS 2025-26
  Groundnut: 7263, // KMS 2025-26
  Corn: 2400, // Maize, KMS 2025-26
  Barley: 1980, // RMS 2025-26
  Ragi: 4886, // KMS 2025-26
};

// How many quintals are in one of each listing unit.
const QUINTALS_PER_UNIT: Record<string, number> = { KG: 0.01, QUINTAL: 1, TONNE: 10 };

// The government floor price for a crop expressed in the listing's unit, or null
// when the crop has no official MSP (so callers skip the warning entirely).
export function mspForCrop(cropName: string, unit: string): number | null {
  const perQuintal = MSP_PER_QUINTAL[cropName];
  if (perQuintal == null) return null;
  const quintals = QUINTALS_PER_UNIT[unit] ?? 1;
  return Math.round(perQuintal * quintals * 100) / 100;
}
