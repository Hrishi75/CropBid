// =============================================================================
// Landing Page — grocery-style storefront (public homepage)
// =============================================================================
// Blinkit-pattern homepage: the store IS the page. Sticky search header with a
// rotating placeholder, category chips, promo banner, category tiles, and
// horizontally scrolling product rails of live lots. Everything else (how it
// works, buyer agents, pricing) lives on /how-it-works, linked from the header
// and footer.
//
// Product catalogue is STATIC demo data; the price layer is LIVE — the top
// ticker, hero floating chips, and the mandi rates board all pull today's
// real wholesale prices from /api/rates/board (Govt Agmarknet feed) and fall
// back to static reference numbers if the API is unreachable. Prices are
// ₹-native and converted to the viewer's currency via the shared FX table.
// Product photos load from /products/<slug>.jpg with an emoji-tile fallback.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { LiveShelf } from './consumer/LiveShelf';
import type { User } from '../types';
import {
  type Country, type CurrencyCode, type UnitCode,
  UNIT_LABEL, formatUnitPrice,
  loadCountry, saveCountry, CountrySelector,
  ArcMark, ArrowIcon, ChevronIcon, SearchIcon, CBFooter, India2047Mark,
} from './landing/shared';

// =============================================================================
// Catalog — static demo lots
// =============================================================================

type RailId = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

interface Produce {
  slug: string;          // image filename: /products/<slug>.jpg
  name: string;
  variety: string;
  emoji: string;         // fallback tile until the photo is uploaded
  cat: RailId;
  unit: UnitCode;
  priceMin: number;      // ₹ per unit — farmer's floor (what you pay today)
  priceMax: number;      // ₹ per unit — wholesale ceiling (anchor price)
  qty: number;           // available, in `unit`
  location: string;
  state: string;
  bids: number;
  grade: 'A' | 'B';
  organic?: boolean;
}

