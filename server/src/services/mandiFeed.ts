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
// Only a COMPLETE copy is ever served. A half-read day is a slice of the
// country, and the board, a listing's anchor and the forecast would all show
// it as live national prices with no way to say otherwise. Until the first
// complete copy exists (a cold start, a capped key, a sweep that could not
// finish) callers get null and fall back to reference prices, labelled as
// such. A stale complete copy is served while a fresh one downloads in the
// background, and `warmMandiFeed()` starts the first download at boot.
//
// Each complete copy is also saved to the database (mandiFeedStore.ts), and a
// restart serves the saved one while it downloads afresh. Every deploy is a
// restart, and on a day the feed is down that used to throw away the only
// complete copy there was.
// =============================================================================

import { config } from '../config';
import { INDIAN_STATES, canonicalState } from '../utils/indianStates';
import { loadMandiCopy, saveMandiCopy } from './mandiFeedStore';

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

// Always a whole day: partial downloads are never published.
export interface MandiSnapshot {
  rows: MandiRow[];
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
// day outgrows the window, EVERY state is fetched on its own: the ones the
// first page named, then the rest of CropBid's list, for a state whose rows
// all sit past row 10,000.
//
// The sweep never stops early on a running total. The feed grows while it is
// read, so the states fetched first can gain enough rows to reach the total
// taken at the start while later states are still unread. The total is only
// checked once every state is in, and only as a floor: a state's rows only
// ever grow, so a sweep that found every state adds up to at least the
// opening total. Falling short means rows under a state spelling nobody here
// knows, and the warning says by how much. (Growth could hide such a state
// only if it is also absent from the first 10,000 rows.)
//
// Returns the whole day, or null when it could not be read whole.
async function downloadDay(): Promise<MandiRow[] | null> {
  const first = await fetchPatiently({});
  const day = first.total;
  if (first.records.length >= day) return rowsOf(first.records);
  if (first.limit < WINDOW) {
    // The key is capped (the demo key's 10 rows). A sweep would be 17,000
    // rows ten at a time, and ten rows is not a price.
    warnOnce('capped', `[rates] data.gov.in returned ${first.records.length} of ${day} rows and ` +
      `capped the page at ${first.limit}. That is what the shared demo key does: set a registered ` +
      'DATA_GOV_API_KEY. Until then the rates show reference prices.');
    return null;
  }

  const seen = [...new Set(first.records.map((r) => (r.state ?? '').trim()).filter(Boolean))];
  const known = INDIAN_STATES.map((s) => FEED_SPELLING.get(s) ?? s);
  const queue = [...seen, ...known.filter((s) => !seen.includes(s))];

  const rows: MandiRow[] = [];
  let covered = 0;
  for (const feedState of queue) {
    let page: Page;
    try {
      page = await fetchPatiently({ 'filters[state.keyword]': feedState });
    } catch (err) {
      // Throttled past patience, or the feed went down mid-sweep.
      warnFailure(err, `sweep stopped at ${feedState}`);
      return null;
    }
    if (page.records.length < page.total) {
      warnOnce('state-window', `[rates] ${feedState} alone has ${page.total} rows, past the feed's ` +
        `${WINDOW}-row window; mandiFeed.ts needs to split it further.`);
      return null;
    }
    covered += page.total;
    rows.push(...rowsOf(page.records));
  }
  if (covered < day) {
    warnOnce('shortfall', `[rates] the states add up to ${covered} of the feed's ${day} rows; the ` +
      'rest is under a state spelling mandiFeed.ts does not know.');
    return null;
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Keeping it
// -----------------------------------------------------------------------------
let current: MandiSnapshot | null = null;
let refreshing: Promise<void> | null = null;
let restoring: Promise<void> | null = null;
let restored = false;
let nextRefreshAt = 0;
const waiters = new Set<() => void>();
const subscribers = new Set<(snap: MandiSnapshot) => void>();

/**
 * Called with every new complete copy as it is published. usualPrices learns
 * each day's prices this way. A subscriber that throws is logged and skipped;
 * it cannot stop the copy being served.
 */
export function onMandiSnapshot(fn: (snap: MandiSnapshot) => void): void {
  subscribers.add(fn);
}

const usable = (s: MandiSnapshot | null): s is MandiSnapshot =>
  s !== null && Date.now() - s.fetchedAt < STALE_MAX_MS;

// Serves a copy and tells the subscribers, unless a newer one is already
// being served: a restore that finishes after a fresh download must not put
// the older copy back.
function publish(snap: MandiSnapshot) {
  if (current && current.fetchedAt >= snap.fetchedAt) return;
  current = snap;
  for (const fn of subscribers) {
    try { fn(snap); } catch (err) { warnFailure(err, 'a snapshot subscriber failed'); }
  }
}

// The copy saved before the last restart, read once per process. One older
// than STALE_MAX_MS is left where it is, for the same reason a stale copy in
// memory stops being served. A database that cannot be read is logged and
// the process carries on as it did before there was a store.
function restore(): Promise<void> {
  if (!restoring) {
    restoring = (async () => {
      try {
        const saved = await loadMandiCopy();
        if (usable(saved)) publish(saved);
      } catch (err) {
        warnOnce('restore', `[rates] could not read the saved mandi copy: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        restored = true;
        wakeWaiters();
      }
    })();
  }
  return restoring;
}

// Saving never holds up serving the copy, and a failed save only means the
// next restart has an older copy (or none) to start from.
function save(snap: MandiSnapshot) {
  saveMandiCopy(snap).catch((err) => {
    warnOnce('save', `[rates] could not save the mandi copy: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// A download that did not finish, or found nothing, is dropped: whatever was
// being served before stays, and it is tried again in FAILED_RETRY_MS. The
// reason has already been logged by then.
function refresh(): Promise<void> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const rows = await downloadDay();
        if (rows?.length === 0) warnOnce('empty', '[rates] data.gov.in returned no rows');
        if (rows && rows.length > 0) {
          const snap = { rows, fetchedAt: Date.now() };
          nextRefreshAt = Date.now() + REFRESH_MS;
          publish(snap);
          save(snap);
        } else {
          nextRefreshAt = Date.now() + FAILED_RETRY_MS;
        }
      } catch (err) {
        warnFailure(err, 'refresh failed');
        nextRefreshAt = Date.now() + FAILED_RETRY_MS;
      } finally {
        refreshing = null;
        wakeWaiters();
      }
    })();
  }
  return refreshing;
}

/**
 * The day's rows, or null when there is no complete copy fit to serve (the
 * feed has been down for days, the key is capped, or this is a cold start
 * and the download has not finished). Callers fall back to reference prices
 * on null.
 */
export async function getMandiSnapshot(): Promise<MandiSnapshot | null> {
  if (Date.now() >= nextRefreshAt) void refresh();
  if (usable(current)) return current;

  // Nothing to serve yet. After a restart the saved copy is the quickest way
  // to something (a database read against a download of a minute or more),
  // and the download is already under way beside it. Whichever produces a
  // copy first releases the visitor, and both share one deadline: neither a
  // hung database nor a slow feed holds them past COLD_WAIT_MS.
  void restore();
  const deadline = Date.now() + COLD_WAIT_MS;
  while (!usable(current)) {
    const left = deadline - Date.now();
    if (left <= 0 || (restored && !refreshing)) break;
    await nextSettled(left);
  }
  return usable(current) ? current : null;
}

// Resolves when a restore or a download next finishes, or after `ms`.
function nextSettled(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    waiters.add(done);
  });
}

function wakeWaiters() {
  for (const w of [...waiters]) w();
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
