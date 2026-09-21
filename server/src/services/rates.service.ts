// =============================================================================
// Live Mandi Rates Service — today's real fruit/vegetable/crop prices
// =============================================================================
// WHY THIS EXISTS
// CropBid is a NEGOTIATION marketplace, so both sides need a shared, trusted
// anchor for what a crop is worth *today* — otherwise every deal is a cold
// start and nobody knows if a price is fair. This service supplies that anchor
// from the Government of India's daily mandi feed (Agmarknet, via data.gov.in),
// the same 4,600+ regulated markets that set physical wholesale prices.
//
// DESIGN:
//   - The whole day's feed is downloaded and held by mandiFeed.ts; nothing
//     here talks to data.gov.in. Every answer below is computed from that one
//     copy, so upstream requests no longer scale with visitors.
//   - Names are matched exactly, through mandiCommodities.ts, which also says
//     which group a commodity belongs to and which spellings are one product.
//   - Graceful fallback: with no usable copy we return static reference
//     prices, so the board is NEVER empty.
//   - "Local" via a fallback chain: nearest market → state modal → national
//     modal → static reference, each result labelled with its source so the UI
//     can be honest about how local the number is.
//   - A mandi reporting a price under a tenth or over ten times the crop's
//     median is left out of every figure (Patti in Punjab once reported onion
//     at ₹0.07 a quintal). The band shown is where most mandis sat, not the
//     single lowest and highest report, which with hundreds of reports is
//     always somebody's typo.
//
// Agmarknet prices are always ₹ per QUINTAL (100 kg). We normalise to the
// display unit the storefront uses (₹/kg for veg & fruit, ₹/quintal for
// grains/spices/oilseeds).
// =============================================================================

import { getMandiSnapshot, normaliseState, type MandiRow, type MandiSnapshot } from './mandiFeed';
import { GROUPS, commodityFor, type Commodity, type Group } from './mandiCommodities';


// -----------------------------------------------------------------------------
// The board: the 30 crops the storefront strip, the dashboards and the forecast
// carry, each with a "usual" reference price. `commodity` is the crop's id in
// mandiCommodities.ts, which also lists every other spelling the feed files it
// under (paddy is "Paddy(Common)" in most states today). /rates shows every
// commodity the feed reported, of which these are 30. `unit` is how the
// storefront shows it; grains/spices trade in quintals, fresh produce in kg.
// -----------------------------------------------------------------------------
// LITRE is display-only for dairy liquids (1 L ≈ 1 kg for milk/curd) — feed
// prices stay ₹/quintal internally, exactly like KG.
type Unit = 'KG' | 'QUINTAL' | 'LITRE';
type Cat = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

interface BoardItem {
  commodity: string;   // id in mandiCommodities.ts
  label: string;       // display name
  emoji: string;
  cat: Cat;
  unit: Unit;
  fallbackPerQuintal: number; // static reference modal (₹/quintal) used if feed is down
}