const PRODUCTS: Produce[] = [
  // Fresh vegetables — ₹/kg
  { slug: 'tomato',       name: 'Tomato',        variety: 'Hybrid',             emoji: '🍅', cat: 'veg', unit: 'KG', priceMin: 26,  priceMax: 34,  qty: 1200, location: 'Nashik',    state: 'Maharashtra',      bids: 4, grade: 'A' },
  { slug: 'onion',        name: 'Onion',         variety: 'Nashik Red',         emoji: '🧅', cat: 'veg', unit: 'KG', priceMin: 18,  priceMax: 24,  qty: 2500, location: 'Lasalgaon', state: 'Maharashtra',      bids: 6, grade: 'A' },
  { slug: 'potato',       name: 'Potato',        variety: 'Kufri Jyoti',        emoji: '🥔', cat: 'veg', unit: 'KG', priceMin: 14,  priceMax: 19,  qty: 3000, location: 'Agra',      state: 'Uttar Pradesh',    bids: 3, grade: 'B' },
  { slug: 'okra',         name: 'Okra (Bhindi)', variety: 'Arka Anamika',       emoji: '🌿', cat: 'veg', unit: 'KG', priceMin: 28,  priceMax: 38,  qty: 450,  location: 'Vadodara',  state: 'Gujarat',          bids: 2, grade: 'A' },
  { slug: 'cauliflower',  name: 'Cauliflower',   variety: 'Snowball',           emoji: '🥦', cat: 'veg', unit: 'KG', priceMin: 22,  priceMax: 30,  qty: 800,  location: 'Pune',      state: 'Maharashtra',      bids: 3, grade: 'A' },
  { slug: 'brinjal',      name: 'Brinjal',       variety: 'Bharta',             emoji: '🍆', cat: 'veg', unit: 'KG', priceMin: 18,  priceMax: 26,  qty: 600,  location: 'Kolar',     state: 'Karnataka',        bids: 2, grade: 'B' },
  { slug: 'green-chilli', name: 'Green Chilli',  variety: 'G4',                 emoji: '🌶️', cat: 'veg', unit: 'KG', priceMin: 45,  priceMax: 60,  qty: 350,  location: 'Guntur',    state: 'Andhra Pradesh',   bids: 5, grade: 'A' },
  { slug: 'spinach',      name: 'Spinach',       variety: 'All Green',          emoji: '🥬', cat: 'veg', unit: 'KG', priceMin: 15,  priceMax: 22,  qty: 300,  location: 'Indore',    state: 'Madhya Pradesh',   bids: 1, grade: 'A', organic: true },

  // Seasonal fruits — ₹/kg
  // Milk & dairy — ₹/kg (≈ per litre for liquid milk). Floors track Amul's
  // Jun-2026 procurement rates; ceilings track DoCA retail levels (Jul 2026).
  // Keep in sync with mobile/src/lib/catalog.ts.
  { slug: 'cow-milk',     name: 'Cow Milk',      variety: '4% Fat',             emoji: '🥛', cat: 'dairy', unit: 'LITRE', priceMin: 55,  priceMax: 58,  qty: 600, location: 'Anand',    state: 'Gujarat',     bids: 5, grade: 'A' },
  { slug: 'buffalo-milk', name: 'Buffalo Milk',  variety: 'Murrah',             emoji: '🐃', cat: 'dairy', unit: 'LITRE', priceMin: 69,  priceMax: 72,  qty: 450, location: 'Karnal',   state: 'Haryana',     bids: 4, grade: 'A' },
  { slug: 'curd',         name: 'Curd (Dahi)',   variety: 'Farm-set',           emoji: '🥣', cat: 'dairy', unit: 'LITRE', priceMin: 55,  priceMax: 75,  qty: 200, location: 'Kolhapur', state: 'Maharashtra', bids: 2, grade: 'A' },
  { slug: 'paneer',       name: 'Paneer',        variety: 'Malai',              emoji: '🧀', cat: 'dairy', unit: 'KG', priceMin: 340, priceMax: 400, qty: 80,  location: 'Pune',     state: 'Maharashtra', bids: 3, grade: 'A' },
  { slug: 'ghee',         name: 'Ghee',          variety: 'Desi Cow',           emoji: '🧈', cat: 'dairy', unit: 'KG', priceMin: 540, priceMax: 650, qty: 60,  location: 'Jaipur',   state: 'Rajasthan',   bids: 6, grade: 'A', organic: true },

  { slug: 'mango',        name: 'Mango',         variety: 'Kesar',              emoji: '🥭', cat: 'fruits', unit: 'KG', priceMin: 90,  priceMax: 140, qty: 900,  location: 'Junagadh',  state: 'Gujarat',          bids: 8, grade: 'A' },
  { slug: 'banana',       name: 'Banana',        variety: 'G9 Cavendish',       emoji: '🍌', cat: 'fruits', unit: 'KG', priceMin: 28,  priceMax: 38,  qty: 2000, location: 'Jalgaon',   state: 'Maharashtra',      bids: 4, grade: 'A' },
  { slug: 'pomegranate',  name: 'Pomegranate',   variety: 'Bhagwa',             emoji: '🍒', cat: 'fruits', unit: 'KG', priceMin: 110, priceMax: 160, qty: 700,  location: 'Solapur',   state: 'Maharashtra',      bids: 5, grade: 'A' },
  { slug: 'grapes',       name: 'Grapes',        variety: 'Thompson Seedless',  emoji: '🍇', cat: 'fruits', unit: 'KG', priceMin: 70,  priceMax: 95,  qty: 1100, location: 'Nashik',    state: 'Maharashtra',      bids: 3, grade: 'A' },
  { slug: 'guava',        name: 'Guava',         variety: 'Allahabad Safeda',   emoji: '🍐', cat: 'fruits', unit: 'KG', priceMin: 40,  priceMax: 60,  qty: 500,  location: 'Prayagraj', state: 'Uttar Pradesh',    bids: 2, grade: 'A' },
  { slug: 'papaya',       name: 'Papaya',        variety: 'Red Lady',           emoji: '🍈', cat: 'fruits', unit: 'KG', priceMin: 25,  priceMax: 35,  qty: 850,  location: 'Coimbatore', state: 'Tamil Nadu',      bids: 2, grade: 'B' },
  { slug: 'apple',        name: 'Apple',         variety: 'Royal Delicious',    emoji: '🍎', cat: 'fruits', unit: 'KG', priceMin: 120, priceMax: 170, qty: 1500, location: 'Shimla',    state: 'Himachal Pradesh', bids: 6, grade: 'A' },
  { slug: 'watermelon',   name: 'Watermelon',    variety: 'Sugar Baby',         emoji: '🍉', cat: 'fruits', unit: 'KG', priceMin: 12,  priceMax: 18,  qty: 4000, location: 'Kurnool',   state: 'Andhra Pradesh',   bids: 3, grade: 'B' },

  // Grains & pulses — ₹/quintal
  { slug: 'wheat',        name: 'Wheat',         variety: 'Sharbati',           emoji: '🌾', cat: 'grains', unit: 'QUINTAL', priceMin: 2480,  priceMax: 2760,  qty: 320, location: 'Sehore',     state: 'Madhya Pradesh', bids: 3, grade: 'A' },
  { slug: 'basmati-rice', name: 'Basmati Paddy', variety: 'Pusa 1509',          emoji: '🍚', cat: 'grains', unit: 'QUINTAL', priceMin: 3600,  priceMax: 4200,  qty: 210, location: 'Karnal',     state: 'Haryana',        bids: 5, grade: 'A' },
  { slug: 'maize',        name: 'Maize',         variety: 'Yellow Dent',        emoji: '🌽', cat: 'grains', unit: 'QUINTAL', priceMin: 2100,  priceMax: 2350,  qty: 400, location: 'Davangere',  state: 'Karnataka',      bids: 2, grade: 'B' },
  { slug: 'bajra',        name: 'Bajra',         variety: 'HHB-67',             emoji: '🌾', cat: 'grains', unit: 'QUINTAL', priceMin: 2350,  priceMax: 2600,  qty: 180, location: 'Jodhpur',    state: 'Rajasthan',      bids: 1, grade: 'A' },
  { slug: 'chana',        name: 'Chana',         variety: 'Desi Gram',          emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 5720,  priceMax: 6180,  qty: 180, location: 'Kota',       state: 'Rajasthan',      bids: 4, grade: 'A', organic: true },
  { slug: 'tur-dal',      name: 'Tur (Arhar)',   variety: 'Maruti',             emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 7400,  priceMax: 7900,  qty: 150, location: 'Kalaburagi', state: 'Karnataka',      bids: 3, grade: 'A' },
  { slug: 'moong',        name: 'Moong',         variety: 'SML-668',            emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 8200,  priceMax: 8700,  qty: 120, location: 'Merta',      state: 'Rajasthan',      bids: 2, grade: 'A' },
  { slug: 'masoor',       name: 'Masoor',        variety: 'KLS-218',            emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 6400,  priceMax: 6800,  qty: 140, location: 'Sagar',      state: 'Madhya Pradesh', bids: 1, grade: 'B' },

  // Spices & oilseeds — ₹/quintal
  { slug: 'turmeric',       name: 'Turmeric',       variety: 'Salem',        emoji: '🫚', cat: 'spices', unit: 'QUINTAL', priceMin: 13800, priceMax: 15200, qty: 90,  location: 'Erode',     state: 'Tamil Nadu',     bids: 6, grade: 'A' },
  { slug: 'red-chilli',     name: 'Red Chilli',     variety: 'Teja S17',     emoji: '🌶️', cat: 'spices', unit: 'QUINTAL', priceMin: 15500, priceMax: 17800, qty: 110, location: 'Guntur',    state: 'Andhra Pradesh', bids: 7, grade: 'A' },
  { slug: 'cumin',          name: 'Cumin (Jeera)',  variety: 'GC-4',         emoji: '🌱', cat: 'spices', unit: 'QUINTAL', priceMin: 24500, priceMax: 27000, qty: 60,  location: 'Unjha',     state: 'Gujarat',        bids: 4, grade: 'A' },
  { slug: 'coriander-seed', name: 'Coriander Seed', variety: 'Eagle',        emoji: '🌿', cat: 'spices', unit: 'QUINTAL', priceMin: 6800,  priceMax: 7600,  qty: 130, location: 'Kota',      state: 'Rajasthan',      bids: 2, grade: 'A' },
  { slug: 'soybean',        name: 'Soybean',        variety: 'JS-335',       emoji: '🫘', cat: 'spices', unit: 'QUINTAL', priceMin: 5420,  priceMax: 5880,  qty: 260, location: 'Latur',     state: 'Maharashtra',    bids: 2, grade: 'A' },
  { slug: 'mustard',        name: 'Mustard',        variety: 'Pusa Bold',    emoji: '🌼', cat: 'spices', unit: 'QUINTAL', priceMin: 5650,  priceMax: 6050,  qty: 220, location: 'Bharatpur', state: 'Rajasthan',      bids: 3, grade: 'A' },
  { slug: 'groundnut',      name: 'Groundnut',      variety: 'Bold 40/50',   emoji: '🥜', cat: 'spices', unit: 'QUINTAL', priceMin: 6400,  priceMax: 6900,  qty: 190, location: 'Rajkot',    state: 'Gujarat',        bids: 4, grade: 'A' },
  { slug: 'cotton',         name: 'Cotton',         variety: 'Shankar-6',    emoji: '☁️', cat: 'spices', unit: 'QUINTAL', priceMin: 7800,  priceMax: 8350,  qty: 140, location: 'Rajkot',    state: 'Gujarat',        bids: 4, grade: 'A' },
];

