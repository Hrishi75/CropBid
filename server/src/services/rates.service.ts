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
// DESIGN (mirrors the rest of the codebase):
//   - Native fetch, no SDK (same as the Gemini integration).
//   - Daily in-memory cache — mandi rates change once a day, so we fetch once
//     and reuse (same spirit as the in-memory auction state).
//   - Graceful fallback — if the feed/key is unavailable we return static
//     reference prices, so the board is NEVER empty (same as Razorpay/SMTP
//     degrading instead of crashing the app).
//   - "Local" via a fallback chain: nearest market → state modal → national
//     modal → static reference, each result labelled with its source so the UI
//     can be honest about how local the number is.
//
// Agmarknet prices are always ₹ per QUINTAL (100 kg). We normalise to the
// display unit the storefront uses (₹/kg for veg & fruit, ₹/quintal for
// grains/spices/oilseeds).
// =============================================================================

import { config } from '../config';

// -----------------------------------------------------------------------------
// The board — the crops we surface as "today's rates". `commodity` MUST match
// Agmarknet's own spelling or the feed returns nothing. `unit` is how the
// storefront shows it; grains/spices trade in quintals, fresh produce in kg.
// -----------------------------------------------------------------------------
type Unit = 'KG' | 'QUINTAL';
type Cat = 'veg' | 'fruits' | 'grains' | 'spices';

interface BoardItem {
  commodity: string;   // Agmarknet commodity name (exact)
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
  // Seasonal fruits
  { commodity: 'Banana', label: 'Banana', emoji: '🍌', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 2800 },
  { commodity: 'Mango', label: 'Mango', emoji: '🥭', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 9000 },
  { commodity: 'Pomegranate', label: 'Pomegranate', emoji: '🍒', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 11000 },
  { commodity: 'Grapes', label: 'Grapes', emoji: '🍇', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 7000 },
  { commodity: 'Apple', label: 'Apple', emoji: '🍎', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 12000 },
  // Grains & pulses
  { commodity: 'Wheat', label: 'Wheat', emoji: '🌾', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2480 },
  { commodity: 'Paddy(Dhan)(Common)', label: 'Paddy (Rice)', emoji: '🍚', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2400 },
  { commodity: 'Maize', label: 'Maize', emoji: '🌽', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 2100 },
  // Spices & oilseeds
  { commodity: 'Soyabean', label: 'Soybean', emoji: '🫘', cat: 'spices', unit: 'QUINTAL', fallbackPerQuintal: 5420 },
  { commodity: 'Turmeric', label: 'Turmeric', emoji: '🫚', cat: 'spices', unit: 'QUINTAL', fallbackPerQuintal: 13800 },
];

const BOARD_BY_COMMODITY = new Map(BOARD.map((b) => [b.commodity.toLowerCase(), b]));

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
  min: number;
  max: number;
  usual: number;       // static reference modal (₹ per `unit`) — the crop's "usual" price
  changePct: number;   // today's modal vs usual, % (0 when source is 'reference')
  market: string | null;
  state: string | null;
  source: RateSource;  // how local this number is
  date: string;        // arrival_date reported by the mandi (DD/MM/YYYY) or today
}

// -----------------------------------------------------------------------------
// Agmarknet feed
// -----------------------------------------------------------------------------
interface AgmarkRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrival_date: string;
  min_price: string | number;
  max_price: string | number;
  modal_price: string | number;
}

// date-keyed cache so we hit the feed at most once per commodity per day
let cacheDay = '';
const recordCache = new Map<string, AgmarkRecord[]>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetCacheIfStale() {
  const d = today();
  if (d !== cacheDay) {
    cacheDay = d;
    recordCache.clear();
  }
}

// Fetch (and cache for the day) the recent records for one commodity, optionally
// scoped to a state. Returns [] on any failure — callers fall back to reference.
async function fetchRecords(commodity: string, state?: string): Promise<AgmarkRecord[]> {
  resetCacheIfStale();
  const key = `${commodity.toLowerCase()}::${(state || '').toLowerCase()}`;
  const cached = recordCache.get(key);
  if (cached) return cached;

  const url = new URL(`https://api.data.gov.in/resource/${config.dataGov.resourceId}`);
  url.searchParams.set('api-key', config.dataGov.apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '200');
  url.searchParams.set('filters[commodity]', commodity);
  if (state) url.searchParams.set('filters[state]', state);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`data.gov.in ${res.status}`);
    const json = (await res.json()) as { records?: AgmarkRecord[] };
    const records = json.records ?? [];
    recordCache.set(key, records);
    return records;
  } catch (err) {
    // Cache the empty result too, so a dead feed doesn't get hammered all day.
    recordCache.set(key, []);
    return [];
  }
}

