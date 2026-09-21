// =============================================================================
// Mandi feed: the government's daily price report, held whole
// =============================================================================
// Every rate on CropBid comes from one data.gov.in resource: "Current Daily
// Price of Various Commodities from Various Markets (Mandi)", Agmarknet's
// report of the day, about 17,000 rows across 260 commodities by mid-afternoon.
// This file downloads ALL of it, keeps it in memory, and answers every rates
// question (the board, a state's view, one crop's mandis, the forecast) from
// that one copy. It used to ask the feed per crop and per state instead, and
// four things about the feed made that wrong:
//
//   1. Its filters match on ANY SHARED WORD. `filters[commodity]=Onion`
//      returns spring onion ("Onion Green") too, and `filters[state]=Andhra
//      Pradesh` returns Madhya, Uttar and Himachal Pradesh as well. The exact
//      filter is `filters[<field>.keyword]`, and matching names happens here.
//   2. No request can reach past row 10,000 of a result (offset + limit, an
//      Elasticsearch window), and the whole day is bigger than that. So the
//      day is read one state at a time, and each state fits.
//   3. The shared demo key returns 10 rows whatever `limit` asks for, and says
//      `limit: 10` in the reply. A page shorter than asked is therefore not
//      proof the result set ended: `total` is, so completeness is judged on it.
//   4. A key is refused for a minute or two after a burst. Thirty crops asked
//      for at once was a burst; the same volume one request at a time is not.
//      So requests go out strictly one after another, and a 429 is waited out.
//
// A visitor never waits on the feed except on the first request after a
// restart, and `warmMandiFeed()` at boot usually has it loaded before then.
// A stale copy is served while a fresh one downloads in the background.
// =============================================================================

import { config } from '../config';
import { INDIAN_STATES, canonicalState } from '../utils/indianStates';

export interface MandiRow {
  state: string;      // canonical spelling (utils/indianStates) where we know it
  district: string;
  market: string;
  commodity: string;  // the feed's own name, trimmed
  variety: string;
  grade: string;
  date: string;       // arrival_date as reported, DD/MM/YYYY
  min: number;        // ₹ per quintal, as the feed reports every commodity
  max: number;
  modal: number;
}

export interface MandiSnapshot {
  rows: MandiRow[];
  // True only when the rows add up to the `total` the feed itself reported.
  // A partial copy is served while nothing better exists, but never kept in
  // place of a complete one, however old that is within STALE_MAX_MS.
  complete: boolean;
  fetchedAt: number;
}

// The feed spells five states its own way. Rows are stored under the spelling
// the rest of CropBid uses, so "Kerala" from a listing or the /rates picker
// finds Kerala's mandis.
const FEED_STATE_NAMES: Record<string, string> = {
  Keralam: 'Kerala',
  Chattisgarh: 'Chhattisgarh',
  'NCT of Delhi': 'Delhi',
  Pondicherry: 'Puducherry',
  'Andaman and Nicobar': 'Andaman and Nicobar Islands',
};

/** A state as the feed or a user spells it, in CropBid's spelling. */
export function normaliseState(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ');
  return FEED_STATE_NAMES[t] ?? canonicalState(t) ?? t;
}

// Every state in the feed's spelling, for the rows the first page missed.
const FEED_SPELLING = new Map(Object.entries(FEED_STATE_NAMES).map(([feed, ours]) => [ours, feed]));

const WINDOW = 10_000;                       // offset + limit ceiling, see (2)
const REQUEST_TIMEOUT_MS = 45_000;           // a full 10,000-row page takes ~6s
const THROTTLE_WAITS_MS = [15_000, 30_000, 60_000];
const REFRESH_MS = 2 * 60 * 60 * 1000;       // mandis report through the day
const FAILED_RETRY_MS = 10 * 60 * 1000;
const COLD_WAIT_MS = 10_000;
// A copy this old stops being a fair anchor even if the feed is still down,
// and the board says "reference" out loud instead of quoting it as today's.
const STALE_MAX_MS = 3 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// One request
// -----------------------------------------------------------------------------
interface RawRecord {
  state?: string; district?: string; market?: string; commodity?: string;
  variety?: string; grade?: string; arrival_date?: string;
  min_price?: string | number; max_price?: string | number; modal_price?: string | number;
}

