// =============================================================================
// Usual prices: what each crop has been selling for lately
// =============================================================================
// Every rates card says how today's price sits against the crop's "usual" one,
// and the forecast reads the same gap as a sign of scarcity or glut. "Usual"
// used to be one price typed into the code per crop, never updated: by
// September 2026 it had onion at ₹18/kg against ₹47 in the mandis, so the card
// said "+164% vs usual" and the forecast predicted a fall that was only the
// number being old.
//
// Now it is learned from the feed itself. Each day's price for every
// commodity is folded into a running average: an ordinary mean for the first
// 30 days, then each new day counts for a thirtieth, so the average follows
// the seasons without anyone touching it.
//
// One average per crop PER STATE, plus an all-India one (state ""). The day's
// reports arrive unevenly: on 2026-09-22 Tamil Nadu's farmer markets (potato
// at ₹35) had all reported by the afternoon and Uttar Pradesh's bulk mandis
// (₹5.5) a third of theirs, so the all-India median read ₹18 against the
// previous day's ₹11 while no state's price had moved. Comparing each state
// with its own past cancels that; rates.service.ts does the comparing. It started from nothing on
// 2026-09-22 (the user's call, rather than backfilling from the government's
// history), so for the first day there is no comparison at all and the early
// averages cover only the days seen so far.
//
// The day that counts is the LAST price seen for it, folded in once the feed
// has moved on to the next date: a morning refresh carries only the mandis
// that have reported by then. Today's prices therefore live in memory, and the
// database is written once a day, one row per crop per state, updated in
// place: the table stays about 1,600 rows and the free-plan database is not
// woken on every two-hourly refresh. A restart in the middle of the day loses nothing but
// that day's earlier refreshes, which the next one replaces anyway.
// =============================================================================

import { prisma } from '../lib/prisma';

// Days the average spans once it is full.
const SPAN_DAYS = 30;
// After a failed read, how long before trying the database again, so a
// database outage does not become one failed query per page view.
const LOAD_RETRY_MS = 10 * 60 * 1000;

export interface Usual {
  perQuintal: number;  // ₹ per quintal
  days: number;        // days behind it; 0 means today's own price, no history
}

interface Stored { perQuintal: number; days: number; lastDay: string } // lastDay YYYY-MM-DD

/** The key for one crop in one state; state "" is all India. */
export const usualKey = (commodity: string, state: string) => `${commodity}\u0001${state}`;
const splitKey = (key: string) => key.split('\u0001') as [string, string];

const stored = new Map<string, Stored>();
let loaded = false;
let loading: Promise<boolean> | null = null;
let lastFailedAt = 0;

// Today's price per crop and state (usualKey), from the latest complete download.
let today: { day: string; prices: Map<string, number> } | null = null;

/**
 * Reads the table into memory, once. Resolves false when the database could
 * not be read, and nothing may be folded in until it has been: folding into
 * an empty map would restart every crop's average from a single day.
 */
export function loadUsualPrices(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (Date.now() - lastFailedAt < LOAD_RETRY_MS) return Promise.resolve(false);
  if (!loading) {
    loading = prisma.usualPrice.findMany()
      .then((rows) => {
        for (const r of rows) {
          // A fold that happened in this process wins over what was read.
          const key = usualKey(r.commodity, r.state);
          if (!stored.has(key)) {
            stored.set(key, { perQuintal: r.perQuintal, days: r.days, lastDay: isoDay(r.lastDay) });
          }
        }
        loaded = true;
        return true;
      })
      .catch((err: unknown) => {
        lastFailedAt = Date.now();
        console.warn('[rates] could not read usual prices:', err instanceof Error ? err.message : err);
        return false;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

/**
 * Hands over the prices from a complete download dated `day` (YYYY-MM-DD),
 * keyed by usualKey. The latest download of a day replaces the earlier ones; the
 * first download of a new day folds the previous day in. Resolves once any
 * fold has been written, which only tests need to wait for.
 */
export function observeDay(day: string, prices: Map<string, number>): Promise<void> {
  if (today && day < today.day) return Promise.resolve(); // an older copy: nothing new in it
  const finished = today && day > today.day ? today : null;
  today = { day, prices };
  return finished ? fold(finished) : Promise.resolve();
}

async function fold(finished: { day: string; prices: Map<string, number> }): Promise<void> {
  if (!(await loadUsualPrices())) {
    console.warn(`[rates] ${finished.day} was not added to the usual prices: the table could not be read`);
    return;
  }

  const next: Array<[string, Stored]> = [];
  for (const [key, price] of finished.prices) {
    if (!(price > 0)) continue;
    const prev = stored.get(key);
    if (prev && prev.lastDay >= finished.day) continue; // already in, e.g. from another process
    // A plain mean while the average is filling, then a thirtieth per day.
    const weight = Math.min((prev?.days ?? 0) + 1, SPAN_DAYS);
    const perQuintal = prev ? prev.perQuintal + (price - prev.perQuintal) / weight : price;
    next.push([key, { perQuintal, days: (prev?.days ?? 0) + 1, lastDay: finished.day }]);
  }
  if (next.length === 0) return;

  // Memory first, so the pages move on even if the write fails; the next
  // day's write carries absolute values and brings the table back in line.
  for (const [key, s] of next) stored.set(key, s);

  try {
    // One statement for every row. The WHERE keeps a day from being counted
    // twice if two processes ever fold it (a deploy's overlap).
    await prisma.$executeRaw`
      INSERT INTO "UsualPrice" ("commodity", "state", "perQuintal", "days", "lastDay", "updatedAt")
      SELECT t.commodity, t.state, t.per_quintal, t.days, t.last_day::date, now()
      FROM unnest(
        ${next.map(([k]) => splitKey(k)[0])}::text[],
        ${next.map(([k]) => splitKey(k)[1])}::text[],
        ${next.map(([, s]) => s.perQuintal)}::float8[],
        ${next.map(([, s]) => s.days)}::int[],
        ${next.map(([, s]) => s.lastDay)}::text[]
      ) AS t(commodity, state, per_quintal, days, last_day)
      ON CONFLICT ("commodity", "state") DO UPDATE
        SET "perQuintal" = EXCLUDED."perQuintal", "days" = EXCLUDED."days",
            "lastDay" = EXCLUDED."lastDay", "updatedAt" = now()
        WHERE "UsualPrice"."lastDay" < EXCLUDED."lastDay"`;
  } catch (err) {
    console.warn(`[rates] could not save usual prices for ${finished.day}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * The usual price for a crop in a state ("" for all India): its running
 * average, or on its first day there (no history yet) today's own price with
 * `days: 0`, which callers must not present as a comparison. Null when the
 * crop has never been seen there.
 */
export function usualFor(commodity: string, state: string): Usual | null {
  const key = usualKey(commodity, state);
  const s = stored.get(key);
  if (s) return { perQuintal: s.perQuintal, days: s.days };
  const price = today?.prices.get(key);
  return price ? { perQuintal: price, days: 0 } : null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