const BOARD: BoardItem[] = [
  // Fresh vegetables
  { commodity: 'Tomato', label: 'Tomato', emoji: '🍅', cat: 'veg', unit: 'KG', fallbackPerQuintal: 2600 },
  { commodity: 'Onion', label: 'Onion', emoji: '🧅', cat: 'veg', unit: 'KG', fallbackPerQuintal: 1800 },
  { commodity: 'Potato', label: 'Potato', emoji: '🥔', cat: 'veg', unit: 'KG', fallbackPerQuintal: 1400 },
  { commodity: 'Green Chilli', label: 'Green Chilli', emoji: '🌶️', cat: 'veg', unit: 'KG', fallbackPerQuintal: 4500 },
  { commodity: 'Cauliflower', label: 'Cauliflower', emoji: '🥦', cat: 'veg', unit: 'KG', fallbackPerQuintal: 2200 },
  { commodity: 'Brinjal', label: 'Brinjal', emoji: '🍆', cat: 'veg', unit: 'KG', fallbackPerQuintal: 1800 },
  // More daily-use vegetables.
  { commodity: 'Cabbage', label: 'Cabbage', emoji: '🥬', cat: 'veg', unit: 'KG', fallbackPerQuintal: 1600 },
  { commodity: 'Carrot', label: 'Carrot', emoji: '🥕', cat: 'veg', unit: 'KG', fallbackPerQuintal: 2800 },
  { commodity: 'Bhindi(Ladies Finger)', label: 'Lady Finger', emoji: '🫛', cat: 'veg', unit: 'KG', fallbackPerQuintal: 3500 },
  { commodity: 'Cucumbar(Kheera)', label: 'Cucumber', emoji: '🥒', cat: 'veg', unit: 'KG', fallbackPerQuintal: 2000 },
  { commodity: 'Garlic', label: 'Garlic', emoji: '🧄', cat: 'veg', unit: 'KG', fallbackPerQuintal: 9000 },
  { commodity: 'Ginger(Green)', label: 'Ginger', emoji: '🫚', cat: 'veg', unit: 'KG', fallbackPerQuintal: 8000 },
  // Milk & dairy — dairy trades through cooperatives, not APMC mandis, so the
  // feed rarely (if ever) reports it and these rows usually resolve to the
  // reference price, labelled honestly by the source chain. References track
  // the Dept. of Consumer Affairs retail price monitor (Delhi, Jul 2026:
  // milk ₹60/L, curd ₹61/L, paneer ₹348–400/kg, ghee ₹524–572/kg) — the only
  // government-published daily price series that covers dairy.
  { commodity: 'Milk', label: 'Milk', emoji: '🥛', cat: 'dairy', unit: 'LITRE', fallbackPerQuintal: 6000 },
  { commodity: 'Ghee', label: 'Ghee', emoji: '🧈', cat: 'dairy', unit: 'KG', fallbackPerQuintal: 55000 },
  { commodity: 'Curd', label: 'Curd (Dahi)', emoji: '🥣', cat: 'dairy', unit: 'LITRE', fallbackPerQuintal: 6100 },
  { commodity: 'Paneer', label: 'Paneer', emoji: '🧀', cat: 'dairy', unit: 'KG', fallbackPerQuintal: 37000 },
  // Seasonal fruits
  { commodity: 'Banana', label: 'Banana', emoji: '🍌', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 2800 },
  { commodity: 'Mango', label: 'Mango', emoji: '🥭', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 9000 },
  { commodity: 'Pomegranate', label: 'Pomegranate', emoji: '🍒', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 11000 },
  { commodity: 'Grapes', label: 'Grapes', emoji: '🍇', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 7000 },
  { commodity: 'Apple', label: 'Apple', emoji: '🍎', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 12000 },
  // More everyday fruits. The feed reports lemon and lime separately and a
  // lemon costs about three times as much, so this row says which it is.
  { commodity: 'Pineapple', label: 'Pineapple', emoji: '🍍', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 4000 },
  { commodity: 'Water Melon', label: 'Watermelon', emoji: '🍉', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 1400 },
  { commodity: 'Lime', label: 'Lime (Nimbu)', emoji: '🍋', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 6000 },
  // Grains & pulses
  { commodity: 'Wheat', label: 'Wheat', emoji: '🌾', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2480 },
  { commodity: 'Paddy(Dhan)(Common)', label: 'Paddy (Rice)', emoji: '🍚', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2400 },
  { commodity: 'Maize', label: 'Maize', emoji: '🌽', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2100 },
  // Spices & oilseeds
  { commodity: 'Soyabean', label: 'Soybean', emoji: '🫘', cat: 'spices', unit: 'QUINTAL', fallbackPerQuintal: 5420 },
  { commodity: 'Turmeric', label: 'Turmeric', emoji: '🫚', cat: 'spices', unit: 'QUINTAL', fallbackPerQuintal: 13800 },
  // Cocoa reports from very few mandis (Kerala/Karnataka plantation belt), so
  // outside those states it resolves to a 'national' modal drawn from a handful
  // of markets — honest via `source`, but thinner than the crops above.
  { commodity: 'Cocoa', label: 'Cocoa', emoji: '🍫', cat: 'spices', unit: 'QUINTAL', fallbackPerQuintal: 14800 },
];
const BOARD_BY_ID = new Map(BOARD.map((b) => [b.commodity.toLowerCase(), b]));

/** The board crop a name belongs to, under any of the feed's spellings. */
function boardItemFor(name: string): BoardItem | undefined {
  const c = commodityFor(name);
  return c ? BOARD_BY_ID.get(c.id.toLowerCase()) : undefined;
}

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------
export type RateSource = 'market' | 'state' | 'national' | 'reference';

export interface CropRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: Unit;          // unit the prices below are expressed in
  cat: Cat;
  modal: number;       // ₹ per `unit`
  min: number;         // low end of where most mandis sat, ₹ per `unit`
  max: number;
  usual: number;       // static reference modal (₹ per `unit`) — the crop's "usual" price
  changePct: number;   // today's modal vs usual, % (0 when source is 'reference')
  market: string | null;
  state: string | null;
  source: RateSource;  // how local this number is
  date: string;        // arrival_date reported by the mandi (DD/MM/YYYY) or today
}

