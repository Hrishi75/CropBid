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
// the seasons without anyone touching it. It started from nothing on
// 2026-09-22 (the user's call, rather than backfilling from the government's
// history), so for the first day there is no comparison at all and the early
// averages cover only the days seen so far.
//
// One average per crop PER STATE, plus an all-India one (state ""). The day's
// reports arrive unevenly: on 2026-09-22 Tamil Nadu's farmer markets (potato
// at ₹35) had all reported by the afternoon and Uttar Pradesh's bulk mandis
// (₹5.5) a third of theirs, so the all-India median read ₹18 against the
// previous day's ₹11 while no state's price had moved. Comparing each state
// with its own past cancels that; rates.service.ts does the comparing.
//
// The day that counts is the LAST price seen for it: a morning refresh carries
// only the mandis that have reported by then. So each row carries the day it
// is watching and that day's latest price, written with every refresh, and
// the first write of a later date folds the watched day into the average.
//
// THE DATABASE DOES THE FOLDING, in the same UPDATE, from the row as
// committed, and every process takes its averages back from what that UPDATE
// returns. Review caught the version before, which folded in memory and wrote
// once a day: a restart between a day's last refresh and the next date lost
// that day for good, and two processes in a deploy's overlap could each keep
// the average the other had overwritten. Writing on every refresh costs
// nothing the free-plan database notices: a refresh only happens when someone
// asks for rates, so it is awake anyway. The table stays one row per crop per
// state, about 1,600, updated in place.
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

interface Stored {
  perQuintal: number;         // the running average; meaningless while days = 0
  days: number;
  pendingPerQuintal: number;  // the watched day's latest price
}

/** The key for one crop in one state; state "" is all India. */
export const usualKey = (commodity: string, state: string) => `${commodity}${state}`;
const splitKey = (key: string) => key.split('') as [string, string];

const stored = new Map<string, Stored>();
let loaded = false;
let loading: Promise<boolean> | null = null;
let lastFailedAt = 0;

interface Row { commodity: string; state: string; perQuintal: number; days: number; pendingPerQuintal: number }

function remember(rows: Row[]) {
  for (const r of rows) {
    stored.set(usualKey(r.commodity, r.state), {
      perQuintal: Number(r.perQuintal), days: Number(r.days), pendingPerQuintal: Number(r.pendingPerQuintal),
    });
  }
}

/** Reads the table into memory, once per process. Resolves false on failure. */
export function loadUsualPrices(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (Date.now() - lastFailedAt < LOAD_RETRY_MS) return Promise.resolve(false);
  if (!loading) {
    loading = prisma.usualPrice.findMany()
      .then((rows) => { remember(rows); loaded = true; return true; })
      .catch((err: unknown) => {
        lastFailedAt = Date.now();
        console.warn('[rates] could not read usual prices:', err instanceof Error ? err.message : err);
        return false;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

// Writes are one at a time, so two downloads landing together cannot race
// each other's read-back into memory.
let writing: Promise<void> = Promise.resolve();

/**
 * Hands over the prices from a complete download dated `day` (YYYY-MM-DD),
 * keyed by usualKey. Resolves once they are written and read back.
 */
export function observeDay(day: string, prices: Map<string, number>): Promise<void> {
  writing = writing.then(() => write(day, prices));
  return writing;
}

async function write(day: string, prices: Map<string, number>): Promise<void> {
  const entries = [...prices].filter(([, price]) => price > 0);
  if (entries.length === 0) return;
  // The read has to land first, or it could overwrite what this write returns.
  await loadUsualPrices();
  try {
    // For each row: a later date folds the watched day into the average (a
    // plain mean while it fills, then a thirtieth) and starts watching the
    // new one; the same date only updates the watched day's price; an older
    // date, from a stale copy, changes nothing. Every SET expression reads the
    // row as it was before this statement.
    const rows = await prisma.$queryRaw<Row[]>`
      INSERT INTO "UsualPrice"
        ("commodity", "state", "perQuintal", "days", "lastDay", "pendingDay", "pendingPerQuintal", "updatedAt")
      SELECT t.commodity, t.state, t.price, 0, NULL, ${day}::date, t.price, now()
      FROM unnest(
        ${entries.map(([k]) => splitKey(k)[0])}::text[],
        ${entries.map(([k]) => splitKey(k)[1])}::text[],
        ${entries.map(([, price]) => price)}::float8[]
      ) AS t(commodity, state, price)
      ON CONFLICT ("commodity", "state") DO UPDATE SET
        "perQuintal" = CASE WHEN EXCLUDED."pendingDay" > "UsualPrice"."pendingDay"
          THEN "UsualPrice"."perQuintal"
             + ("UsualPrice"."pendingPerQuintal" - "UsualPrice"."perQuintal")
             / LEAST("UsualPrice"."days" + 1, ${SPAN_DAYS}::int)
          ELSE "UsualPrice"."perQuintal" END,
        "days" = CASE WHEN EXCLUDED."pendingDay" > "UsualPrice"."pendingDay"
          THEN "UsualPrice"."days" + 1 ELSE "UsualPrice"."days" END,
        "lastDay" = CASE WHEN EXCLUDED."pendingDay" > "UsualPrice"."pendingDay"
          THEN "UsualPrice"."pendingDay" ELSE "UsualPrice"."lastDay" END,
        "pendingPerQuintal" = CASE WHEN EXCLUDED."pendingDay" >= "UsualPrice"."pendingDay"
          THEN EXCLUDED."pendingPerQuintal" ELSE "UsualPrice"."pendingPerQuintal" END,
        "pendingDay" = GREATEST("UsualPrice"."pendingDay", EXCLUDED."pendingDay"),
        "updatedAt" = now()
      RETURNING "commodity", "state", "perQuintal", "days", "pendingPerQuintal"`;
    remember(rows);
  } catch (err) {
    console.warn(`[rates] could not save usual prices for ${day}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * The usual price for a crop in a state ("" for all India): its running
 * average, or on its first day there (no history yet) the day's own latest
 * price with `days: 0`, which callers must not present as a comparison. Null
 * when the crop has never been seen there.
 */
export function usualFor(commodity: string, state: string): Usual | null {
  const s = stored.get(usualKey(commodity, state));
  if (!s) return null;
  return s.days > 0 ? { perQuintal: s.perQuintal, days: s.days } : { perQuintal: s.pendingPerQuintal, days: 0 };
}
