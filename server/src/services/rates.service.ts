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
// LITRE is display-only for dairy liquids (1 L ≈ 1 kg for milk/curd) — feed
// prices stay ₹/quintal internally, exactly like KG.
type Unit = 'KG' | 'QUINTAL' | 'LITRE';
type Cat = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

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
  // More daily-use vegetables. `commodity` uses Agmarknet's exact spelling
  // (parenthesised names and all) or the feed returns nothing.
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
  // More everyday fruits (Agmarknet exact spellings).
  { commodity: 'Pineapple', label: 'Pineapple', emoji: '🍍', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 4000 },
  { commodity: 'Water Melon', label: 'Watermelon', emoji: '🍉', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 1400 },
  { commodity: 'Lime', label: 'Lemon', emoji: '🍋', cat: 'fruits', unit: 'KG', fallbackPerQuintal: 6000 },
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

// date-keyed cache so we hit the feed at most once per commodity per day.
// Empty results (feed down / no data) are retryable after a short window so a
// transient upstream failure doesn't pin the board to reference prices all day.
const EMPTY_RETRY_MS = 10 * 60 * 1000;
interface CacheEntry { records: AgmarkRecord[]; at: number }
let cacheDay = '';
const recordCache = new Map<string, CacheEntry>();

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

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

// Fetch (and cache for the day) all recent records for one board commodity,
// optionally scoped to a state. Returns [] on any failure — callers fall back
// to reference. The data.gov feed is paginated, so keep walking until the feed
// returns a short page; otherwise high-volume crops look artificially empty or
// capped to the first page.
async function fetchRecords(commodity: string, state?: string): Promise<AgmarkRecord[]> {
  resetCacheIfStale();
  const key = `${commodity.toLowerCase()}::${(state || '').toLowerCase()}`;
  const cached = recordCache.get(key);
  if (cached && (cached.records.length > 0 || Date.now() - cached.at < EMPTY_RETRY_MS)) {
    return cached.records;
  }

  try {
    const records: AgmarkRecord[] = [];
    let complete = true;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`https://api.data.gov.in/resource/${config.dataGov.resourceId}`);
      url.searchParams.set('api-key', config.dataGov.apiKey);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(page * PAGE_SIZE));
      url.searchParams.set('filters[commodity]', commodity);
      if (state) url.searchParams.set('filters[state]', state);

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error(`data.gov.in ${res.status}`);
        const json = (await res.json()) as { records?: AgmarkRecord[] };
        const pageRecords = (json.records ?? []).filter((r) => num(r.modal_price) > 0);
        records.push(...pageRecords);
        if ((json.records ?? []).length < PAGE_SIZE) break;
      } catch (err) {
        if (records.length === 0) throw err;
        complete = false;
        break;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (complete) recordCache.set(key, { records, at: Date.now() });
    return records;
  } catch (err) {
    // Cache the empty result briefly (EMPTY_RETRY_MS) — a dead feed isn't
    // hammered on every request, but recovery is picked up within minutes.
    recordCache.set(key, { records: [], at: Date.now() });
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
// LITRE behaves like KG: 1 quintal ≈ 100 kg ≈ 100 L for dairy liquids.
function toUnit(perQuintal: number, unit: Unit): number {
  const v = unit === 'QUINTAL' ? perQuintal : perQuintal / 100;
  // ₹/kg and ₹/L to 1 decimal, ₹/quintal to nearest rupee
  return unit === 'QUINTAL' ? Math.round(v) : Math.round(v * 10) / 10;
}

// -----------------------------------------------------------------------------
// getRateForCrop — the negotiation/listing anchor, with local fallback chain
// -----------------------------------------------------------------------------
export async function getRateForCrop(
  commodity: string,
  opts: { state?: string; market?: string } = {}
): Promise<CropRate | null> {
  const item = BOARD_BY_COMMODITY.get(commodity.toLowerCase());
  if (!item) return null;
  const meta = item;

  // Pull state-scoped records first (fewer, more local), then national.
  const stateRecords = opts.state ? await fetchRecords(commodity, opts.state) : [];
  const nationalRecords = stateRecords.length ? stateRecords : await fetchRecords(commodity);

  const build = (records: AgmarkRecord[], source: RateSource, market: string | null, state: string | null): CropRate => {
    const modalPerQ = median(records.map((r) => num(r.modal_price)));
    // min/max ignore malformed (zero) values; fall back to modal so a partial
    // record can never render a ₹0 band edge.
    const mins = records.map((r) => num(r.min_price)).filter((n) => n > 0);
    const maxs = records.map((r) => num(r.max_price)).filter((n) => n > 0);
    const minPerQ = mins.length ? Math.min(...mins) : modalPerQ;
    const maxPerQ = maxs.length ? Math.max(...maxs) : modalPerQ;
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
}

export async function getMarketBreakdown(commodity: string, state?: string): Promise<MarketBreakdown | null> {
  const item = BOARD_BY_COMMODITY.get(commodity.toLowerCase());
  if (!item) return null;
  const meta = item;

  let records = await fetchRecords(meta.commodity, state);
  // A state-scoped fetch can come back empty (feed quirk); fall back to
  // filtering the national records locally so the view degrades gracefully.
  if (records.length === 0 && state) {
    records = (await fetchRecords(meta.commodity)).filter(
      (r) => r.state?.toLowerCase() === state.toLowerCase()
    );
  }

  const rows: MarketRate[] = records
    .map((r) => ({
      market: r.market ?? '—',
      district: r.district ?? '—',
      state: r.state ?? '—',
      variety: r.variety ?? '—',
      grade: r.grade ?? '—',
      date: r.arrival_date,
      modal: toUnit(num(r.modal_price), meta.unit),
      min: toUnit(num(r.min_price), meta.unit),
      max: toUnit(num(r.max_price), meta.unit),
    }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.market.localeCompare(b.market));

  return {
    commodity: meta.commodity, label: meta.label, emoji: meta.emoji, unit: meta.unit,
    count: rows.length, records: rows,
  };
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