// -----------------------------------------------------------------------------
// The day's rows, indexed by commodity
// -----------------------------------------------------------------------------
const PLAUSIBLE_FACTOR = 10;

interface Entry {
  commodity: Commodity;
  rows: MandiRow[];      // plausible reports only
  excluded: MandiRow[];  // reports outside PLAUSIBLE_FACTOR of the median
}

interface Indexed {
  byId: Map<string, Entry>;
  states: string[];
  date: string | null;   // the latest arrival_date in the copy
}

const indexCache = new WeakMap<MandiSnapshot, Indexed>();
const EMPTY_INDEX: Indexed = { byId: new Map(), states: [], date: null };

// DD/MM/YYYY → a number that sorts by date.
const dateKey = (d: string) => {
  const [dd, mm, yyyy] = d.split('/');
  return Number(`${yyyy}${mm?.padStart(2, '0')}${dd?.padStart(2, '0')}`) || 0;
};

function indexOf(snap: MandiSnapshot | null): Indexed {
  if (!snap) return EMPTY_INDEX;
  const cached = indexCache.get(snap);
  if (cached) return cached;

  const grouped = new Map<string, { commodity: Commodity; rows: MandiRow[] }>();
  const states = new Set<string>();
  let date: string | null = null;
  for (const row of snap.rows) {
    const c = commodityFor(row.commodity);
    if (!c) continue;
    const g = grouped.get(c.id) ?? { commodity: c, rows: [] };
    g.rows.push(row);
    grouped.set(c.id, g);
    if (row.state) states.add(row.state);
    if (row.date && (!date || dateKey(row.date) > dateKey(date))) date = row.date;
  }

  const byId = new Map<string, Entry>();
  for (const [id, g] of grouped) {
    const mid = quantile(g.rows.map((r) => r.modal), 0.5);
    const plausible = (r: MandiRow) => r.modal >= mid / PLAUSIBLE_FACTOR && r.modal <= mid * PLAUSIBLE_FACTOR;
    byId.set(id, {
      commodity: g.commodity,
      rows: g.rows.filter(plausible),
      excluded: g.rows.filter((r) => !plausible(r)),
    });
  }

  const indexed = { byId, states: [...states].sort((a, b) => a.localeCompare(b)), date };
  indexCache.set(snap, indexed);
  return indexed;
}

// Linear-interpolated quantile; q = 0.5 is the median.
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ₹/quintal. With five or more mandis the band is where the middle 80% of
// them sat. With fewer there is no "most", so it is their own reported low
// and high, ignoring a low under a tenth or a high over ten times that same
// mandi's modal.
function band(rows: MandiRow[]): { modal: number; min: number; max: number } {
  const modals = rows.map((r) => r.modal);
  const modal = quantile(modals, 0.5);
  if (rows.length >= 5) return { modal, min: quantile(modals, 0.1), max: quantile(modals, 0.9) };
  const mins = rows.map((r) => (r.min > 0 && r.min >= r.modal / PLAUSIBLE_FACTOR ? r.min : r.modal));
  const maxs = rows.map((r) => (r.max > 0 && r.max <= r.modal * PLAUSIBLE_FACTOR ? r.max : r.modal));
  return { modal, min: Math.min(modal, ...mins), max: Math.max(modal, ...maxs) };
}

const latestDate = (rows: MandiRow[]) =>
  rows.reduce<string | null>((d, r) => (r.date && (!d || dateKey(r.date) > dateKey(d)) ? r.date : d), null);

const today = () => new Date().toLocaleDateString('en-GB');

// Convert ₹/quintal (as the feed reports) into the board item's display unit.
// LITRE behaves like KG: 1 quintal ≈ 100 kg ≈ 100 L for dairy liquids.
function toUnit(perQuintal: number, unit: Unit): number {
  const v = unit === 'QUINTAL' ? perQuintal : perQuintal / 100;
  // ₹/kg and ₹/L to 1 decimal, ₹/quintal to nearest rupee
  return unit === 'QUINTAL' ? Math.round(v) : Math.round(v * 10) / 10;
}

