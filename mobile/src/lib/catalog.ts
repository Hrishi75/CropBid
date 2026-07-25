// Storefront catalog — the same static demo lots, rails, tiles, and price
// ticker the WEB homepage renders (client/src/pages/LandingPage.tsx), so the
// mobile home always shows a full market with prices even before any farmer
// has listed. Live API listings are merged in on top of these; a demo lot is
// hidden as soon as a real lot for the same crop exists.
//
// Prices are ₹ mandi bands at or above the 2025-26 government MSP where
// applicable — keep in sync with the web PRODUCTS list when either changes.

import { CROP_CATEGORIES } from './crops';

export type RailId = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

export interface DemoProduct {
  slug: string;
  name: string;
  variety: string;
  emoji: string;
  cat: RailId;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  price: number;   // ₹ per unit — farmer's floor (what you pay today)
  anchor: number;  // ₹ per unit — wholesale ceiling (struck-through anchor)
  qty: number;     // available, in `unit`
  location: string;
  state: string;
  grade: 'A' | 'B';
  organic?: boolean;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  // Fresh vegetables — ₹/kg
  { slug: 'tomato',       name: 'Tomato',        variety: 'Hybrid',            emoji: '🍅', cat: 'veg', unit: 'KG', price: 26,  anchor: 34,  qty: 1200, location: 'Nashik',    state: 'Maharashtra',      grade: 'A' },
  { slug: 'onion',        name: 'Onion',         variety: 'Nashik Red',        emoji: '🧅', cat: 'veg', unit: 'KG', price: 18,  anchor: 24,  qty: 2500, location: 'Lasalgaon', state: 'Maharashtra',      grade: 'A' },
  { slug: 'potato',       name: 'Potato',        variety: 'Kufri Jyoti',       emoji: '🥔', cat: 'veg', unit: 'KG', price: 14,  anchor: 19,  qty: 3000, location: 'Agra',      state: 'Uttar Pradesh',    grade: 'B' },
  { slug: 'okra',         name: 'Okra (Bhindi)', variety: 'Arka Anamika',      emoji: '🌿', cat: 'veg', unit: 'KG', price: 28,  anchor: 38,  qty: 450,  location: 'Vadodara',  state: 'Gujarat',          grade: 'A' },
  { slug: 'cauliflower',  name: 'Cauliflower',   variety: 'Snowball',          emoji: '🥦', cat: 'veg', unit: 'KG', price: 22,  anchor: 30,  qty: 800,  location: 'Pune',      state: 'Maharashtra',      grade: 'A' },
  { slug: 'brinjal',      name: 'Brinjal',       variety: 'Bharta',            emoji: '🍆', cat: 'veg', unit: 'KG', price: 18,  anchor: 26,  qty: 600,  location: 'Kolar',     state: 'Karnataka',        grade: 'B' },
  { slug: 'green-chilli', name: 'Green Chilli',  variety: 'G4',                emoji: '🌶️', cat: 'veg', unit: 'KG', price: 45,  anchor: 60,  qty: 350,  location: 'Guntur',    state: 'Andhra Pradesh',   grade: 'A' },
  { slug: 'spinach',      name: 'Spinach',       variety: 'All Green',         emoji: '🥬', cat: 'veg', unit: 'KG', price: 15,  anchor: 22,  qty: 300,  location: 'Indore',    state: 'Madhya Pradesh',   grade: 'A', organic: true },