const RAILS: Array<{ id: RailId; eyebrow: string; title: string }> = [
  { id: 'veg',    eyebrow: 'Farm-fresh · picked this week',      title: 'Fresh Vegetables' },
  { id: 'dairy',  eyebrow: 'Milked this morning · farm chilled', title: 'Milk & Dairy' },
  { id: 'fruits', eyebrow: 'In season now',                      title: 'Seasonal Fruits' },
  { id: 'grains', eyebrow: 'MSP-anchored floors',                title: 'Grains & Pulses' },
  { id: 'spices', eyebrow: 'Straight from origin mandis',        title: 'Spices & Oilseeds' },
];

// Extra search terms per rail so "dal" or "masala" find things.
const CAT_KEYWORDS: Record<RailId, string> = {
  veg: 'vegetable sabzi fresh',
  dairy: 'milk doodh dairy dahi paneer ghee butter',
  fruits: 'fruit fresh',
  grains: 'grain cereal pulse dal rice paddy',
  spices: 'spice masala oilseed fibre',
};

const CATEGORY_TILES: Array<{ label: string; target: RailId; img: string; emoji: string }> = [
  { label: 'Fresh Vegetables', target: 'veg',    img: 'tomato',       emoji: '🍅' },
  { label: 'Milk & Dairy',     target: 'dairy',  img: 'cow-milk',     emoji: '🥛' },
  { label: 'Seasonal Fruits',  target: 'fruits', img: 'mango',        emoji: '🥭' },
  { label: 'Grains & Cereals', target: 'grains', img: 'wheat',        emoji: '🌾' },
  { label: 'Pulses & Dal',     target: 'grains', img: 'chana',        emoji: '🫘' },
  { label: 'Rice & Paddy',     target: 'grains', img: 'basmati-rice', emoji: '🍚' },
  { label: 'Spices',           target: 'spices', img: 'turmeric',     emoji: '🫚' },
  { label: 'Oilseeds',         target: 'spices', img: 'mustard',      emoji: '🌼' },
  { label: 'Cotton & Fibre',   target: 'spices', img: 'cotton',       emoji: '☁️' },
];

const CHIPS: Array<[label: string, target: RailId | 'top']> = [
  ['All', 'top'],
  ['Vegetables', 'veg'],
  ['Milk & Dairy', 'dairy'],
  ['Fruits', 'fruits'],
  ['Grains & Pulses', 'grains'],
  ['Spices & Oilseeds', 'spices'],
];

// The header's section links. Rendered inline on desktop and inside the
// collapsed menu below 960px, from one list so the two never drift apart.
const SECTION_LINKS: Array<[label: string, to: string]> = [
  ['Live rates', '/rates'],
  ['Forecast', '/forecast'],
  ['Yojana', '/schemes'],
  ['Equipment', '/equipment'],
  ['How it works', '/how-it-works'],
];

const SEARCH_WORDS = ['tomatoes', 'fresh cow milk', 'kesar mangoes', 'sharbati wheat', 'turmeric', 'basmati paddy', 'onions', 'chana dal', 'fresh okra'];

// Top ticker — crop, ₹ floor price, day-over-day move.
const TICKER: Array<{ p: Produce; delta: number }> = [
  { p: PRODUCTS.find((x) => x.slug === 'wheat')!,        delta: 0.9 },
  { p: PRODUCTS.find((x) => x.slug === 'cow-milk')!,     delta: 0.4 },
  { p: PRODUCTS.find((x) => x.slug === 'onion')!,        delta: -1.2 },
  { p: PRODUCTS.find((x) => x.slug === 'mango')!,        delta: 2.1 },
  { p: PRODUCTS.find((x) => x.slug === 'chana')!,        delta: 0.7 },
  { p: PRODUCTS.find((x) => x.slug === 'turmeric')!,     delta: 1.4 },
  { p: PRODUCTS.find((x) => x.slug === 'cotton')!,       delta: -0.5 },
  { p: PRODUCTS.find((x) => x.slug === 'soybean')!,      delta: 1.3 },
  { p: PRODUCTS.find((x) => x.slug === 'tomato')!,       delta: 0.8 },
  { p: PRODUCTS.find((x) => x.slug === 'basmati-rice')!, delta: 0.6 },
  { p: PRODUCTS.find((x) => x.slug === 'cumin')!,        delta: -0.9 },
];

// =============================================================================
// Live mandi rates — /api/rates/board (Govt Agmarknet, daily)
// =============================================================================

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: UnitCode;
  cat: RailId;
  modal: number;       // ₹ per unit — today's clearing price
  min: number;
  max: number;
  usual: number;       // the crop's usual reference price
  changePct: number;   // today vs usual, % — the price signal
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface RatesBoardData { date: string; live: boolean; rates: LiveRate[]; }

// `pending` is what stops the board shoving the page around. The section holds
// its height with a skeleton while the request is in flight, so today's rates
// swap into a box that is already the right size instead of appearing from
// nothing and pushing every rail below it down the page.
//
// It starts true and STAYS true through the prerender — effects don't run in
// renderToString — so the static HTML reserves the space as well, and the
// reload doesn't jump the moment React takes over either.
function useLiveRates(): { board: RatesBoardData | null; pending: boolean } {
  const [board, setBoard] = useState<RatesBoardData | null>(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let on = true;
    api.get('/rates/board')
      .then(({ data }) => { if (on && data?.rates?.length) setBoard(data); })
      .catch(() => { /* ticker & board fall back to static reference prices */ })
      .finally(() => { if (on) setPending(false); });
    return () => { on = false; };
  }, []);
  return { board, pending };
}

