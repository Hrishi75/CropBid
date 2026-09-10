// Storefront catalog — how the market screen is laid out.
//
// This file used to also carry DEMO_PRODUCTS: ~40 invented lots with villages,
// grades, quantities and prices, which the storefront home merged underneath
// the live API listings so the market "always rendered full". It rendered full
// of things nobody had listed, in cards indistinguishable from real ones, and
// readers took every one of them for a farmer's lot. They are gone. The
// storefront shows live listings only, and says so plainly when there are none.
//
// It also used to carry the pack maths: how a household-sized pack was cut and
// priced out of a farmer's lot, with a category retail margin on top. That went
// with the retail tier itself. THIS APP TRADES IN LOTS, priced per the seller's
// own unit, and households buy by the kilo in cropbid-daily/ instead.
//
// What remains is the rails, tiles, chips and ticker the home screen lays out.

import { CROP_CATEGORIES } from './crops';

export type RailId = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

export const RAILS: Array<{ id: RailId; eyebrow: string; title: string }> = [
  { id: 'veg',    eyebrow: 'Open lots · harvested this week',     title: 'Fresh Vegetables' },
  { id: 'dairy',  eyebrow: 'Daily collection · cold chain',       title: 'Milk & Dairy' },
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