  // Milk & dairy — ₹/kg (≈ per litre for liquid milk). Floors track Amul's
  // Jun-2026 procurement rates (cow 4% fat ≈ ₹55/L, buffalo 6–7% ≈ ₹69/L);
  // anchors track DoCA retail levels (Delhi, Jul 2026: milk ₹60, curd ₹61,
  // paneer ₹348–400, ghee ₹524–572).
  { slug: 'cow-milk',     name: 'Cow Milk',      variety: '4% Fat',            emoji: '🥛', cat: 'dairy', unit: 'LITRE', price: 55,  anchor: 58,  qty: 600, location: 'Anand',     state: 'Gujarat',     grade: 'A' },
  { slug: 'buffalo-milk', name: 'Buffalo Milk',  variety: 'Murrah',            emoji: '🐃', cat: 'dairy', unit: 'LITRE', price: 69,  anchor: 72,  qty: 450, location: 'Karnal',    state: 'Haryana',     grade: 'A' },
  { slug: 'curd',         name: 'Curd (Dahi)',   variety: 'Farm-set',          emoji: '🥣', cat: 'dairy', unit: 'LITRE', price: 55,  anchor: 75,  qty: 200, location: 'Kolhapur',  state: 'Maharashtra', grade: 'A' },
  { slug: 'paneer',       name: 'Paneer',        variety: 'Malai',             emoji: '🧀', cat: 'dairy', unit: 'KG', price: 340, anchor: 400, qty: 80,  location: 'Pune',      state: 'Maharashtra', grade: 'A' },
  { slug: 'ghee',         name: 'Ghee',          variety: 'Desi Cow',          emoji: '🧈', cat: 'dairy', unit: 'KG', price: 540, anchor: 650, qty: 60,  location: 'Jaipur',    state: 'Rajasthan',   grade: 'A', organic: true },

  // Seasonal fruits — ₹/kg
  { slug: 'mango',        name: 'Mango',         variety: 'Kesar',             emoji: '🥭', cat: 'fruits', unit: 'KG', price: 90,  anchor: 140, qty: 900,  location: 'Junagadh',   state: 'Gujarat',          grade: 'A' },
  { slug: 'banana',       name: 'Banana',        variety: 'G9 Cavendish',      emoji: '🍌', cat: 'fruits', unit: 'KG', price: 28,  anchor: 38,  qty: 2000, location: 'Jalgaon',    state: 'Maharashtra',      grade: 'A' },
  { slug: 'pomegranate',  name: 'Pomegranate',   variety: 'Bhagwa',            emoji: '🍒', cat: 'fruits', unit: 'KG', price: 110, anchor: 160, qty: 700,  location: 'Solapur',    state: 'Maharashtra',      grade: 'A' },
  { slug: 'grapes',       name: 'Grapes',        variety: 'Thompson Seedless', emoji: '🍇', cat: 'fruits', unit: 'KG', price: 70,  anchor: 95,  qty: 1100, location: 'Nashik',     state: 'Maharashtra',      grade: 'A' },
  { slug: 'guava',        name: 'Guava',         variety: 'Allahabad Safeda',  emoji: '🍐', cat: 'fruits', unit: 'KG', price: 40,  anchor: 60,  qty: 500,  location: 'Prayagraj',  state: 'Uttar Pradesh',    grade: 'A' },
  { slug: 'papaya',       name: 'Papaya',        variety: 'Red Lady',          emoji: '🍈', cat: 'fruits', unit: 'KG', price: 25,  anchor: 35,  qty: 850,  location: 'Coimbatore', state: 'Tamil Nadu',       grade: 'B' },
  { slug: 'apple',        name: 'Apple',         variety: 'Royal Delicious',   emoji: '🍎', cat: 'fruits', unit: 'KG', price: 120, anchor: 170, qty: 1500, location: 'Shimla',     state: 'Himachal Pradesh', grade: 'A' },
  { slug: 'watermelon',   name: 'Watermelon',    variety: 'Sugar Baby',        emoji: '🍉', cat: 'fruits', unit: 'KG', price: 12,  anchor: 18,  qty: 4000, location: 'Kurnool',    state: 'Andhra Pradesh',   grade: 'B' },