interface Page { total: number; limit: number; records: RawRecord[] }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchPage(filters: Record<string, string>): Promise<Page> {
  const url = new URL(`https://api.data.gov.in/resource/${config.dataGov.resourceId}`);
  url.searchParams.set('api-key', config.dataGov.apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(WINDOW));
  url.searchParams.set('offset', '0');
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`data.gov.in ${res.status}`);
    const json = (await res.json()) as { total?: number | string; limit?: number | string; records?: RawRecord[]; message?: string };
    // Upstream errors (a bad filter, the window) come back as HTTP 200 with
    // a message and no records.
    if (!Array.isArray(json.records)) throw new Error(`data.gov.in: ${String(json.message ?? 'no records').slice(0, 160)}`);
    const records = json.records;
    return {
      total: Number(json.total ?? records.length) || 0,
      limit: Number(json.limit ?? WINDOW) || records.length,
      records,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Waits out a 429 or a timeout and tries again, then gives up.
async function fetchPatiently(filters: Record<string, string>): Promise<Page> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchPage(filters);
    } catch (err) {
      const wait = THROTTLE_WAITS_MS[attempt];
      if (wait === undefined) throw err;
      await sleep(wait);
    }
  }
}

const num = (v: string | number | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

function toRow(r: RawRecord): MandiRow | null {
  const modal = num(r.modal_price);
  if (!(modal > 0) || !r.commodity) return null;
  return {
    state: normaliseState(r.state ?? ''),
    district: (r.district ?? '').trim(),
    market: (r.market ?? '').trim(),
    commodity: r.commodity.trim().replace(/\s+/g, ' '),
    variety: (r.variety ?? '').trim(),
    grade: (r.grade ?? '').trim(),
    date: (r.arrival_date ?? '').trim(),
    min: num(r.min_price),
    max: num(r.max_price),
    modal,
  };
}

const rowsOf = (records: RawRecord[]) => records.map(toRow).filter((r): r is MandiRow => r !== null);

// -----------------------------------------------------------------------------
// The whole day
// -----------------------------------------------------------------------------
// One unfiltered request gives the day's total, the states the feed is using
// that day (in its own spelling) and, early in the day, everything. Once the
// day outgrows the window, each state is fetched on its own until the states'
// totals add up to the day's. A state absent from the first page is found
// through CropBid's own list; one the feed spells in a way nobody here knows
// leaves the copy incomplete, and the warning names the shortfall.
async function downloadDay(onFirstPage: (partial: MandiSnapshot) => void): Promise<MandiSnapshot> {
  const first = await fetchPatiently({});
  const day = first.total;
  if (first.records.length >= day) {
    return { rows: rowsOf(first.records), complete: true, fetchedAt: Date.now() };
  }
  if (first.limit < WINDOW) {
    // The key is capped (the demo key's 10 rows). A sweep would be 17,000
    // rows ten at a time; serve the sliver and say why.
    warnOnce('capped', `[rates] data.gov.in returned ${first.records.length} of ${day} rows and ` +
      `capped the page at ${first.limit}. That is what the shared demo key does: set a registered ` +
      'DATA_GOV_API_KEY or every price is a median of a handful of mandis.');
    return { rows: rowsOf(first.records), complete: false, fetchedAt: Date.now() };
  }

  const firstRows = rowsOf(first.records);
  onFirstPage({ rows: firstRows, complete: false, fetchedAt: Date.now() });

  const seen = [...new Set(first.records.map((r) => (r.state ?? '').trim()).filter(Boolean))];
  const known = INDIAN_STATES.map((s) => FEED_SPELLING.get(s) ?? s);
  const queue = [...seen, ...known.filter((s) => !seen.includes(s))];

  const rows: MandiRow[] = [];
  const fetched = new Set<string>();
  let covered = 0;
  let complete = true;
  for (const feedState of queue) {
    if (covered >= day) break;
    let page: Page;
    try {
      page = await fetchPatiently({ 'filters[state.keyword]': feedState });
    } catch (err) {
      // Throttled past patience, or the feed went down mid-sweep. Keep what
      // arrived and fill the rest of the day from the first page.
      warnFailure(err, `sweep stopped at ${feedState}`);
      complete = false;
      break;
    }
    covered += page.total;
    if (page.records.length < page.total) complete = false;
    rows.push(...rowsOf(page.records));
    fetched.add(normaliseState(feedState));
  }
  if (covered < day) {
    complete = false;
    warnOnce('shortfall', `[rates] the states add up to ${covered} of the feed's ${day} rows; ` +
      'the rest is under a state spelling mandiFeed.ts does not know, or the sweep stopped early.');
  }
  rows.push(...firstRows.filter((r) => !fetched.has(r.state)));
  return { rows, complete, fetchedAt: Date.now() };
}

// -----------------------------------------------------------------------------
// Keeping it
// -----------------------------------------------------------------------------
let current: MandiSnapshot | null = null;
let refreshing: Promise<void> | null = null;
let nextRefreshAt = 0;
const listeners = new Set<() => void>();

const usable = (s: MandiSnapshot | null): s is MandiSnapshot =>
  s !== null && Date.now() - s.fetchedAt < STALE_MAX_MS;

function publish(s: MandiSnapshot) {
  current = s;
  for (const l of listeners) l();
}

// A complete copy always wins. A partial one only replaces nothing, or
// another partial, or a copy too old to serve.
function offer(s: MandiSnapshot) {
  if (s.complete || !usable(current) || !current.complete) publish(s);
}

function refresh(): Promise<void> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const snap = await downloadDay(offer);
        if (snap.rows.length === 0) throw new Error('data.gov.in returned no rows');
        offer(snap);
        nextRefreshAt = Date.now() + (snap.complete ? REFRESH_MS : FAILED_RETRY_MS);
      } catch (err) {
        warnFailure(err, 'refresh failed');
        nextRefreshAt = Date.now() + FAILED_RETRY_MS;
      } finally {
        refreshing = null;
        for (const l of listeners) l();
      }
    })();
  }
  return refreshing;
}

