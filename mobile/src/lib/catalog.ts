// Storefront catalog — the retail tier for REAL listings.
//
// This file used to also carry DEMO_PRODUCTS: ~40 invented lots with villages,
// grades, quantities and prices, which the storefront home merged underneath
// the live API listings so the market "always rendered full". It rendered full
// of things nobody had listed, in cards indistinguishable from real ones, and
// shoppers read every one of them as a farmer's lot. They are gone. The
// storefront now shows live listings only, and says so plainly when there are
// none.
//
// What remains is the pack maths — how a household-sized pack is cut and
// priced out of a real farmer's lot — plus the rails, tiles, chips and ticker
// the home screen lays out. Prices here are ₹ margins and pack sizes, never
// stock. Keep the pack table in sync with the web (client/src/pages/).

import { CROP_CATEGORIES } from './crops';

export type RailId = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

// =============================================================================
// Consumer packs — the retail tier
// =============================================================================
// A household does not buy a 1.2-tonne tomato lot. Every consumer-grade crop
// carries a shop pack (1 kg tomatoes, 1 L milk, 100 g jeera) priced off the
// farmgate floor plus a category retail margin — grading, packing, cold chain,
// last-mile and wastage — unless the farmer set their own direct-sale price,
// which always wins. The wholesale ₹/quintal tier stays on the card for bulk
// buyers, who bid on the whole lot instead.
//
// Crops in BULK_ONLY are never shown as packs: nobody shops for a kilo of
// Shankar-6. Keep in sync with client/src/pages/LandingPage.tsx.
// =============================================================================

const KG_PER_UNIT: Record<string, number> = { KG: 1, LITRE: 1, QUINTAL: 100, TONNE: 1000 };

const RETAIL_MARGIN: Record<RailId, number> = {
  veg: 0.30,     // washed, graded, crated — highest wastage
  fruits: 0.30,
  dairy: 0.10,   // chilled chain already priced into the procurement rate
  grains: 0.25,  // cleaned, bagged, shelf-stable
  spices: 0.25,
};

export interface Pack {
  label: string;   // what the shopper puts in the basket
  kg: number;      // pack size in kg — litres for liquids
  margin?: number; // overrides the category margin
  crop: string;    // the crop NAME a live listing arrives with, for NAME_TO_PACK
}

// Keyed by catalogue slug. Live listings arrive as a crop NAME ("Cow Milk"),
// not a slug, so each entry carries its name and NAME_TO_PACK indexes on it.
// The name used to come from the demo lot with the same slug; holding it here
// keeps one table instead of two that had to agree.
const PACKS: Record<string, Pack> = {
  // Vegetables
  tomato: { crop: 'Tomato', label: '1 kg', kg: 1 },
  onion: { crop: 'Onion', label: '1 kg', kg: 1 },
  potato: { crop: 'Potato', label: '1 kg', kg: 1 },
  okra: { crop: 'Okra (Bhindi)', label: '500 g', kg: 0.5 },
  cauliflower: { crop: 'Cauliflower', label: '1 kg', kg: 1 },
  brinjal: { crop: 'Brinjal', label: '500 g', kg: 0.5 },
  'green-chilli': { crop: 'Green Chilli', label: '250 g', kg: 0.25 },
  spinach: { crop: 'Spinach', label: '250 g', kg: 0.25 },

  // Dairy
  'cow-milk': { crop: 'Cow Milk', label: '1 L', kg: 1 },
  'buffalo-milk': { crop: 'Buffalo Milk', label: '1 L', kg: 1 },
  curd: { crop: 'Curd (Dahi)', label: '500 g', kg: 0.5 },
  paneer: { crop: 'Paneer', label: '200 g', kg: 0.2 },
  ghee: { crop: 'Ghee', label: '500 g', kg: 0.5 },

  // Fruits
  mango: { crop: 'Mango', label: '1 kg', kg: 1 },
  banana: { crop: 'Banana', label: '1 kg', kg: 1 },
  pomegranate: { crop: 'Pomegranate', label: '1 kg', kg: 1 },
  grapes: { crop: 'Grapes', label: '500 g', kg: 0.5 },
  guava: { crop: 'Guava', label: '500 g', kg: 0.5 },
  papaya: { crop: 'Papaya', label: '1 kg', kg: 1 },
  apple: { crop: 'Apple', label: '1 kg', kg: 1 },
  watermelon: { crop: 'Watermelon', label: '2 kg', kg: 2 },

  // Grains & pulses. Paddy is not rice — the shopper pack is milled and
  // polished, so it carries a processing uplift instead of the shelf margin.
  wheat: { crop: 'Wheat', label: '5 kg', kg: 5 },
  'basmati-rice': { crop: 'Basmati Paddy', label: '5 kg', kg: 5, margin: 0.85 },
  bajra: { crop: 'Bajra', label: '2 kg', kg: 2 },
  chana: { crop: 'Chana', label: '1 kg', kg: 1 },
  'tur-dal': { crop: 'Tur (Arhar)', label: '1 kg', kg: 1 },
  moong: { crop: 'Moong', label: '1 kg', kg: 1 },
  masoor: { crop: 'Masoor', label: '1 kg', kg: 1 },

  // Spices & oilseeds
  turmeric: { crop: 'Turmeric', label: '200 g', kg: 0.2 },
  'red-chilli': { crop: 'Red Chilli', label: '200 g', kg: 0.2 },
  cumin: { crop: 'Cumin (Jeera)', label: '100 g', kg: 0.1 },
  'coriander-seed': { crop: 'Coriander Seed', label: '200 g', kg: 0.2 },
  mustard: { crop: 'Mustard', label: '500 g', kg: 0.5 },
  groundnut: { crop: 'Groundnut', label: '1 kg', kg: 1 },
};

