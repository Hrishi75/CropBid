// Shared crop catalogue — the single source of truth for the crop picker on the
// listing form and the "Fresh produce" filter in the marketplace.
//
// Names are kept PLAIN (e.g. "Corn", "Chana Dal") so they stay aligned with the
// MSP keys in msp.ts and any existing listing data. The server accepts any crop
// string, so this list is purely a front-end convenience and can grow freely.

export interface CropCategory {
  name: string;
  icon: string;
  crops: string[];
}

export const CROP_CATEGORIES: CropCategory[] = [
  { name: 'Cereals & Grains', icon: '🌾', crops: ['Rice', 'Wheat', 'Corn', 'Barley', 'Ragi', 'Jowar', 'Bajra', 'Oats'] },
  { name: 'Pulses & Legumes', icon: '🫘', crops: ['Chana Dal', 'Toor Dal', 'Moong Dal', 'Urad Dal', 'Masoor Dal', 'Rajma'] },
  { name: 'Oilseeds', icon: '🫒', crops: ['Soybean', 'Mustard', 'Groundnut', 'Sunflower', 'Sesame'] },
  { name: 'Cash Crops', icon: '💰', crops: ['Cotton', 'Sugarcane', 'Coffee', 'Tea', 'Jute', 'Tobacco'] },
  { name: 'Spices', icon: '🌶️', crops: ['Turmeric', 'Pepper', 'Chili', 'Cardamom', 'Cumin', 'Coriander', 'Ginger', 'Garlic'] },
  { name: 'Vegetables', icon: '🥬', crops: ['Tomato', 'Potato', 'Onion', 'Cauliflower', 'Cabbage', 'Spinach', 'Okra', 'Brinjal', 'Carrot', 'Green Peas', 'Bottle Gourd', 'Bitter Gourd', 'Pumpkin', 'Cucumber', 'Capsicum', 'Beetroot', 'Radish', 'Sweet Potato'] },
  { name: 'Fruits', icon: '🍎', crops: ['Mango', 'Banana', 'Apple', 'Orange', 'Grapes', 'Papaya', 'Guava', 'Pomegranate', 'Watermelon', 'Pineapple', 'Coconut', 'Lemon', 'Sapota', 'Custard Apple', 'Jackfruit', 'Strawberry'] },
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
