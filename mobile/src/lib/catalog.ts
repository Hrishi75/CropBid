// Storefront catalog — the same static demo lots, rails, tiles, and price
// ticker the WEB homepage renders (client/src/pages/LandingPage.tsx), so the
// mobile home always shows a full market with prices even before any farmer
// has listed. Live API listings are merged in on top of these; a demo lot is
// hidden as soon as a real lot for the same crop exists.
//
// Prices are ₹ mandi bands at or above the 2025-26 government MSP where
// applicable — keep in sync with the web PRODUCTS list when either changes.

import { CROP_CATEGORIES } from './crops';

export type RailId = 'veg' | 'fruits' | 'grains' | 'spices';

export interface DemoProduct {
  slug: string;
  name: string;
  variety: string;
  emoji: string;
  cat: RailId;
  unit: 'KG' | 'QUINTAL';
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

export const RAILS: Array<{ id: RailId; eyebrow: string; title: string }> = [
  { id: 'veg',    eyebrow: 'Farm-fresh · picked this week', title: 'Fresh Vegetables' },
  { id: 'fruits', eyebrow: 'In season now',                 title: 'Seasonal Fruits' },
  { id: 'grains', eyebrow: 'MSP-anchored floors',           title: 'Grains & Pulses' },
  { id: 'spices', eyebrow: 'Straight from origin mandis',   title: 'Spices & Oilseeds' },
];

export const CATEGORY_TILES: Array<{ label: string; target: RailId; emoji: string }> = [
  { label: 'Fresh Vegetables', target: 'veg',    emoji: '🍅' },
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
  { label: 'Fruits', target: 'fruits' },
  { label: 'Grains & Pulses', target: 'grains' },
  { label: 'Spices & Oilseeds', target: 'spices' },
];

// Top ticker — same ten crops and day-over-day moves as the web homepage.
export const TICKER: Array<{ name: string; price: number; unit: 'KG' | 'QUINTAL'; delta: number }> = [
  { name: 'Wheat',        price: 2480,  unit: 'QUINTAL', delta: 0.9 },
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
