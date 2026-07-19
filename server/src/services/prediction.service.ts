// =============================================================================
// Prediction Service — demand & supply forecast for every crop on the board
// =============================================================================
// WHY THIS EXISTS
// The rates board answers "what is the crop worth TODAY". The next question
// every farmer and buyer asks is "and which way is it going?" — sell now or
// hold, buy now or wait. This service answers that with a transparent,
// explainable model. No black box: every prediction ships with the drivers
// that produced it, so the UI can show its work.
//
// THE MODEL (deterministic, four real signals)
//   1. Price vs usual   — today's modal against the crop's reference level.
//                         Mandi prices mean-revert: a crop trading far above
//                         usual tends to ease as arrivals respond, and vice
//                         versa. Also the cleanest demand signal we have —
//                         price above usual means buyers are paying up.
//   2. Arrival breadth  — how many mandis reported the crop today (Agmarknet).
//                         Many mandis reporting = supply is broad; a thin
//                         report sheet = supply is tight.
//   3. Seasonality      — India's harvest calendar per crop. Peak-arrival
//                         months push prices down; lean months pull them up.
//                         (This is why tomato spikes every July — monsoon gap.)
//   4. Platform activity — live CropBid listings (supply) and bids placed in
//                         the last fortnight (demand). Small today, honest
//                         always; degrades to feed-only if the DB is away.
//
// Cross-market dispersion (how much reporting mandis disagree) widens or
// narrows the forecast band — when markets disagree, we say so with a wider
// band, not a false-precision point estimate.
//
// Same house rules as rates.service: never throws to the route, degrades
// gracefully, and labels honesty (confidence: high/medium/low) on every row.
// =============================================================================

import { prisma } from '../lib/prisma';
import { getBoard, getMarketBreakdown, CropRate } from './rates.service';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------
export type SupplyLevel = 'tight' | 'balanced' | 'ample';
export type DemandLevel = 'soft' | 'steady' | 'strong';
export type Direction = 'rise' | 'hold' | 'ease';
export type Confidence = 'high' | 'medium' | 'low';

export interface CropPrediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  cat: 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

  // today's anchor (from the rates board)
  modal: number;        // ₹ per unit
  usual: number;
  changePct: number;    // today vs usual, %
  source: CropRate['source'];
  mandisReporting: number;

  supply: { score: number; level: SupplyLevel; drivers: string[] };
  demand: { score: number; level: DemandLevel; drivers: string[] };

  outlook: {
    direction: Direction;
    pct7d: number;       // expected % move over the next 7 days
    low: number;         // forecast band (₹ per unit) at day 7
    high: number;
    confidence: Confidence;
  };

  advice: { farmer: string; buyer: string };
  platform: { activeListings: number; listedQty: number; bids14d: number };
}

export interface ForecastBoard {
  date: string;
  generatedAt: string;
  horizonDays: number;
  live: boolean;         // false = feed down, predictions run on reference prices
  predictions: CropPrediction[];
}

// -----------------------------------------------------------------------------
// Seasonality — India's harvest calendar, per board crop (Agmarknet spelling).
// peak = main arrival months (supply builds, prices soften);
// lean = scarcity months (arrivals thin out, prices firm).
// Sources: standard kharif/rabi cropping windows; labels are for driver copy.
// -----------------------------------------------------------------------------
interface Season { peak: number[]; peakLabel: string; lean: number[]; leanLabel: string }