  // Grains & pulses — ₹/quintal
  { slug: 'wheat',        name: 'Wheat',         variety: 'Sharbati',          emoji: '🌾', cat: 'grains', unit: 'QUINTAL', price: 2480, anchor: 2760, qty: 320, location: 'Sehore',     state: 'Madhya Pradesh', grade: 'A' },
  { slug: 'basmati-rice', name: 'Basmati Paddy', variety: 'Pusa 1509',         emoji: '🍚', cat: 'grains', unit: 'QUINTAL', price: 3600, anchor: 4200, qty: 210, location: 'Karnal',     state: 'Haryana',        grade: 'A' },
  { slug: 'maize',        name: 'Maize',         variety: 'Yellow Dent',       emoji: '🌽', cat: 'grains', unit: 'QUINTAL', price: 2100, anchor: 2350, qty: 400, location: 'Davangere',  state: 'Karnataka',      grade: 'B' },
  { slug: 'bajra',        name: 'Bajra',         variety: 'HHB-67',            emoji: '🌾', cat: 'grains', unit: 'QUINTAL', price: 2350, anchor: 2600, qty: 180, location: 'Jodhpur',    state: 'Rajasthan',      grade: 'A' },
  { slug: 'chana',        name: 'Chana',         variety: 'Desi Gram',         emoji: '🫘', cat: 'grains', unit: 'QUINTAL', price: 5720, anchor: 6180, qty: 180, location: 'Kota',       state: 'Rajasthan',      grade: 'A', organic: true },
  { slug: 'tur-dal',      name: 'Tur (Arhar)',   variety: 'Maruti',            emoji: '🫘', cat: 'grains', unit: 'QUINTAL', price: 7400, anchor: 7900, qty: 150, location: 'Kalaburagi', state: 'Karnataka',      grade: 'A' },
  { slug: 'moong',        name: 'Moong',         variety: 'SML-668',           emoji: '🫘', cat: 'grains', unit: 'QUINTAL', price: 8200, anchor: 8700, qty: 120, location: 'Merta',      state: 'Rajasthan',      grade: 'A' },
  { slug: 'masoor',       name: 'Masoor',        variety: 'KLS-218',           emoji: '🫘', cat: 'grains', unit: 'QUINTAL', price: 6400, anchor: 6800, qty: 140, location: 'Sagar',      state: 'Madhya Pradesh', grade: 'B' },

  // Spices & oilseeds — ₹/quintal
  { slug: 'turmeric',       name: 'Turmeric',       variety: 'Salem',      emoji: '🫚', cat: 'spices', unit: 'QUINTAL', price: 13800, anchor: 15200, qty: 90,  location: 'Erode',     state: 'Tamil Nadu',     grade: 'A' },
  { slug: 'red-chilli',     name: 'Red Chilli',     variety: 'Teja S17',   emoji: '🌶️', cat: 'spices', unit: 'QUINTAL', price: 15500, anchor: 17800, qty: 110, location: 'Guntur',    state: 'Andhra Pradesh', grade: 'A' },
  { slug: 'cumin',          name: 'Cumin (Jeera)',  variety: 'GC-4',       emoji: '🌱', cat: 'spices', unit: 'QUINTAL', price: 24500, anchor: 27000, qty: 60,  location: 'Unjha',     state: 'Gujarat',        grade: 'A' },
  { slug: 'coriander-seed', name: 'Coriander Seed', variety: 'Eagle',      emoji: '🌿', cat: 'spices', unit: 'QUINTAL', price: 6800,  anchor: 7600,  qty: 130, location: 'Kota',      state: 'Rajasthan',      grade: 'A' },
  { slug: 'soybean',        name: 'Soybean',        variety: 'JS-335',     emoji: '🫘', cat: 'spices', unit: 'QUINTAL', price: 5420,  anchor: 5880,  qty: 260, location: 'Latur',     state: 'Maharashtra',    grade: 'A' },
  { slug: 'mustard',        name: 'Mustard',        variety: 'Pusa Bold',  emoji: '🌼', cat: 'spices', unit: 'QUINTAL', price: 5650,  anchor: 6050,  qty: 220, location: 'Bharatpur', state: 'Rajasthan',      grade: 'A' },
  { slug: 'groundnut',      name: 'Groundnut',      variety: 'Bold 40/50', emoji: '🥜', cat: 'spices', unit: 'QUINTAL', price: 6400,  anchor: 6900,  qty: 190, location: 'Rajkot',    state: 'Gujarat',        grade: 'A' },
  { slug: 'cotton',         name: 'Cotton',         variety: 'Shankar-6',  emoji: '☁️', cat: 'spices', unit: 'QUINTAL', price: 7800,  anchor: 8350,  qty: 140, location: 'Rajkot',    state: 'Gujarat',        grade: 'A' },
];

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
}