function Delta({ pct, flatLabel }: { pct: number; flatLabel?: string }) {
  if (Math.abs(pct) < 0.1) {
    return flatLabel ? <span className="d flat">{flatLabel}</span> : null;
  }
  return (
    <span className={`d ${pct >= 0 ? 'pos' : 'neg'}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function formatQty(p: Produce): string {
  if (p.unit === 'KG' && p.qty >= 1000) return `${(p.qty / 1000).toFixed(1)} tonnes`;
  return `${p.qty.toLocaleString('en-IN')} ${UNIT_LABEL[p.unit]}`;
}

function pctOff(p: Produce): number {
  return Math.round((1 - p.priceMin / p.priceMax) * 100);
}

// =============================================================================
// Consumer packs — the retail tier
// =============================================================================
// A household does not buy a 1.2-tonne tomato lot. Every consumer-grade crop
// carries a shop pack (1 kg tomatoes, 1 L milk, 100 g jeera) priced off the
// farmgate floor plus a category retail margin — grading, packing, cold chain,
// last-mile and wastage. That still lands well under supermarket shelf prices,
// which is the whole pitch.
//
// The wholesale tier does not go away: it stays on the card as a second line
// (₹/quintal × the full lot) for bulk buyers, who bid rather than add to cart.
// Crops with no PACKS entry — cotton, soybean, maize — are bulk-only: nobody
// shops for a kilo of Shankar-6.
//
// Both tiers move together, since both derive from the same farmgate floor.
// Keep in sync with mobile/src/lib/catalog.ts.
// =============================================================================

const KG_PER_UNIT: Record<UnitCode, number> = { KG: 1, LITRE: 1, QUINTAL: 100, TONNE: 1000 };

const RETAIL_MARGIN: Record<RailId, number> = {
  veg: 0.30,     // washed, graded, crated — highest wastage
  fruits: 0.30,
  dairy: 0.10,   // chilled chain already priced into the procurement rate
  grains: 0.25,  // cleaned, bagged, shelf-stable
  spices: 0.25,
};

interface Pack {
  label: string;   // what the shopper puts in the basket
  kg: number;      // pack size in kg — litres for liquids
  margin?: number; // overrides the category margin
}

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

interface RetailPack {
  label: string;      // "1 kg", "100 g"
  suffix: string;     // label as a price suffix — "₹34/kg" reads better than "₹34/1 kg"
  price: number;      // ₹ for one pack
  anchor: number;     // ₹ for one pack at the wholesale ceiling — the struck-through number
  perKg: number;      // ₹ per kg (litre for liquids), so packs stay comparable. Never
  perKgLabel: string; // per quintal: "₹31/kg" is what a shopper checks, not "₹3,100/qtl".
}

// null for a bulk-only crop — the card then keeps its wholesale framing.
function retailPack(p: Produce): RetailPack | null {
  const pack = PACKS[p.slug];
  if (!pack) return null;
  const margin = pack.margin ?? RETAIL_MARGIN[p.cat];
  const perUnit = p.priceMin * (1 + margin);       // ₹ per listing unit, retail
  const packUnits = pack.kg / KG_PER_UNIT[p.unit]; // pack size in the listing's own unit
  return {
    label: pack.label,
    suffix: pack.label.replace(/^1 /, ''),
    price: Math.round(perUnit * packUnits),
    anchor: Math.round(p.priceMax * (1 + margin) * packUnits),
    perKg: perUnit / KG_PER_UNIT[p.unit],
    perKgLabel: p.unit === 'LITRE' ? 'L' : 'kg',
  };
}

// =============================================================================
// Hooks
// =============================================================================

// Fade-up sections as they enter the viewport.
//
// The hidden state is applied HERE, from JS, and only to sections that start
// below the fold. It deliberately is not a static class in the markup: this
// page is prerendered, so a `.st-reveal { opacity: 0 }` rule painted the whole
// storefront invisible below the hero until the bundle booted, and then faded
// in everything already on screen — a blank-then-fill flash on every reload.
//
// Anything on screen at mount keeps the pixels it painted with. Anything below
// the fold is hidden (invisibly, since it is off screen) and fades up when it
// is scrolled to, which is the only place the animation was ever meant to run.
// Reduced-motion users are opted out in CSS, so `is-out` is inert for them.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    // Hide without animating INTO the hidden state — the transition is only
    // ever meant to run on the way back in. Without suppressing it, scrolling
    // immediately after load could catch a section fading out under you.
    el.classList.add('no-anim', 'is-out');
    void el.offsetHeight; // flush the hidden state while the transition is off
    el.classList.remove('no-anim');

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.remove('is-out');
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// =============================================================================
// Images — /products/<slug>.jpg with emoji fallback until photos are uploaded
// =============================================================================

function ProduceImg({ slug, emoji, alt }: { slug: string; emoji: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="st-img-fb" role="img" aria-label={alt}>
        <span>{emoji}</span>
      </div>
    );
  }
  return <img src={`/products/${slug}.jpg`} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function BannerImg() {
  const [src, setSrc] = useState('/products/banner-hero.jpg');
  return (
    <img
      src={src}
      alt="Fresh produce arriving from CropBid farms"
      onError={() => { if (src !== '/mandi.jpg') setSrc('/mandi.jpg'); }}
    />
  );
}

// =============================================================================
// Header — ticker, sticky search bar, category chips
// =============================================================================

function Ticker({ currency, board }: { currency: CurrencyCode; board: RatesBoardData | null }) {
  // Live govt rates when the API answered; static reference prices otherwise.
  // Reference entries carry a "ref" marker so a mixed board never passes a
  // fallback number off as a live one.
  const ticks = board
    ? board.rates.map((r) => ({ key: r.commodity, name: r.label, price: r.modal, unit: r.unit, delta: r.changePct, ref: r.source === 'reference' }))
    : TICKER.map(({ p, delta }) => ({ key: p.slug, name: p.name, price: p.priceMin, unit: p.unit, delta, ref: true }));
  // Two equal-width copies of the list = seamless -50% marquee loop. The copies
  // are separate elements (not one flattened list) so each one owns its
  // trailing gap and the halfway point is an exact seam.
  return (
    <div className="st-ticker" aria-hidden="true">
      <div
        className="st-ticker-track"
        // Constant scroll SPEED, not constant duration. The track is
        // `width: max-content` and the keyframe travels a fixed -50% of it, so
        // a hardcoded 60s meant the marquee lurched to nearly 3x speed the
        // instant the 11 static ticks were replaced by the feed's 30. Two
        // seconds per tick reproduces today's pace on a full board.
        style={{ '--st-ticker-dur': `${ticks.length * 2}s` } as CSSProperties}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="st-ticker-copy">
            {ticks.map((t, i) => (
              <span key={`${t.key}-${i}`} className="st-tick">
                <span className="n">{t.name}</span>
                <span className="v">{formatUnitPrice(t.price, 'INR', currency)}/{UNIT_LABEL[t.unit]}</span>
                {/* every tick ends in a marker — "ref", a move, or "steady".
                    Without the flat label a live crop sitting within 0.1% of
                    its usual price rendered nothing, so the same ticker showed
                    a move on some crops and bare price on others. */}
                {t.ref ? <span className="d flat">ref</span> : <Delta pct={t.delta} flatLabel="steady" />}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreHeader({
  country, onChangeCountry, query, onQuery, onJump, user,
}: {
  country: Country;
  onChangeCountry: (c: Country) => void;
  query: string;
  onQuery: (q: string) => void;
  onJump: (target: RailId | 'top') => void;
  user: User | null;
}) {
  const { t } = useTranslation();
  // Seeded from the restored scroll position rather than defaulting to false:
  // reloading part-way down the page otherwise painted the header flat for a
  // frame and then snapped the shadow on.
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 4);
  const [wordIdx, setWordIdx] = useState(0);
  const [activeChip, setActiveChip] = useState<RailId | 'top'>('top');
  const [menuOpen, setMenuOpen] = useState(false);

  // Where the header's account link goes, decided ONCE. The inline nav and the
  // collapsed menu below both render it, and keeping two copies of the role
  // ladder is what let them disagree.
  //
  // A CONSUMER has no dashboard by design, and their main action is the shop
  // they are already looking at, so they get their orders instead. /admin is
  // the fallback for ADMIN alone.
  const account = user
    ? {
        to: user.role === 'FARMER' ? '/farmer'
          : user.role === 'BUYER' ? '/buyer'
          : user.role === 'CONSUMER' ? '/orders'
          : '/admin',
        label: user.role === 'CONSUMER' ? 'Orders' : 'Dashboard',
      }
    : { to: '/login', label: 'Sign in' };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The section links collapse into this menu below 960px. Close it on any
  // outside pointer press or Escape so it never sits open behind the page.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && (e.target as Element)?.closest?.('.st-menu-wrap')) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  // Blinkit-style rotating search hint: Search "tomatoes" → "kesar mangoes" → …
  useEffect(() => {
    const id = setInterval(() => setWordIdx((i) => (i + 1) % SEARCH_WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <header className={`st-header${scrolled ? ' scrolled' : ''}`}>
      <div className="st-header-row">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>

        <div className="st-source">
          <span className="cb-tiny st-source-l">{t('Sourcing from')}</span>
          <CountrySelector country={country} onChange={onChangeCountry} />
        </div>

        <div className="st-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search crops, fruits and vegetables"
          />
          {query === '' && (
            <span className="st-search-ph">
              Search&nbsp;“<span key={wordIdx} className="st-roll-word">{SEARCH_WORDS[wordIdx]}</span>”
            </span>
          )}
        </div>

        <nav className="st-header-links" aria-label="Primary">
          <LanguageSwitcher />
          {/* "How it works" (last) is a pitch for people who aren't signed
              up yet, so signed-in visitors don't get it in the inline row. */}
          {SECTION_LINKS.slice(0, user ? -1 : undefined).map(([label, to]) => (
            <Link key={to} to={to} className="st-header-link">{t(label)}</Link>
          ))}
          {user ? (
            // Logged in: the store stays the home page; these are the doors
            // into the app (dashboard + the role's main action).
            <>
              <Link to={account.to} className="nav-signin">{t(account.label)}</Link>
              {user.role !== 'CONSUMER' && (
                <Link
                  to={user.role === 'FARMER' ? '/farmer/listings/new' : '/buyer/browse'}
                  className="cb-btn cb-btn-primary"
                >
                  {user.role === 'FARMER' ? t('Sell a crop') : t('Browse live lots')}
                  <ArrowIcon />
                </Link>
              )}
            </>
          ) : (
            <>
              <Link to="/login" className="nav-signin">{t('Sign in')}</Link>
              <Link to="/signup" className="cb-btn cb-btn-primary">
                <span className="cb-btn-label">{t('Start selling')}</span>
                <span className="cb-btn-label-short">{t('Sell')}</span>
                <ArrowIcon />
              </Link>
            </>
          )}
        </nav>

        {/* Below 960px the section links don't fit beside the search box, so
            they collapse in here. Without this they were reachable only from
            the footer — a whole storefront's worth of scrolling away. */}
        <div className="st-menu-wrap">
          <button
            type="button"
            className="st-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('Menu')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {menuOpen && (
            <div className="st-menu" role="menu">
              {SECTION_LINKS.map(([label, to]) => (
                <Link key={to} to={to} role="menuitem" className="st-menu-link" onClick={() => setMenuOpen(false)}>
                  {t(label)}
                </Link>
              ))}
              {/* Below 640px the header drops its .nav-signin slot to keep the
                  bar on one line, so whichever link lived there — Sign in, or
                  the account link once you're logged in — has to reappear here.
                  It reads `account` rather than working the role out again:
                  the second copy of that ladder had no CONSUMER rung, so a
                  shopper on a phone got /admin, was bounced by ProtectedRoute,
                  and had no route to their orders at all. */}
              <Link
                to={account.to}
                role="menuitem"
                className="st-menu-link"
                onClick={() => setMenuOpen(false)}
              >
                {t(account.label)}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="st-chips" role="tablist" aria-label="Categories">
        {CHIPS.map(([label, target]) => (
          <button
            key={label}
            type="button"
            className={`st-chip${activeChip === target ? ' active' : ''}`}
            onClick={() => { setActiveChip(target); onJump(target); }}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </header>
  );
}

// =============================================================================
// Store sections
// =============================================================================

// Hero floating chips — three fixed slots (.c0/.c1/.c2 place them over the
// photo). Picked by slug so each chip can fall back to its catalogue reference
// price when the govt feed has nothing for that crop.
const FLOAT_CHIP_PICKS = ['tomato', 'wheat', 'mango'];

function HeroBanner({ onShop, board, currency, user }: { onShop: () => void; board: RatesBoardData | null; currency: CurrencyCode; user: User | null }) {
  const { t } = useTranslation();
  // Secondary hero action follows the viewer: guests are asked to join,
  // farmers are sent to list a crop, buyers to their working bids, shoppers to
  // their orders. A signed-in shopper must not fall through to the guest CTA —
  // "Sell your harvest" is the one thing they are certainly not here to do.
  const secondary = user?.role === 'FARMER'
    ? { to: '/farmer/listings/new', label: 'List your harvest' }
    : user?.role === 'BUYER'
      ? { to: '/buyer/bids', label: 'My bids' }
      : user?.role === 'CONSUMER'
        ? { to: '/orders', label: 'My orders' }
        : { to: '/signup', label: 'Sell your harvest' };
  // Floating live-price chips over the hero photo. Always three, always in the
  // same corners: today's real number when the govt feed answered for that
  // crop, the catalogue reference price tagged "ref" when it didn't — the same
  // honesty rule the rates board uses. Dropping the unanswered crops instead
  // (the old behaviour) meant the hero showed three chips, one, or none
  // depending on the day's feed, and the survivors slid into each other's
  // slots because the slot came from the post-filter index.
  const chips = FLOAT_CHIP_PICKS.map((slug) => {
    const p = PRODUCTS.find((x) => x.slug === slug)!;
    const live = board?.rates.find((r) => r.label === p.name && r.source !== 'reference');
    return live
      ? { slug, emoji: live.emoji, name: live.label, price: live.modal, unit: live.unit, delta: live.changePct, ref: false }
      : { slug, emoji: p.emoji, name: p.name, price: p.priceMin, unit: p.unit, delta: 0, ref: true };
  });
  return (
    <section className="st-banner">
      <div className="st-banner-grid-bg" />
      <div className="st-banner-copy">
        <span className="cb-chip cb-chip-sage" style={{ marginBottom: 18 }}>
          <span className="cb-live-dot sm" />
          {board?.live ? `Live govt mandi rates · ${board.date}` : 'Live now · 42 lots from 100+ verified farms'}
        </span>
        <h1 className="st-banner-title">
          {t('Farm-fresh crops,')}<br />
          <span className="italic">{t('farmer-fair')}</span> {t('prices.')}
        </h1>
        <p className="st-banner-lede">
          {t('Buy vegetables, fruits, grains and spices straight from the grower — today\'s real mandi price behind every pack, escrow-settled, delivered farm to door.')}
        </p>
        <div className="st-banner-actions">
          <button type="button" className="cb-btn st-btn-cream" onClick={onShop}>
            {t('Shop the market')}
            <ArrowIcon />
          </button>
          <Link to={secondary.to} className="cb-btn st-btn-outline">{t(secondary.label)}</Link>
        </div>
        <div className="st-banner-ticks">
          <span>✓ {t('Live govt mandi rates')}</span>
          <span>✓ {t('Open bidding & auctions')}</span>
          <span>✓ {t('Escrow settlement')}</span>
          <span>✓ {t('Farm-to-door logistics')}</span>
        </div>
      </div>
      <div className="st-banner-media">
        <BannerImg />
        {chips.map((c, i) => (
          <div key={c.slug} className={`st-float-chip c${i}`}>
            <span className="e" aria-hidden="true">{c.emoji}</span>
            <span className="t">
              <span className="n">{c.name}</span>
              <span className="v">{formatUnitPrice(c.price, 'INR', currency)}/{UNIT_LABEL[c.unit]}</span>
            </span>
            {c.ref ? <span className="d flat">ref</span> : <Delta pct={c.delta} flatLabel="steady" />}
          </div>
        ))}
      </div>
    </section>
  );
}

// Placeholder cards that occupy exactly the height the real board will, so the
// swap to live rates moves nothing. Real elements carrying real (transparent)
// text rather than fixed-height bars: the line boxes are then identical to the
// live card's by construction, instead of by a magic number that drifts the
// next time a font size changes.
function RateSkeleton() {
  return (
    <div className="st-rate" aria-hidden="true">
      <div className="st-rate-top">
        <span className="st-sk st-sk-emoji">·</span>
        <span className="st-sk">▲ 0.0%</span>
      </div>
      <div className="st-rate-n"><span className="st-sk">Tomato</span></div>
      <div className="st-rate-v"><span className="st-sk">₹00/kg</span></div>
      <div className="cb-mono st-rate-band"><span className="st-sk">₹00–₹00</span></div>
    </div>
  );
}

// Today's rates, front and centre — the shared price anchor every deal on
// CropBid negotiates around. Live from the govt feed, honest about fallback.
// NOTE: no st-reveal here. The section is never hidden-then-revealed: it holds
// its space from first paint and only its contents change, which is what keeps
// the reload smooth. It collapses only if the feed is unreachable entirely.
function LiveRatesBoard({ board, pending, currency }: { board: RatesBoardData | null; pending: boolean; currency: CurrencyCode }) {
  if (!board) {
    if (!pending) return null; // feed unreachable — nothing honest to show
    return (
      <section className="st-rates">
        <div className="st-rates-head">
          <div className="st-rates-title">
            <span className="cb-eyebrow">Today's mandi rates</span>
          </div>
          <span className="cb-mono st-rates-src">GOVT. AGMARKNET · ₹ WHOLESALE · vs USUAL</span>
          <Link to="/rates" className="st-seeall">full board, every mandi <ArrowIcon size={12} /></Link>
        </div>
        <div className="st-rates-track">
          {Array.from({ length: 10 }, (_, i) => <RateSkeleton key={i} />)}
        </div>
      </section>
    );
  }
  return (
    <section className="st-rates">
      <div className="st-rates-head">
        <div className="st-rates-title">
          {board.live && <span className="st-live-dot" />}
          <span className="cb-eyebrow">Today's mandi rates{board.live ? ' · live' : ''} · {board.date}</span>
        </div>
        <span className="cb-mono st-rates-src">GOVT. AGMARKNET · ₹ WHOLESALE · vs USUAL</span>
        <Link to="/rates" className="st-seeall">full board, every mandi <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-rates-track">
        {board.rates.map((r) => (
          <div key={r.commodity} className="st-rate" title={r.market ? `${r.market}${r.state ? ', ' + r.state : ''}` : r.state ?? 'National average'}>
            <div className="st-rate-top">
              <span className="st-rate-emoji" aria-hidden="true">{r.emoji}</span>
              {/* reference cards say "ref", not "steady" — the board never
                  pretends a fallback number is a live one */}
              <Delta pct={r.changePct} flatLabel={r.source === 'reference' ? 'ref' : 'steady'} />
            </div>
            <div className="st-rate-n">{r.label}</div>
            <div className="st-rate-v">
              {formatUnitPrice(r.modal, 'INR', currency)}
              <span className="u">/{UNIT_LABEL[r.unit]}</span>
            </div>
            <div className="cb-mono st-rate-band">
              {formatUnitPrice(r.min, 'INR', currency)}–{formatUnitPrice(r.max, 'INR', currency)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Forecast strip — the prediction engine's storefront teaser.
// /api/rates/predictions returns crops sorted by expected 7-day move; the strip
// shows the biggest movers as pills and sends people to /forecast for the why.
// Mounts empty and renders only once predictions arrive (same rule as the
// rates board — no reveal animation on a section that starts as null).
// -----------------------------------------------------------------------------

interface StripPrediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: UnitCode;
  outlook: { direction: 'rise' | 'hold' | 'ease'; pct7d: number; low: number; high: number };
}

function useForecast(): { rows: StripPrediction[]; pending: boolean } {
  const [rows, setRows] = useState<StripPrediction[]>([]);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let on = true;
    api.get('/rates/predictions')
      .then(({ data }) => { if (on && data?.predictions?.length) setRows(data.predictions); })
      .catch(() => { /* strip simply doesn't render if the engine is unreachable */ })
      .finally(() => { if (on) setPending(false); });
    return () => { on = false; };
  }, []);
  return { rows, pending };
}

function ForecastStrip() {
  const { rows, pending } = useForecast();
  // Same rule as the rates board above: hold the height while the engine
  // answers so the pills fill a box that is already there, rather than
  // appearing under the reader and pushing the rails down mid-scroll.
  if (rows.length === 0) {
    if (!pending) return null;
    return (
      <section className="st-fc">
        <div className="st-rates-head">
          <div className="st-rates-title">
            <span className="cb-eyebrow">CropBid forecast · where prices go next</span>
          </div>
          <span className="cb-mono st-rates-src">DEMAND &amp; SUPPLY MODEL · NEXT 7 DAYS</span>
          <Link to="/forecast" className="st-seeall">full forecast, with the why <ArrowIcon size={12} /></Link>
        </div>
        <div className="st-fc-track" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="st-fc-pill">
              <span className="st-sk">🌾 Tomato ▲ 0.0% / 7d</span>
            </span>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="st-fc">
      <div className="st-rates-head">
        <div className="st-rates-title">
          <span className="cb-eyebrow">CropBid forecast · where prices go next</span>
        </div>
        <span className="cb-mono st-rates-src">DEMAND &amp; SUPPLY MODEL · NEXT 7 DAYS</span>
        <Link to="/forecast" className="st-seeall">full forecast, with the why <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-fc-track">
        {rows.slice(0, 10).map((p) => {
          const dir = p.outlook.direction;
          const arrow = dir === 'rise' ? '▲' : dir === 'ease' ? '▼' : '▬';
          const move = dir === 'hold' ? 'steady' : `${p.outlook.pct7d > 0 ? '+' : ''}${p.outlook.pct7d.toFixed(1)}% / 7d`;
          return (
            <Link key={p.commodity} to="/forecast" className="st-fc-pill">
              <span aria-hidden="true">{p.emoji}</span>
              <span className="n">{p.label}</span>
              <span className={`d ${dir === 'rise' ? 'pos' : dir === 'ease' ? 'neg' : 'flat'}`}>
                {arrow} {move}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const PROMOS: Array<{ tone: 'sage' | 'paper' | 'ember'; emoji: string; title: string; desc: string; ctaLabel: string; to: string }> = [
  { tone: 'sage',  emoji: '🔨', title: 'Live auctions',        desc: 'Verified buyers bid in open rounds — watch prices climb in real time.', ctaLabel: 'Start bidding',  to: '/signup' },
  { tone: 'paper', emoji: '🧺', title: 'Buy direct, no bidding', desc: 'Household packs at the farmer’s own price — a kilo of tomatoes, a litre of milk, no lot to take on.', ctaLabel: 'Shop direct', to: '/signup' },
  { tone: 'ember', emoji: '🛡️', title: 'Escrow protected',  desc: 'Money stays held on-platform and releases only when you confirm delivery.', ctaLabel: 'How it works', to: '/how-it-works' },
];

function PromoTrio({ shopHref }: { shopHref: string }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>();
  return (
    <div className="st-promos st-reveal" ref={ref}>
      {PROMOS.map((p) => (
        <Link key={p.title} to={p.to === '/signup' ? shopHref : p.to} className={`st-promo ${p.tone}`}>
          <span className="st-promo-emoji" aria-hidden="true">{p.emoji}</span>
          <span className="st-promo-t">{t(p.title)}</span>
          <span className="st-promo-d">{t(p.desc)}</span>
          <span className="st-promo-link">{t(p.ctaLabel)} <ArrowIcon size={12} /></span>
        </Link>
      ))}
    </div>
  );
}

function CategoryGrid({ onJump }: { onJump: (target: RailId) => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  return (
    <section className="st-cats st-reveal" ref={ref}>
      <h2 className="st-rail-title">{t('Shop by category')}</h2>
      <div className="st-cats-grid">
        {CATEGORY_TILES.map((c) => (
          <button key={c.label} type="button" className="st-cat" onClick={() => onJump(c.target)}>
            <span className="st-cat-img">
              <ProduceImg slug={c.img} emoji={c.emoji} alt={c.label} />
            </span>
            <span className="st-cat-l">{t(c.label)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// Two prices on one card: the household pack up top (what a consumer actually
// buys), the wholesale lot on the line below it (what a bulk buyer bids for).
// Bulk-only crops skip the pack and keep the wholesale number as the headline.
function ProduceCard({ p, currency, shopHref }: { p: Produce; currency: CurrencyCode; shopHref: string }) {
  const off = pctOff(p);
  const pack = retailPack(p);
  return (
    <div className="st-card">
      <Link to={shopHref} className="st-card-img" aria-label={`${p.name} — ${p.variety}`}>
        <ProduceImg slug={p.slug} emoji={p.emoji} alt={`${p.name} (${p.variety})`} />
        {off >= 5 && <span className="st-off">{off}% OFF</span>}
        <span className="st-grade">{p.organic ? 'Organic' : `Grade ${p.grade}`}</span>
      </Link>
      <div className="st-card-body">
        <div className="st-bids"><span className="st-live-dot" />{p.bids} {p.bids === 1 ? 'bid' : 'bids'} · live</div>
        <div className="st-name">{p.name}</div>
        <div className="st-meta">{p.variety} · {p.location}, {p.state}</div>
        {pack ? (
          <div className="st-pack">
            {pack.label} pack · {formatUnitPrice(pack.perKg, 'INR', currency)}/{pack.perKgLabel}
          </div>
        ) : (
          <div className="st-qty">{formatQty(p)} available</div>
        )}
        <div className="st-price-row">
          <div>
            <div className="st-price">
              {formatUnitPrice(pack ? pack.price : p.priceMin, 'INR', currency)}
              <span className="st-unit">{pack ? `/${pack.suffix}` : `/${UNIT_LABEL[p.unit]}`}</span>
            </div>
            {off >= 5 && (
              <div className="st-mrp">{formatUnitPrice(pack ? pack.anchor : p.priceMax, 'INR', currency)}</div>
            )}
          </div>
          {/* packs go in the basket outright; a whole lot is bid for */}
          <Link to={shopHref} className="st-add">{pack ? 'ADD' : 'BID'}</Link>
        </div>
        <Link to={shopHref} className="st-bulk">
          {pack ? (
            <>
              <span className="st-bulk-l">Bulk</span>
              {formatUnitPrice(p.priceMin, 'INR', currency)}/{UNIT_LABEL[p.unit]} · {formatQty(p)}
            </>
          ) : (
            // quantity is already on the line above — this one only has to say
            // why there is no pack to add
            <>
              <span className="st-bulk-l">Bulk</span>
              not sold in packs
            </>
          )}
        </Link>
      </div>
    </div>
  );
}

function Rail({ rail, currency, shopHref }: { rail: (typeof RAILS)[number]; currency: CurrencyCode; shopHref: string }) {
  const { t } = useTranslation();
  const revealRef = useReveal<HTMLElement>();
  const track = useRef<HTMLDivElement | null>(null);
  const items = PRODUCTS.filter((p) => p.cat === rail.id);

  const nudge = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section id={rail.id} className="st-rail st-reveal" ref={revealRef}>
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{t(rail.eyebrow)}</span>
          <h2 className="st-rail-title">{t(rail.title)}</h2>
        </div>
        <div className="st-rail-nav">
          <Link to={shopHref} className="st-seeall">{t('see all')} <ArrowIcon size={12} /></Link>
          <button type="button" className="st-rail-btn prev" aria-label={`Scroll ${rail.title} back`} onClick={() => nudge(-1)}>
            <ChevronIcon />
          </button>
          <button type="button" className="st-rail-btn next" aria-label={`Scroll ${rail.title} forward`} onClick={() => nudge(1)}>
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div className="st-rail-track" ref={track}>
        {items.map((p) => <ProduceCard key={p.slug} p={p} currency={currency} shopHref={shopHref} />)}
      </div>
    </section>
  );
}

function SearchResults({ query, currency, shopHref }: { query: string; currency: CurrencyCode; shopHref: string }) {
  const q = query.trim().toLowerCase();
  const matches = PRODUCTS.filter((p) =>
    [p.name, p.variety, p.location, p.state, CAT_KEYWORDS[p.cat]].join(' ').toLowerCase().includes(q),
  );

  return (
    <section className="st-results">
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{matches.length} {matches.length === 1 ? 'item' : 'items'} found</span>
          <h2 className="st-rail-title">Results for “{query.trim()}”</h2>
        </div>
      </div>
      {matches.length > 0 ? (
        <div className="st-results-grid">
          {matches.map((p) => <ProduceCard key={p.slug} p={p} currency={currency} shopHref={shopHref} />)}
        </div>
      ) : (
        <div className="st-empty">
          <span className="st-empty-emoji" aria-hidden="true">🌾</span>
          <p className="cb-body">No crops match “{query.trim()}” yet.</p>
          <p className="cb-small">Try “tomato”, “wheat”, “mango”, “dal” — or list it yourself and let buyers come to you.</p>
        </div>
      )}
    </section>
  );
}

const HOW_STEPS: Array<[n: string, title: string, desc: string]> = [
  ['01', 'Farmers list from the field', 'Crop, grade, quantity, floor price — in any language, without leaving the farm.'],
  ['02', 'You buy or bid', 'Households add a pack at the listed price. Bulk buyers bid on the whole lot.'],
  ['03', 'Escrow keeps it safe', 'Money held on-platform, tracked paid → shipped → delivered, released when you confirm.'],
];

function HowStrip() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  return (
    <section className="st-how st-reveal" ref={ref}>
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{t('Simple by design')}</span>
          <h2 className="st-rail-title">{t('How CropBid works')}</h2>
        </div>
        <Link to="/how-it-works" className="st-seeall">{t('the full story')} <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-how-grid">
        {HOW_STEPS.map(([n, title, desc]) => (
          <div key={n} className="st-how-step">
            <span className="cb-mono st-how-n">{n}</span>
            <span className="st-how-t">{t(title)}</span>
            <span className="st-how-d">{t(desc)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SellCTA({ user }: { user: User | null }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  // Marketing noise for a signed-in buyer — the block is farmer-targeted.
  if (user?.role === 'BUYER') return null;
  const sellHref = user?.role === 'FARMER' ? '/farmer/listings/new' : '/signup';
  const sellLabel = user?.role === 'FARMER' ? 'List your harvest' : 'Start selling free';
  return (
    <section className="cta st-reveal" ref={ref}>
      <div className="cta-card">
        <div className="cta-grid-bg" />
        <div className="cta-inner">
          <div>
            <h2 className="cb-h1">{t('Grow it?')} <span className="italic">{t('Sell it here.')}</span></h2>
            <p className="cb-body cta-lede">
              {t('List your harvest in two minutes and let verified buyers bid it up. No mandi trips, no guesswork — you keep the margin.')}
            </p>
          </div>
          <div className="cta-actions">
            <Link to={sellHref} className="cb-btn cta-primary">
              {t(sellLabel)}
              <ArrowIcon />
            </Link>
            <Link to="/how-it-works" className="cb-btn cta-ghost">
              {t('See how it works')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Incubation credit — last thing on the page before the footer. Two backers
// share the row: India 2047 Ventures tries the real logo at
// /india-2047-ventures.png (drop it in client/public) and falls back to the SVG
// recreation until that file exists; Founder Startup House ships as a real
// wordmark PNG, so it is a plain <img> with the name as alt text.
// -----------------------------------------------------------------------------

function India2047Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <India2047Mark size={46} />;
  return (
    <img
      src="/india-2047-ventures.png"
      alt=""
      width={46}
      height={46}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function IncubatedBy() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  return (
    <section
      className="st-incub st-reveal"
      ref={ref}
      aria-label="Incubated by India 2047 Ventures and Founder Startup House"
    >
      <span className="cb-eyebrow">{t('Incubated by')}</span>
      <div className="st-incub-row">
        <div className="st-incub-brand">
          <India2047Logo />
          <span className="st-incub-name">India 2047 <span>Ventures</span></span>
        </div>
        <span className="st-incub-sep" aria-hidden="true" />
        <img
          className="st-incub-wordmark"
          src="/founder-startup-house.png"
          alt="Founder Startup House"
          width={150}
          height={42}
          loading="lazy"
        />
      </div>
      <p className="cb-small st-incub-line">
        {t('CropBid is built with the backing of India 2047 Ventures and Founder Startup House.')}
      </p>
    </section>
  );
}

// =============================================================================
// Page
// =============================================================================

export function LandingPage() {
  const { user } = useAuth();
  const [country, setCountry] = useState<Country>(loadCountry);
  const [query, setQuery] = useState('');
  const currency = country.currency;
  const { board, pending: ratesPending } = useLiveRates();

  // Where every buy/bid CTA lands. The storefront catalogue is demo data, so
  // signed-in users go to the real market (buyers browse live lots, farmers
  // watch auctions); guests are asked to join first. Consumers never see these
  // CTAs — LiveShelf replaces the demo rails for them and its cards link to the
  // actual product — so '/' is just a harmless self-link.
  const shopHref = user?.role === 'BUYER' ? '/buyer/browse'
    : user?.role === 'FARMER' ? '/auctions'
    : user?.role === 'CONSUMER' ? '/'
    : '/signup';

  // A signed-in shopper gets the real shop in place of the marketing rails.
  // Everything else on the page (ticker, rates, forecast) is live data and
  // stays useful to them.
  const isShopper = user?.role === 'CONSUMER';

  const handleChangeCountry = (next: Country) => {
    setCountry(next);
    saveCountry(next);
  };

  // Chips & category tiles jump to a rail; clear any active search first so
  // the rails are actually on screen to scroll to. 'shelf' is the shopper's
  // real product grid, which stands in for the rails on a consumer account.
  const jumpTo = (target: RailId | 'top' | 'shelf') => {
    setQuery('');
    requestAnimationFrame(() => {
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const searching = query.trim() !== '';

  return (
    <div className="cb-landing st-store">
      <Ticker currency={currency} board={board} />
      <StoreHeader
        country={country}
        onChangeCountry={handleChangeCountry}
        query={query}
        onQuery={setQuery}
        onJump={jumpTo}
        user={user}
      />
      <main className="st-main">
        {/* A shopper searches the real shelf, not the demo catalogue — the
            catalogue would return results they cannot buy. */}
        {isShopper ? (
          <>
            {!searching && <HeroBanner onShop={() => jumpTo('shelf')} board={board} currency={currency} user={user} />}
            <LiveShelf query={query} />
            {!searching && <LiveRatesBoard board={board} pending={ratesPending} currency={currency} />}
          </>
        ) : searching ? (
          <SearchResults query={query} currency={currency} shopHref={shopHref} />
        ) : (
          <>
            <HeroBanner onShop={() => jumpTo('veg')} board={board} currency={currency} user={user} />
            <LiveRatesBoard board={board} pending={ratesPending} currency={currency} />
            <ForecastStrip />
            <PromoTrio shopHref={shopHref} />
            <CategoryGrid onJump={jumpTo} />
            {RAILS.map((rail) => <Rail key={rail.id} rail={rail} currency={currency} shopHref={shopHref} />)}
            <HowStrip />
            <SellCTA user={user} />
            <IncubatedBy />
          </>
        )}
      </main>
      <CBFooter />
    </div>
  );
}