const SEASONS: Record<string, Season> = {
  'Tomato':               { peak: [12, 1, 2, 3], peakLabel: 'Dec–Mar', lean: [6, 7, 8],   leanLabel: 'Jun–Aug (monsoon gap)' },
  'Onion':                { peak: [3, 4, 5],     peakLabel: 'Mar–May (rabi)', lean: [8, 9], leanLabel: 'Aug–Sep' },
  'Potato':               { peak: [1, 2, 3],     peakLabel: 'Jan–Mar', lean: [9, 10],     leanLabel: 'Sep–Oct' },
  'Green Chilli':         { peak: [12, 1, 2, 3], peakLabel: 'Dec–Mar', lean: [7, 8],      leanLabel: 'Jul–Aug' },
  'Cauliflower':          { peak: [11, 12, 1, 2], peakLabel: 'Nov–Feb', lean: [5, 6, 7],  leanLabel: 'May–Jul' },
  'Brinjal':              { peak: [11, 12, 1],   peakLabel: 'Nov–Jan', lean: [5, 6],      leanLabel: 'May–Jun' },
  'Banana':               { peak: [],            peakLabel: '',        lean: [],          leanLabel: '' }, // year-round crop
  // Dairy follows the milk cycle: winter flush builds supply, summer heat
  // thins yields. Ghee is storable, so it trades year-round without a season.
  'Milk':                 { peak: [11, 12, 1, 2], peakLabel: 'Nov–Feb (winter flush)', lean: [4, 5, 6], leanLabel: 'Apr–Jun (summer dip)' },
  'Curd':                 { peak: [11, 12, 1, 2], peakLabel: 'Nov–Feb (winter flush)', lean: [4, 5, 6], leanLabel: 'Apr–Jun (summer dip)' },
  'Paneer':               { peak: [11, 12, 1, 2], peakLabel: 'Nov–Feb (winter flush)', lean: [4, 5, 6], leanLabel: 'Apr–Jun (summer dip)' },
  'Ghee':                 { peak: [],             peakLabel: '',        lean: [],          leanLabel: '' },
  'Mango':                { peak: [4, 5, 6],     peakLabel: 'Apr–Jun', lean: [11, 12, 1], leanLabel: 'Nov–Jan (off-season)' },
  'Pomegranate':          { peak: [2, 3, 4],     peakLabel: 'Feb–Apr', lean: [6, 7],      leanLabel: 'Jun–Jul' },
  'Grapes':               { peak: [2, 3, 4],     peakLabel: 'Feb–Apr', lean: [8, 9, 10],  leanLabel: 'Aug–Oct' },
  'Apple':                { peak: [8, 9, 10],    peakLabel: 'Aug–Oct', lean: [4, 5, 6],   leanLabel: 'Apr–Jun' },
  'Wheat':                { peak: [4, 5, 6],     peakLabel: 'Apr–Jun (rabi harvest)', lean: [1, 2], leanLabel: 'Jan–Feb' },
  'Paddy(Dhan)(Common)':  { peak: [10, 11, 12],  peakLabel: 'Oct–Dec (kharif harvest)', lean: [7, 8], leanLabel: 'Jul–Aug' },
  'Maize':                { peak: [9, 10, 11],   peakLabel: 'Sep–Nov', lean: [6, 7],      leanLabel: 'Jun–Jul' },
  'Soyabean':             { peak: [10, 11, 12],  peakLabel: 'Oct–Dec', lean: [7, 8],      leanLabel: 'Jul–Aug' },
  'Turmeric':             { peak: [2, 3, 4],     peakLabel: 'Feb–Apr', lean: [10, 11],    leanLabel: 'Oct–Nov' },
};

// -----------------------------------------------------------------------------
// Model weights — all in one place so the model is auditable at a glance.
// Scores are 0–100 with 50 = normal; the outlook is a % move over 7 days.
// -----------------------------------------------------------------------------
const W = {
  // demand score
  demandPricePull: 1.6,      // points per 1% above usual (clamped ±15%)
  demandPerBid: 2.5,         // points per platform bid this fortnight (capped at 6 bids)
  demandChase: 6,            // markets disagreeing while price runs up = buyers chasing

  // supply score
  supplyBreadthBroad: 14,    // 40+ mandis reporting
  supplyBreadthGood: 7,      // 12–39 mandis
  supplyBreadthThin: -8,     // 1–3 mandis
  supplySeason: 16,          // peak month +, lean month −
  supplyPriceInverse: 10,    // price ≥8% above usual → crop is short (−); ≤−8% → glut (+)
  supplyPerListing: 2,       // live CropBid lots (capped at +4)

  // 7-day outlook (% move)
  reversionShare: 0.25,      // share of today's gap-to-usual that closes in a week
  reversionCap: 5,
  seasonalDriftPct: 1.6,     // weekly drift during peak (−) / lean (+) windows
  gapPct: 0.06,              // % per point of demand−supply imbalance
  gapCap: 3,
  outlookCap: 9,

  // forecast band width from cross-market dispersion (coefficient of variation)
  bandFloor: 0.025,
  bandCap: 0.09,
};

const HORIZON_DAYS = 7;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// ₹/kg and ₹/L to one decimal, ₹/quintal to the rupee — same precision as rates.
const roundPrice = (v: number, unit: 'KG' | 'QUINTAL' | 'LITRE') =>
  unit === 'QUINTAL' ? Math.max(1, Math.round(v)) : Math.max(0.1, round1(v));