// Fibre, feed and crush crops — bought by the quintal or not at all. A farmer
// types whatever name they know, so the spellings live here beside the
// canonical one: an exact-name miss ("Corn" for maize) would otherwise fall
// through to the rail default and hand a wholesale-only crop a 1 kg retail
// pack. Mirrors the alias lists in client/src/utils/cropAliases.ts.
const BULK_ONLY = new Set([
  'cotton', 'kapas',
  'soybean', 'soyabean', 'soya', 'soya bean', 'soy bean', 'soy',
  'maize', 'corn', 'makka', 'makki', 'yellow maize', 'sweet corn',
  'jute', 'patsan',
  'sugarcane', 'ganna', 'sugar cane',
  'castor', 'arandi', 'castor seed',
  'guar', 'guar seed', 'cluster bean',
]);

// "Sweet-Corn " → "sweet corn", so punctuation and spacing can't smuggle a
// bulk crop past the check. Matching stays EXACT, never substring — "Sweet
// Potato" must not read as "potato".
const plainName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A live listing arrives as a crop NAME ("Cow Milk"), not a slug, so index the
// catalogue by name too; anything off-catalogue falls back to a rail default.
const NAME_TO_PACK = new Map<string, Pack>();
for (const pack of Object.values(PACKS)) {
  NAME_TO_PACK.set(pack.crop.trim().toLowerCase(), pack);
}

const DEFAULT_PACK: Record<RailId, Pack> = {
  veg: { crop: 'vegetable', label: '1 kg', kg: 1 },
  dairy: { crop: 'dairy', label: '1 L', kg: 1 },
  fruits: { crop: 'fruit', label: '1 kg', kg: 1 },
  grains: { crop: 'grain', label: '1 kg', kg: 1 },
  spices: { crop: 'spice', label: '200 g', kg: 0.2 },
};

export interface ShopPack {
  label: string;      // "1 kg", "100 g"
  suffix: string;     // label as a price suffix — "₹34/kg" reads better than "₹34/1 kg"
  price: number;      // ₹ for one pack
  anchor: number;     // ₹ for one pack at the wholesale ceiling — the struck-through number
  units: number;      // pack size in the LISTING's own unit — 500 g of a KG lot is 0.5,
                      // a 5 kg wheat pack off a QUINTAL lot is 0.05. What the buy
                      // flow actually orders, so the card and the checkout agree.
  kg: number;         // pack size in kg, before any unit conversion
  kgPerUnit: number;  // kg in one listing unit — 100 for a QUINTAL lot, 1000 for TONNE
  perKg: number;      // ₹ per kg (litre for liquids), so packs stay comparable. Never
  perKgLabel: string; // per quintal: "₹31/kg" is what a shopper checks, not "₹3,100/qtl".
}

// What a household actually buys and pays. null for a bulk-only crop, in which
// case the card keeps its wholesale framing.
export function shopPack(opts: {
  crop: string;           // catalogue slug or live crop name
  cat: RailId;
  unit: string;           // KG | QUINTAL | TONNE | LITRE
  floor: number;          // ₹/unit — farmgate floor
  ceiling: number;        // ₹/unit — wholesale ceiling
  retail?: number | null; // ₹/unit — the farmer's own direct-sale price, if they set one
}): ShopPack | null {
  const key = opts.crop.trim().toLowerCase();
  if (BULK_ONLY.has(plainName(key))) return null;
  const pack = PACKS[key] ?? NAME_TO_PACK.get(key) ?? DEFAULT_PACK[opts.cat];
  // A farmer-set retail price is already what the shopper pays; only a derived
  // price takes the shelf margin on top.
  const uplift = opts.retail != null ? 1 : 1 + (pack.margin ?? RETAIL_MARGIN[opts.cat]);
  const perUnit = opts.retail ?? opts.floor * uplift;
  const kgPerUnit = KG_PER_UNIT[opts.unit] ?? 1;
  const packUnits = pack.kg / kgPerUnit; // pack size in the listing's own unit
  return {
    label: pack.label,
    suffix: pack.label.replace(/^1 /, ''),
    price: Math.round(perUnit * packUnits),
    anchor: Math.round(opts.ceiling * uplift * packUnits),
    units: packUnits,
    kg: pack.kg,
    kgPerUnit,
    perKg: perUnit / kgPerUnit,
    perKgLabel: opts.unit === 'LITRE' ? 'L' : 'kg',
  };
}

