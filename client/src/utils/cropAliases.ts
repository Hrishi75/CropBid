// =============================================================================
// Crop aliases — free-text listing names → Agmarknet board commodities
// =============================================================================
// Listings hold whatever a farmer typed ("Corn", "Rice", "Cow Milk"); the rate
// board uses Agmarknet spellings ("Maize", "Paddy(Dhan)(Common)", "Milk").
// Comparing the two directly fails on the most common crops on the platform,
// so anything matching listings against board rows has to canonicalise first.
//
// ⚠️ MIRRORS server/src/services/prediction.service.ts (CROP_ALIASES +
// resolveCommodity). There is no shared package between client and server, so
// this is a deliberate duplicate: EDIT BOTH OR NEITHER. The server copy is the
// original and stays authoritative if the two ever disagree.
//
// Matching is EXACT against the alias table, never substring — substrings
// conflate distinct crops ("Sweet Potato" contains "Potato", "Custard Apple"
// contains "Apple"). A name that resolves to nothing is simply unmatched,
// which is the honest failure mode: showing an unrelated commodity's price
// under a farmer's own crop is worse than showing none.
// =============================================================================

// Keyed by board commodity. Each list holds the spellings, plurals and Hindi
// names farmers actually type; the commodity itself is matched automatically.
const CROP_ALIASES: Record<string, string[]> = {
  'Tomato':               ['tomatoes', 'tamatar'],
  'Onion':                ['onions', 'pyaz', 'kanda'],
  'Potato':               ['potatoes', 'aloo', 'batata'],
  'Green Chilli':         ['green chili', 'green chillies', 'green chilies', 'hari mirch', 'chilli', 'chili', 'mirchi'],
  'Cauliflower':          ['gobi', 'phool gobi', 'phul gobi'],
  'Brinjal':              ['eggplant', 'aubergine', 'baingan', 'baigan'],
  'Bhindi(Ladies Finger)': ['lady finger', 'ladies finger', 'ladyfinger', 'okra', 'bhindi', 'bhendi'],
  'Banana':               ['bananas', 'kela'],
  'Mango':                ['mangoes', 'mangos', 'aam', 'kesar mango', 'alphonso mango'],
  'Pomegranate':          ['pomegranates', 'anar'],
  'Grapes':               ['grape', 'angoor'],
  'Apple':                ['apples', 'seb'],
  'Wheat':                ['gehu', 'gehun', 'sharbati wheat'],
  'Paddy(Dhan)(Common)':  ['paddy', 'rice', 'dhan', 'basmati', 'basmati paddy', 'basmati rice'],
  'Maize':                ['corn', 'makka', 'makki', 'yellow maize', 'sweet corn'],
  'Soyabean':             ['soybean', 'soya', 'soya bean', 'soy bean', 'soy'],
  'Turmeric':             ['haldi', 'turmeric fingers'],
  'Cocoa':                ['cocoa beans', 'cocoa bean', 'koko'],
  'Milk':                 ['cow milk', 'buffalo milk', 'goat milk', 'a2 milk', 'doodh', 'dudh'],
  'Ghee':                 ['desi ghee', 'a2 ghee', 'bilona ghee', 'clarified butter'],
  'Curd':                 ['curd dahi', 'dahi', 'yogurt', 'yoghurt'],
  'Paneer':               ['cottage cheese', 'malai paneer'],
};

// "Paddy(Dhan)(Common)" → "paddy dhan common"; "  Soy Bean " → "soy bean"
const normalizeCropName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// normalized name → board commodity, built once at module load.
const ALIAS_INDEX = new Map<string, string>();
for (const [commodity, aliases] of Object.entries(CROP_ALIASES)) {
  ALIAS_INDEX.set(normalizeCropName(commodity), commodity);
  for (const alias of aliases) ALIAS_INDEX.set(normalizeCropName(alias), commodity);
}
// Display labels too ("Paddy (Rice)" → Paddy(Dhan)(Common), "Soybean" → Soyabean).
ALIAS_INDEX.set(normalizeCropName('Paddy (Rice)'), 'Paddy(Dhan)(Common)');

/** Board commodity for a free-text crop name, or null when nothing matches. */
export function resolveCommodity(cropName: string): string | null {
  return ALIAS_INDEX.get(normalizeCropName(cropName)) ?? null;
}

/**
 * True when a board row is one of the caller's crops.
 *
 * Both sides are canonicalised, so an unaliased crop still matches its own
 * board row by name ("Sugarcane" is in neither alias list but is spelled the
 * same on both sides) — the table only has to carry names that actually differ.
 *
 * `label` is checked as well because the board's display label is often the
 * plain name a farmer would type ("Lady Finger" for commodity
 * "Bhindi(Ladies Finger)"). Accepting it means a new board row is matchable
 * the day it ships, without waiting for someone to remember this table.
 */
export function matchesAnyCrop(commodity: string, cropNames: string[], label?: string): boolean {
  const keys = new Set([resolveCommodity(commodity) ?? normalizeCropName(commodity)]);
  if (label) keys.add(resolveCommodity(label) ?? normalizeCropName(label));
  return cropNames.some((c) => keys.has(resolveCommodity(c) ?? normalizeCropName(c)));
}