// -----------------------------------------------------------------------------
// Platform activity — CropBid's own order book, by board crop.
// Free-text listing cropNames ("Rice", "Soybean") are resolved to board
// commodities by EXACT match against a canonical alias table — substring
// matching is banned here because it conflates distinct crops ("Sweet Potato"
// contains "Potato", "Custard Apple" contains "Apple"). A name that resolves
// to nothing simply contributes no platform signal — the honest failure mode.
// Any DB failure returns an empty list: the engine keeps working on feed data.
// -----------------------------------------------------------------------------
interface PlatformSignal { activeListings: number; listedQty: number; bids14d: number }

const EMPTY_SIGNAL: PlatformSignal = { activeListings: 0, listedQty: 0, bids14d: 0 };

// Keyed by board commodity (Agmarknet spelling). Each list holds the spellings,
// plurals and Hindi names farmers actually type; the commodity itself and the
// display label are matched automatically.
const CROP_ALIASES: Record<string, string[]> = {
  'Tomato':               ['tomatoes', 'tamatar'],
  'Onion':                ['onions', 'pyaz', 'kanda'],
  'Potato':               ['potatoes', 'aloo', 'batata'],
  'Green Chilli':         ['green chili', 'green chillies', 'green chilies', 'hari mirch', 'chilli', 'chili', 'mirchi'],
  'Cauliflower':          ['gobi', 'phool gobi', 'phul gobi'],
  'Brinjal':              ['eggplant', 'aubergine', 'baingan', 'baigan'],
  'Banana':               ['bananas', 'kela'],
  'Mango':                ['mangoes', 'mangos', 'aam', 'kesar mango', 'alphonso mango'],
  'Pomegranate':          ['pomegranates', 'anar'],
  'Grapes':               ['grape', 'angoor'],
  'Apple':                ['apples', 'seb'],
  'Wheat':                ['gehu', 'gehun', 'sharbati wheat'],
  'Paddy(Dhan)(Common)':  ['paddy', 'rice', 'dhan', 'basmati', 'basmati paddy', 'basmati rice'],
  'Maize':                ['corn', 'makka', 'makki', 'yellow maize', 'sweet corn'],
  'Soyabean':             ['soybean', 'soya', 'soya bean', 'soy bean', 'soy'],
  'Turmeric':             ['haldi', 'turmeric fingers'],
  'Milk':                 ['cow milk', 'buffalo milk', 'goat milk', 'a2 milk', 'doodh', 'dudh'],
  'Ghee':                 ['desi ghee', 'a2 ghee', 'bilona ghee', 'clarified butter'],
  'Curd':                 ['curd dahi', 'dahi', 'yogurt', 'yoghurt'],
  'Paneer':               ['cottage cheese', 'malai paneer'],
};

// "Paddy(Dhan)(Common)" → "paddy dhan common"; "  Soy Bean " → "soy bean"
const normalizeCropName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// normalized name → board commodity, built once at module load.
const ALIAS_INDEX = new Map<string, string>();
for (const [commodity, aliases] of Object.entries(CROP_ALIASES)) {
  ALIAS_INDEX.set(normalizeCropName(commodity), commodity);
  for (const alias of aliases) ALIAS_INDEX.set(normalizeCropName(alias), commodity);
}
// Display labels too ("Paddy (Rice)" → Paddy(Dhan)(Common), "Soybean" → Soyabean).
ALIAS_INDEX.set(normalizeCropName('Paddy (Rice)'), 'Paddy(Dhan)(Common)');

export function resolveCommodity(cropName: string): string | null {
  return ALIAS_INDEX.get(normalizeCropName(cropName)) ?? null;
}

async function getPlatformSignals(): Promise<Array<{ cropName: string; listings: number; qty: number; bids: number }>> {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [listings, bids] = await Promise.all([
      prisma.listing.groupBy({
        by: ['cropName'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
        _sum: { remainingQuantity: true },
      }),
      prisma.bid.findMany({
        where: { createdAt: { gte: since } },
        select: { listing: { select: { cropName: true } } },
      }),
    ]);

    const rows = new Map<string, { cropName: string; listings: number; qty: number; bids: number }>();
    // Merge, don't replace: groupBy is case-sensitive, so "Rice" and "rice"
    // arrive as separate groups that share a lowercase key here.
    for (const l of listings) {
      const key = l.cropName.toLowerCase();
      const row = rows.get(key) ?? { cropName: l.cropName, listings: 0, qty: 0, bids: 0 };
      row.listings += l._count._all;
      row.qty += l._sum.remainingQuantity ?? 0;
      rows.set(key, row);
    }
    for (const b of bids) {
      const key = b.listing.cropName.toLowerCase();
      const row = rows.get(key) ?? { cropName: b.listing.cropName, listings: 0, qty: 0, bids: 0 };
      row.bids += 1;
      rows.set(key, row);
    }
    return [...rows.values()];
  } catch {
    return []; // DB away — predictions run on the govt feed alone
  }
}