// Fresh produce is bought by the kilo; everything else trades by the quintal.
const GROUP_UNIT: Record<Group, Unit> = {
  vegetables: 'KG', greens: 'KG', fruits: 'KG', dairy: 'KG',
  cereals: 'QUINTAL', pulses: 'QUINTAL', oilseeds: 'QUINTAL', spices: 'QUINTAL',
  dryfruits: 'QUINTAL', other: 'QUINTAL',
};

const GROUP_EMOJI: Record<Group, string> = {
  vegetables: '🥬', greens: '🌿', fruits: '🍎', cereals: '🌾', pulses: '🫘',
  oilseeds: '🌻', spices: '🌶️', dryfruits: '🥜', dairy: '🥛', other: '🧺',
};

// -----------------------------------------------------------------------------
// getRateForCrop — the negotiation/listing anchor, with local fallback chain
// -----------------------------------------------------------------------------
function rateFor(
  item: BoardItem, idx: Indexed, opts: { state?: string; market?: string }
): { rate: CropRate; mandis: number } {
  const meta = item;
  const all = idx.byId.get(commodityFor(item.commodity)?.id ?? item.commodity)?.rows ?? [];
  const state = opts.state ? normaliseState(opts.state) : undefined;
  const inState = state ? all.filter((r) => r.state === state) : [];

  const build = (rows: MandiRow[], source: RateSource, market: string | null, st: string | null) => {
    const b = band(rows);
    // Signal: how today's modal sits vs the crop's usual (static reference)
    // price. Honest and simple — not a forecast, a "strong/weak day" flag.
    const changePct = meta.fallbackPerQuintal > 0
      ? Math.round(((b.modal - meta.fallbackPerQuintal) / meta.fallbackPerQuintal) * 1000) / 10
      : 0;
    const rate: CropRate = {
      commodity: meta.commodity, label: meta.label, emoji: meta.emoji, unit: meta.unit, cat: meta.cat,
      modal: toUnit(b.modal, meta.unit),
      min: toUnit(b.min, meta.unit),
      max: toUnit(b.max, meta.unit),
      usual: toUnit(meta.fallbackPerQuintal, meta.unit),
      changePct,
      market, state: st, source,
      date: latestDate(rows) ?? today(),
    };
    return { rate, mandis: rows.length };
  };

  // 1. exact market match, within the state when one was given and reported
  if (opts.market) {
    const pool = inState.length ? inState : all;
    const hit = pool.filter((r) => r.market.toLowerCase().includes(opts.market!.toLowerCase()));
    if (hit.length) return build(hit, 'market', hit[0].market, hit[0].state);
  }
  // 2. state modal
  if (inState.length) return build(inState, 'state', null, state!);
  // 3. national modal
  if (all.length) return build(all, 'national', null, null);

  // 4. static reference (feed down / no data for this crop)
  return {
    rate: {
      commodity: meta.commodity, label: meta.label, emoji: meta.emoji, unit: meta.unit, cat: meta.cat,
      modal: toUnit(meta.fallbackPerQuintal, meta.unit),
      min: toUnit(Math.round(meta.fallbackPerQuintal * 0.85), meta.unit),
      max: toUnit(Math.round(meta.fallbackPerQuintal * 1.15), meta.unit),
      usual: toUnit(meta.fallbackPerQuintal, meta.unit),
      changePct: 0,
      market: null, state: null, source: 'reference',
      date: today(),
    },
    mandis: 0,
  };
}

export async function getRateForCrop(
  commodity: string,
  opts: { state?: string; market?: string } = {}
): Promise<CropRate | null> {
  const item = boardItemFor(commodity);
  if (!item) return null;
  return rateFor(item, indexOf(await getMandiSnapshot()), opts).rate;
}

// -----------------------------------------------------------------------------
// getMarketBreakdown — every reporting mandi for one crop (the full-detail
// view behind the rates page: market, district, state, variety, grade, band)
// -----------------------------------------------------------------------------
export interface MarketRate {
  market: string;
  district: string;
  state: string;
  variety: string;
  grade: string;
  date: string;   // arrival_date as reported (DD/MM/YYYY)
  modal: number;  // ₹ per display unit
  min: number;
  max: number;
}

export interface MarketBreakdown {
  commodity: string;
  label: string;
  emoji: string;
  unit: Unit;
  count: number;
  records: MarketRate[];
  // Reports left out as implausible (see PLAUSIBLE_FACTOR), so the page can
  // say rows are missing rather than silently show fewer.
  excluded: number;
}

