// Shared crop catalogue — the single source of truth for the crop picker on the
// listing form and the "Fresh produce" filter in the marketplace.
//
// Names are kept PLAIN (e.g. "Corn", "Chana Dal") so they stay aligned with the
// MSP keys in msp.ts and any existing listing data. The server accepts any crop
// string, so this list is purely a front-end convenience and can grow freely.

import { resolveCommodity } from './cropAliases';

export interface CropCategory {
  name: string;
  icon: string;
  crops: string[];
}

export const CROP_CATEGORIES: CropCategory[] = [
  { name: 'Cereals & Grains', icon: '🌾', crops: ['Rice', 'Wheat', 'Corn', 'Barley', 'Ragi', 'Jowar', 'Bajra', 'Oats'] },
  { name: 'Pulses & Legumes', icon: '🫘', crops: ['Chana Dal', 'Toor Dal', 'Moong Dal', 'Urad Dal', 'Masoor Dal', 'Rajma'] },
  { name: 'Oilseeds', icon: '🫒', crops: ['Soybean', 'Mustard', 'Groundnut', 'Sunflower', 'Sesame', 'Castor'] },
  { name: 'Cash Crops', icon: '💰', crops: ['Cotton', 'Sugarcane', 'Coffee', 'Tea', 'Jute', 'Tobacco'] },
  { name: 'Spices', icon: '🌶️', crops: ['Turmeric', 'Pepper', 'Chili', 'Cardamom', 'Cumin', 'Coriander', 'Ginger', 'Garlic'] },
  { name: 'Vegetables', icon: '🥬', crops: ['Tomato', 'Potato', 'Onion', 'Cauliflower', 'Cabbage', 'Spinach', 'Okra', 'Brinjal', 'Carrot', 'Green Peas', 'Bottle Gourd', 'Bitter Gourd', 'Pumpkin', 'Cucumber', 'Capsicum', 'Beetroot', 'Radish', 'Sweet Potato'] },
  { name: 'Fruits', icon: '🍎', crops: ['Mango', 'Banana', 'Apple', 'Orange', 'Grapes', 'Papaya', 'Guava', 'Pomegranate', 'Watermelon', 'Pineapple', 'Coconut', 'Lemon', 'Sapota', 'Custard Apple', 'Jackfruit', 'Strawberry'] },
  { name: 'Nuts & Dry Fruits', icon: '🥜', crops: ['Almond', 'Cashew', 'Walnut', 'Pistachio', 'Arecanut'] },
  { name: 'Dairy', icon: '🥛', crops: ['Cow Milk', 'Buffalo Milk', 'Goat Milk', 'Curd (Dahi)', 'Paneer', 'Ghee', 'Khoa'] },
];

// Flat list of every crop in the catalogue.
export const ALL_CROPS: string[] = CROP_CATEGORIES.flatMap((c) => c.crops);

// "Fresh produce" = vegetables + fruits — the perishable, sold-direct-to-local
// -buyers segment. Used by the marketplace Fresh produce filter.
export const FRESH_PRODUCE_CATEGORIES = ['Vegetables', 'Fruits'];

export const FRESH_PRODUCE_CROPS: string[] = CROP_CATEGORIES
  .filter((c) => FRESH_PRODUCE_CATEGORIES.includes(c.name))
  .flatMap((c) => c.crops);

const FRESH_SET = new Set(FRESH_PRODUCE_CROPS.map((c) => c.toLowerCase()));

export function isFreshProduce(cropName: string): boolean {
  return FRESH_SET.has(cropName.toLowerCase());
}

// ---------------------------------------------------------------------------
// Spoken crop name → a value the crop <select> actually offers
// ---------------------------------------------------------------------------
// cropAliases.ts already knows that "kanda" and "pyaz" mean onion — but it
// resolves to AGMARKNET BOARD COMMODITIES, and this catalogue spells several of
// those differently. resolveCommodity('makka') returns "Maize" while the picker
// only offers "Corn", so feeding its output straight into the form would leave
// the crop field empty for some of the most commonly spoken words.
//
// This bridges the gap. It lives here, not in cropAliases.ts, because it is
// about THIS catalogue: that file must stay byte-comparable with its mirror in
// server/src/services/prediction.service.ts, and this mapping has no meaning
// server-side.
const BOARD_TO_CATALOGUE: Record<string, string> = {
  'Paddy(Dhan)(Common)': 'Rice',
  'Maize': 'Corn',
  'Soyabean': 'Soybean',
  'Green Chilli': 'Chili',
  'Bhindi(Ladies Finger)': 'Okra',
  'Curd': 'Curd (Dahi)',
  // The board has one "Milk" row; the catalogue splits it by animal. Cow milk
  // is much the most common, and the farmer can change it in one tap.
  'Milk': 'Cow Milk',
};

const CATALOGUE_INDEX = new Map(ALL_CROPS.map((c) => [c.toLowerCase(), c]));

/**
 * Best catalogue crop for a spoken or free-text name, or null when nothing
 * matches confidently.
 *
 * Used to pre-fill the crop picker from a voice note. Returning null is a
 * perfectly good outcome — the form leaves the picker empty and tells the
 * farmer what it heard, which is far better than silently selecting the wrong
 * crop and having them publish it.
 */
export function resolveCatalogueCrop(spoken: string): string | null {
  const trimmed = spoken?.trim();
  if (!trimmed) return null;

  // 1. Already a catalogue name ("Onion", "onion", "ONION").
  const direct = CATALOGUE_INDEX.get(trimmed.toLowerCase());
  if (direct) return direct;

  // 2. A name the alias table knows ("kanda", "makka", "dhan").
  const commodity = resolveCommodity(trimmed);
  if (!commodity) return null;

  // 3. Board spelling → catalogue spelling, when they differ.
  const bridged = BOARD_TO_CATALOGUE[commodity];
  if (bridged) return bridged;

  // 4. Board and catalogue agree (e.g. "Tomato", "Wheat", "Turmeric").
  //    Anything the catalogue does not carry at all — "Cocoa" has a board row
  //    but no picker entry — falls through to null rather than being invented.
  return CATALOGUE_INDEX.get(commodity.toLowerCase()) ?? null;
}