/**
 * The day's rows, or null when there is nothing fit to serve (the feed has
 * been down for days, or this is a cold start and the first page is slow).
 * Callers fall back to reference prices on null.
 */
export async function getMandiSnapshot(): Promise<MandiSnapshot | null> {
  if (Date.now() >= nextRefreshAt) void refresh();
  if (usable(current)) return current;
  if (!refreshing) return null;

  // Nothing to serve yet: wait for the first page or the end of the refresh,
  // whichever comes first, but never hold a visitor longer than COLD_WAIT_MS.
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); listeners.delete(done); resolve(); };
    const timer = setTimeout(done, COLD_WAIT_MS);
    listeners.add(done);
  });
  return usable(current) ? current : null;
}

/** Start the first download at boot, so the first visitor is not the one who waits. */
export function warmMandiFeed(): void {
  void getMandiSnapshot();
}

// -----------------------------------------------------------------------------
// Logging: one line per failure mode per hour, not one per request
// -----------------------------------------------------------------------------
const WARN_THROTTLE_MS = 60 * 60 * 1000;
const lastWarnAt = new Map<string, number>();

function warnOnce(kind: string, message: string) {
  const at = lastWarnAt.get(kind) ?? 0;
  if (Date.now() - at < WARN_THROTTLE_MS) return;
  lastWarnAt.set(kind, Date.now());
  console.warn(message);
}

function warnFailure(err: unknown, context: string) {
  const reason = err instanceof Error ? err.message : String(err);
  if (config.dataGov.usingDemoKey) {
    warnOnce('demo', '[rates] DATA_GOV_API_KEY is not set, so the feed is read with data.gov.in\'s ' +
      'shared demo key, which is rate-limited and capped at 10 rows a request. Register a free key ' +
      'at https://data.gov.in and set DATA_GOV_API_KEY.');
  }
  warnOnce(`fail:${reason}`, `[rates] feed ${context}: ${reason}`);
}