// Works for any commodity the feed reports, not only the 30 on the board.
export async function getMarketBreakdown(commodity: string, state?: string): Promise<MarketBreakdown | null> {
  const c = commodityFor(commodity);
  if (!c) return null;
  const item = BOARD_BY_ID.get(c.id.toLowerCase());
  const entry = indexOf(await getMandiSnapshot()).byId.get(c.id);
  if (!entry && !item) return null;

  const st = state ? normaliseState(state) : undefined;
  const inScope = (r: MandiRow) => !st || r.state === st;
  const unit = item?.unit ?? GROUP_UNIT[c.group];

  const rows: MarketRate[] = (entry?.rows ?? [])
    .filter(inScope)
    .map((r) => ({
      market: r.market || '—',
      district: r.district || '—',
      state: r.state || '—',
      variety: r.variety || '—',
      grade: r.grade || '—',
      date: r.date,
      modal: toUnit(r.modal, unit),
      min: toUnit(r.min, unit),
      max: toUnit(r.max, unit),
    }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.market.localeCompare(b.market));

  return {
    commodity: c.id,
    label: item?.label ?? c.label,
    emoji: item?.emoji ?? GROUP_EMOJI[c.group],
    unit,
    count: rows.length,
    records: rows,
    excluded: (entry?.excluded ?? []).filter(inScope).length,
  };
}

// -----------------------------------------------------------------------------
// getBoard — today's rates for the whole curated set (for the storefront board)
// -----------------------------------------------------------------------------
export async function getBoard(state?: string): Promise<{ date: string; live: boolean; rates: CropRate[] }> {
  const idx = indexOf(await getMandiSnapshot());
  const rates = BOARD.map((b) => rateFor(b, idx, { state }).rate);
  return {
    date: idx.date ?? today(),
    live: rates.some((r) => r.source !== 'reference'),
    rates,
  };
}

// -----------------------------------------------------------------------------
// getAllRates: every commodity the feed reported (the /rates page)
// -----------------------------------------------------------------------------
export interface CommodityRate {
  commodity: string;          // pass back as /rates/markets?crop=
  label: string;
  emoji: string;
  group: Group;
  unit: Unit;
  modal: number;
  min: number;
  max: number;
  usual: number | null;       // board crops only: nothing else has a reference price
  changePct: number | null;
  mandis: number;             // reports behind the number
  source: RateSource;
  state: string | null;
  date: string;
}

export interface AllRates {
  date: string;
  live: boolean;
  states: string[];           // every state that reported, for the picker
  groups: typeof GROUPS;
  rates: CommodityRate[];
}

// A state picked: every commodity that state's mandis reported, and the 30
// board crops through their usual fallback chain, so the page never loses a
// crop it always showed. All India: every commodity reported anywhere.
export async function getAllRates(state?: string): Promise<AllRates> {
  const idx = indexOf(await getMandiSnapshot());
  const st = state ? normaliseState(state) : undefined;
  const rates: CommodityRate[] = [];

  for (const [id, entry] of idx.byId) {
    if (BOARD_BY_ID.has(id.toLowerCase())) continue;
    const rows = st ? entry.rows.filter((r) => r.state === st) : entry.rows;
    if (rows.length === 0) continue;
    const c = entry.commodity;
    const unit = GROUP_UNIT[c.group];
    const b = band(rows);
    rates.push({
      commodity: c.id, label: c.label, emoji: GROUP_EMOJI[c.group], group: c.group, unit,
      modal: toUnit(b.modal, unit), min: toUnit(b.min, unit), max: toUnit(b.max, unit),
      usual: null, changePct: null, mandis: rows.length,
      source: st ? 'state' : 'national', state: st ?? null,
      date: latestDate(rows) ?? today(),
    });
  }

  for (const item of BOARD) {
    const { rate, mandis } = rateFor(item, idx, { state });
    rates.push({
      commodity: rate.commodity, label: rate.label, emoji: rate.emoji,
      group: commodityFor(item.commodity)?.group ?? 'other', unit: rate.unit,
      modal: rate.modal, min: rate.min, max: rate.max,
      usual: rate.usual, changePct: rate.changePct, mandis,
      source: rate.source, state: rate.state, date: rate.date,
    });
  }

  const order = new Map(GROUPS.map((g, i) => [g.id, i]));
  rates.sort((a, b) =>
    (order.get(a.group)! - order.get(b.group)!) || (b.mandis - a.mandis) || a.label.localeCompare(b.label));

  return {
    date: idx.date ?? today(),
    live: rates.some((r) => r.source !== 'reference'),
    states: idx.states,
    groups: GROUPS,
    rates,
  };
}