// How much a shopper's basket of `count` packs comes to in the LISTING's own
// unit — the figure that goes on the order.
//
// The rounding happens in KILOGRAMS, where every pack is a whole number of
// grams, and only then converts. Rounding the converted number instead would
// collapse a 100 g pack of a TONNE lot (0.0001) to zero and round a 500 g pack
// up to 0.001 — double the advertised amount. Three decimals of a kilogram is
// one gram, which is finer than any pack we sell.
export function orderQuantity(pack: ShopPack, count: number): number {
  return Number((count * pack.kg).toFixed(3)) / pack.kgPerUnit;
}

export const RAILS: Array<{ id: RailId; eyebrow: string; title: string }> = [
  { id: 'veg',    eyebrow: 'Farm-fresh · picked this week',       title: 'Fresh Vegetables' },
  { id: 'dairy',  eyebrow: 'Milked this morning · farm chilled',  title: 'Milk & Dairy' },
  { id: 'fruits', eyebrow: 'In season now',                       title: 'Seasonal Fruits' },
  { id: 'grains', eyebrow: 'MSP-anchored floors',                 title: 'Grains & Pulses' },
  { id: 'spices', eyebrow: 'Straight from origin mandis',         title: 'Spices & Oilseeds' },
];

export const CATEGORY_TILES: Array<{ label: string; target: RailId; emoji: string }> = [
  { label: 'Fresh Vegetables', target: 'veg',    emoji: '🍅' },
  { label: 'Milk & Dairy',     target: 'dairy',  emoji: '🥛' },
  { label: 'Seasonal Fruits',  target: 'fruits', emoji: '🥭' },
  { label: 'Grains & Cereals', target: 'grains', emoji: '🌾' },
  { label: 'Pulses & Dal',     target: 'grains', emoji: '🫘' },
  { label: 'Rice & Paddy',     target: 'grains', emoji: '🍚' },
  { label: 'Spices',           target: 'spices', emoji: '🫚' },
  { label: 'Oilseeds',         target: 'spices', emoji: '🌼' },
  { label: 'Cotton & Fibre',   target: 'spices', emoji: '☁️' },
];

export const CHIPS: Array<{ label: string; target: RailId | null }> = [
  { label: 'All', target: null },
  { label: 'Vegetables', target: 'veg' },
  { label: 'Milk & Dairy', target: 'dairy' },
  { label: 'Fruits', target: 'fruits' },
  { label: 'Grains & Pulses', target: 'grains' },
  { label: 'Spices & Oilseeds', target: 'spices' },
];

// Top ticker — same ten crops and day-over-day moves as the web homepage.
export const TICKER: Array<{ name: string; price: number; unit: 'KG' | 'QUINTAL' | 'LITRE'; delta: number }> = [
  { name: 'Wheat',        price: 2480,  unit: 'QUINTAL', delta: 0.9 },
  { name: 'Cow Milk',     price: 55,    unit: 'LITRE',   delta: 0.4 },
  { name: 'Onion',        price: 18,    unit: 'KG',      delta: -1.2 },
  { name: 'Mango',        price: 90,    unit: 'KG',      delta: 2.1 },
  { name: 'Chana',        price: 5720,  unit: 'QUINTAL', delta: 0.7 },
  { name: 'Turmeric',     price: 13800, unit: 'QUINTAL', delta: 1.4 },
  { name: 'Cotton',       price: 7800,  unit: 'QUINTAL', delta: -0.5 },
  { name: 'Soybean',      price: 5420,  unit: 'QUINTAL', delta: 1.3 },
  { name: 'Tomato',       price: 26,    unit: 'KG',      delta: 0.8 },
  { name: 'Basmati',      price: 3600,  unit: 'QUINTAL', delta: 0.6 },
  { name: 'Cumin',        price: 24500, unit: 'QUINTAL', delta: -0.9 },
];

// Map a listing's crop name to its storefront rail, via the shared crop
// catalogue. Unknown crops land in grains (the bulk-commodity default).
const CATEGORY_TO_RAIL: Record<string, RailId> = {
  'Vegetables': 'veg',
  'Dairy': 'dairy',
  'Fruits': 'fruits',
  'Cereals & Grains': 'grains',
  'Pulses & Legumes': 'grains',
  'Spices': 'spices',
  'Oilseeds': 'spices',
  'Cash Crops': 'spices',
  'Nuts & Dry Fruits': 'spices',
};

const CROP_TO_RAIL = new Map<string, RailId>();
for (const cat of CROP_CATEGORIES) {
  const rail = CATEGORY_TO_RAIL[cat.name] ?? 'grains';
  for (const crop of cat.crops) CROP_TO_RAIL.set(crop.toLowerCase(), rail);
}

export function railFor(cropName: string): RailId {
  return CROP_TO_RAIL.get(cropName.trim().toLowerCase()) ?? 'grains';
}