// -----------------------------------------------------------------------------
// Per-crop prediction
// -----------------------------------------------------------------------------
function predictCrop(
  rate: CropRate,
  mandis: number,
  dispersion: number, // coefficient of variation of modal across mandis
  platform: PlatformSignal,
  month: number, // 1–12
): CropPrediction {
  const season = SEASONS[rate.commodity] ?? { peak: [], peakLabel: '', lean: [], leanLabel: '' };
  const inPeak = season.peak.includes(month);
  const inLean = season.lean.includes(month);
  const pctVsUsual = rate.source === 'reference' ? 0 : rate.changePct;

  // --- demand: is the market pulling? ---------------------------------------
  let demandScore = 50;
  const demandDrivers: string[] = [];

  demandScore += clamp(pctVsUsual, -15, 15) * W.demandPricePull;
  if (pctVsUsual >= 3) demandDrivers.push(`Trading ${pctVsUsual.toFixed(1)}% above usual — buyers are paying up`);
  else if (pctVsUsual <= -3) demandDrivers.push(`Trading ${Math.abs(pctVsUsual).toFixed(1)}% below usual — buyers are holding back`);
  else demandDrivers.push('Trading inside the usual band — no unusual pull either way');

  demandScore += Math.min(platform.bids14d, 6) * W.demandPerBid;
  if (platform.bids14d > 0) {
    demandDrivers.push(`${platform.bids14d} bid${platform.bids14d === 1 ? '' : 's'} on ${rate.label} lots on CropBid this fortnight`);
  }

  if (dispersion > 0.25 && pctVsUsual > 3) {
    demandScore += W.demandChase;
    demandDrivers.push('Mandis disagree sharply on price while it runs up — a chasing market');
  }

  demandScore = Math.round(clamp(demandScore, 5, 95));
  const demandLevel: DemandLevel = demandScore > 60 ? 'strong' : demandScore < 40 ? 'soft' : 'steady';

  // --- supply: how much crop is coming to market? ----------------------------
  let supplyScore = 50;
  const supplyDrivers: string[] = [];

  if (mandis >= 40) {
    supplyScore += W.supplyBreadthBroad;
    supplyDrivers.push(`${mandis} mandis reported arrivals today — supply is broad`);
  } else if (mandis >= 12) {
    supplyScore += W.supplyBreadthGood;
    supplyDrivers.push(`${mandis} mandis reported arrivals today — steady flow`);
  } else if (mandis >= 4) {
    supplyDrivers.push(`${mandis} mandis reported arrivals today`);
  } else if (mandis >= 1) {
    supplyScore += W.supplyBreadthThin;
    supplyDrivers.push(`Only ${mandis} mandi${mandis === 1 ? '' : 's'} reported today — arrivals are thin`);
  } else {
    supplyDrivers.push('No mandi reports today — running on reference levels');
  }

  if (inPeak) {
    supplyScore += W.supplySeason;
    supplyDrivers.push(`Peak harvest window (${season.peakLabel}) — arrivals keep building`);
  } else if (inLean) {
    supplyScore -= W.supplySeason;
    supplyDrivers.push(`Lean window (${season.leanLabel}) — the next harvest is months out`);
  }

  if (pctVsUsual >= 8) {
    supplyScore -= W.supplyPriceInverse;
    supplyDrivers.push('Price well above usual — a classic sign the crop is short');
  } else if (pctVsUsual <= -8) {
    supplyScore += W.supplyPriceInverse;
    supplyDrivers.push('Price well below usual — arrivals are outrunning demand');
  }

  if (platform.activeListings > 0) {
    supplyScore += Math.min(platform.activeListings * W.supplyPerListing, 4);
    supplyDrivers.push(`${platform.activeListings} live ${rate.label} lot${platform.activeListings === 1 ? '' : 's'} listed on CropBid`);
  }

  supplyScore = Math.round(clamp(supplyScore, 5, 95));
  const supplyLevel: SupplyLevel = supplyScore > 60 ? 'ample' : supplyScore < 40 ? 'tight' : 'balanced';

  // --- 7-day price outlook ----------------------------------------------------
  const reversion = clamp(-pctVsUsual * W.reversionShare, -W.reversionCap, W.reversionCap);
  const seasonal = inPeak ? -W.seasonalDriftPct : inLean ? W.seasonalDriftPct : 0;
  const gap = clamp((demandScore - supplyScore) * W.gapPct, -W.gapCap, W.gapCap);
  const pct7d = round1(clamp(reversion + seasonal + gap, -W.outlookCap, W.outlookCap));

  const direction: Direction = pct7d >= 1.25 ? 'rise' : pct7d <= -1.25 ? 'ease' : 'hold';

  const center = rate.modal * (1 + pct7d / 100);
  const bandWidth = clamp(dispersion * 0.6, W.bandFloor, W.bandCap);
  const low = roundPrice(center * (1 - bandWidth), rate.unit);
  const high = roundPrice(center * (1 + bandWidth), rate.unit);

  const confidence: Confidence =
    rate.source === 'reference' ? 'low' : mandis >= 12 ? 'high' : 'medium';

  // --- advice — two sides of the same forecast --------------------------------
  const move = `${Math.abs(pct7d).toFixed(1)}%`;
  const advice =
    direction === 'rise'
      ? {
          farmer: `Hold if storage allows — the model sees prices firming ~${move} this week.`,
          buyer: `Buy sooner rather than later — prices look set to firm ~${move}.`,
        }
      : direction === 'ease'
        ? {
            farmer: `Sell sooner — arrivals point to prices easing ~${move} this week.`,
            buyer: `Waiting may pay — the model sees prices easing ~${move}.`,
          }
        : {
            farmer: 'A steady week ahead — sell on quality and negotiate around the modal.',
            buyer: 'A steady week ahead — negotiate around today\'s modal, no rush premium.',
          };

  return {
    commodity: rate.commodity,
    label: rate.label,
    emoji: rate.emoji,
    unit: rate.unit,
    cat: rate.cat,
    modal: rate.modal,
    usual: rate.usual,
    changePct: rate.changePct,
    source: rate.source,
    mandisReporting: mandis,
    supply: { score: supplyScore, level: supplyLevel, drivers: supplyDrivers },
    demand: { score: demandScore, level: demandLevel, drivers: demandDrivers },
    outlook: { direction, pct7d, low, high, confidence },
    advice,
    platform,
  };
}