const num = (v: string | number): number => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Convert ₹/quintal (as the feed reports) into the board item's display unit.
function toUnit(perQuintal: number, unit: Unit): number {
  const v = unit === 'KG' ? perQuintal / 100 : perQuintal;
  // ₹/kg to 1 decimal, ₹/quintal to nearest rupee
  return unit === 'KG' ? Math.round(v * 10) / 10 : Math.round(v);
}

// -----------------------------------------------------------------------------
// getRateForCrop — the negotiation/listing anchor, with local fallback chain
// -----------------------------------------------------------------------------
export async function getRateForCrop(
  commodity: string,
  opts: { state?: string; market?: string } = {}
): Promise<CropRate | null> {
  const item = BOARD_BY_COMMODITY.get(commodity.toLowerCase());
  const meta: BoardItem = item ?? {
    commodity, label: commodity, emoji: '🌱', cat: 'grains', unit: 'QUINTAL', fallbackPerQuintal: 0,
  };

  // Pull state-scoped records first (fewer, more local), then national.
  const stateRecords = opts.state ? await fetchRecords(commodity, opts.state) : [];
  const nationalRecords = stateRecords.length ? stateRecords : await fetchRecords(commodity);

  const build = (records: AgmarkRecord[], source: RateSource, market: string | null, state: string | null): CropRate => {
    const modalPerQ = median(records.map((r) => num(r.modal_price)));
    const minPerQ = Math.min(...records.map((r) => num(r.min_price)));
    const maxPerQ = Math.max(...records.map((r) => num(r.max_price)));
    // Signal: how today's modal sits vs the crop's usual (static reference)
    // price. Honest and simple — not a forecast, a "strong/weak day" flag.
    const changePct = meta.fallbackPerQuintal > 0
      ? Math.round(((modalPerQ - meta.fallbackPerQuintal) / meta.fallbackPerQuintal) * 1000) / 10
      : 0;
    return {
      commodity: meta.commodity, label: meta.label, emoji: meta.emoji, unit: meta.unit, cat: meta.cat,
      modal: toUnit(modalPerQ, meta.unit),
      min: toUnit(minPerQ, meta.unit),
      max: toUnit(maxPerQ, meta.unit),
      usual: toUnit(meta.fallbackPerQuintal, meta.unit),
      changePct,
      market, state, source,
      date: records[0]?.arrival_date ?? new Date().toLocaleDateString('en-GB'),
    };
  };

  // 1. exact market match
  if (opts.market) {
    const hit = nationalRecords.filter(
      (r) => r.market?.toLowerCase().includes(opts.market!.toLowerCase())
    );
    if (hit.length) return build(hit, 'market', hit[0].market, hit[0].state);
  }
  // 2. state modal
  if (opts.state) {
    const hit = nationalRecords.filter(
      (r) => r.state?.toLowerCase() === opts.state!.toLowerCase()
    );
    if (hit.length) return build(hit, 'state', null, hit[0].state);
  }
  // 3. national modal
  if (nationalRecords.length) return build(nationalRecords, 'national', null, null);

  // 4. static reference (feed down / no data for this crop)
  if (meta.fallbackPerQuintal > 0) {
    return {
      commodity: meta.commodity, label: meta.label, emoji: meta.emoji, unit: meta.unit, cat: meta.cat,
      modal: toUnit(meta.fallbackPerQuintal, meta.unit),
      min: toUnit(Math.round(meta.fallbackPerQuintal * 0.85), meta.unit),
      max: toUnit(Math.round(meta.fallbackPerQuintal * 1.15), meta.unit),
      usual: toUnit(meta.fallbackPerQuintal, meta.unit),
      changePct: 0,
      market: null, state: null, source: 'reference',
      date: new Date().toLocaleDateString('en-GB'),
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// getBoard — today's rates for the whole curated set (for the storefront board)
// -----------------------------------------------------------------------------
export async function getBoard(state?: string): Promise<{ date: string; live: boolean; rates: CropRate[] }> {
  const rates = await Promise.all(
    BOARD.map((b) => getRateForCrop(b.commodity, { state }))
  );
  const clean = rates.filter((r): r is CropRate => r !== null);
  const live = clean.some((r) => r.source !== 'reference');
  return {
    date: new Date().toLocaleDateString('en-GB'),
    live,
    rates: clean,
  };
}