// Keyed by catalogue slug. Live listings are matched by crop name via NAME_TO_PACK.
const PACKS: Record<string, Pack> = {
  // Vegetables
  tomato: { label: '1 kg', kg: 1 },
  onion: { label: '1 kg', kg: 1 },
  potato: { label: '1 kg', kg: 1 },
  okra: { label: '500 g', kg: 0.5 },
  cauliflower: { label: '1 kg', kg: 1 },
  brinjal: { label: '500 g', kg: 0.5 },
  'green-chilli': { label: '250 g', kg: 0.25 },
  spinach: { label: '250 g', kg: 0.25 },

  // Dairy
  'cow-milk': { label: '1 L', kg: 1 },
  'buffalo-milk': { label: '1 L', kg: 1 },
  curd: { label: '500 g', kg: 0.5 },
  paneer: { label: '200 g', kg: 0.2 },
  ghee: { label: '500 g', kg: 0.5 },

  // Fruits
  mango: { label: '1 kg', kg: 1 },
  banana: { label: '1 kg', kg: 1 },
  pomegranate: { label: '1 kg', kg: 1 },
  grapes: { label: '500 g', kg: 0.5 },
  guava: { label: '500 g', kg: 0.5 },
  papaya: { label: '1 kg', kg: 1 },
  apple: { label: '1 kg', kg: 1 },
  watermelon: { label: '2 kg', kg: 2 },

  // Grains & pulses. Paddy is not rice — the shopper pack is milled and
  // polished, so it carries a processing uplift instead of the shelf margin.
  wheat: { label: '5 kg', kg: 5 },
  'basmati-rice': { label: '5 kg', kg: 5, margin: 0.85 },
  bajra: { label: '2 kg', kg: 2 },
  chana: { label: '1 kg', kg: 1 },
  'tur-dal': { label: '1 kg', kg: 1 },
  moong: { label: '1 kg', kg: 1 },
  masoor: { label: '1 kg', kg: 1 },

  // Spices & oilseeds
  turmeric: { label: '200 g', kg: 0.2 },
  'red-chilli': { label: '200 g', kg: 0.2 },
  cumin: { label: '100 g', kg: 0.1 },
  'coriander-seed': { label: '200 g', kg: 0.2 },
  mustard: { label: '500 g', kg: 0.5 },
  groundnut: { label: '1 kg', kg: 1 },
};

// Fibre, feed and crush crops — bought by the quintal or not at all.
const BULK_ONLY = new Set(['cotton', 'soybean', 'maize', 'jute', 'sugarcane', 'castor', 'guar']);

// A live listing arrives as a crop NAME ("Cow Milk"), not a slug, so index the
// catalogue by name too; anything off-catalogue falls back to a rail default.
const NAME_TO_PACK = new Map<string, Pack>();
for (const d of DEMO_PRODUCTS) {
  const pack = PACKS[d.slug];
  if (pack) NAME_TO_PACK.set(d.name.trim().toLowerCase(), pack);
}

const DEFAULT_PACK: Record<RailId, Pack> = {
  veg: { label: '1 kg', kg: 1 },
  dairy: { label: '1 L', kg: 1 },
  fruits: { label: '1 kg', kg: 1 },
  grains: { label: '1 kg', kg: 1 },
  spices: { label: '200 g', kg: 0.2 },
};

export interface ShopPack {
  label: string;      // "1 kg", "100 g"
  suffix: string;     // label as a price suffix — "₹34/kg" reads better than "₹34/1 kg"
  price: number;      // ₹ for one pack
  anchor: number;     // ₹ for one pack at the wholesale ceiling — the struck-through number
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
  if (BULK_ONLY.has(key)) return null;
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
    perKg: perUnit / kgPerUnit,
    perKgLabel: opts.unit === 'LITRE' ? 'L' : 'kg',
  };
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