// -----------------------------------------------------------------------------
// getForecastBoard — the whole board, predicted
// -----------------------------------------------------------------------------
export async function getForecastBoard(): Promise<ForecastBoard> {
  const [board, platformRows] = await Promise.all([getBoard(), getPlatformSignals()]);
  const month = new Date().getMonth() + 1;

  // Aggregate EVERY platform row that resolves to the same board crop —
  // "Soybean" and "Soyabean" listings both count toward Soyabean. Names that
  // resolve to no board crop are dropped rather than guessed at.
  const platformByCommodity = new Map<string, PlatformSignal>();
  for (const row of platformRows) {
    const commodity = resolveCommodity(row.cropName);
    if (!commodity) continue;
    const agg = platformByCommodity.get(commodity) ?? { ...EMPTY_SIGNAL };
    agg.activeListings += row.listings;
    agg.listedQty += row.qty;
    agg.bids14d += row.bids;
    platformByCommodity.set(commodity, agg);
  }

  const predictions = await Promise.all(
    board.rates.map(async (rate) => {
      // Breakdown reuses the day cache populated by getBoard — no extra fetch.
      const breakdown = rate.source === 'reference' ? null : await getMarketBreakdown(rate.commodity);
      const modals = (breakdown?.records ?? []).map((r) => r.modal).filter((m) => m > 0);
      const mandis = breakdown?.count ?? 0;

      // Coefficient of variation of modal prices across reporting mandis.
      let dispersion = 0;
      if (modals.length >= 3) {
        const mean = modals.reduce((a, b) => a + b, 0) / modals.length;
        const variance = modals.reduce((a, b) => a + (b - mean) ** 2, 0) / modals.length;
        dispersion = mean > 0 ? Math.sqrt(variance) / mean : 0;
      }

      const platform = platformByCommodity.get(rate.commodity) ?? EMPTY_SIGNAL;

      return predictCrop(rate, mandis, dispersion, platform, month);
    })
  );

  // Biggest expected movers first — that's what a forecast page is for.
  predictions.sort((a, b) => Math.abs(b.outlook.pct7d) - Math.abs(a.outlook.pct7d));

  return {
    date: board.date,
    generatedAt: new Date().toISOString(),
    horizonDays: HORIZON_DAYS,
    live: board.live,
    predictions,
  };
}
