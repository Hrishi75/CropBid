// =============================================================================
// mandiFeed tests: holding the whole day, and knowing when you have it
// =============================================================================
// The feed has four habits the old per-crop fetch walked straight into (see
// the header of mandiFeed.ts). Each test here is one of them, run against the
// fake data.gov.in in mandiFeed.fake.ts.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config', () => ({
  config: { dataGov: { apiKey: 'test-key', resourceId: 'test-resource', usingDemoKey: false } },
}));

// The database copy, faked: `saved` is what a restart finds, and every save
// is recorded. mandiFeedStore.test.ts covers the real table.
const store = vi.hoisted(() => ({
  saved: null as import('./mandiFeed').MandiSnapshot | null,
  load: vi.fn(),
  save: vi.fn(),
}));
vi.mock('./mandiFeedStore', () => ({
  loadMandiCopy: () => store.load(),
  saveMandiCopy: (snap: unknown) => store.save(snap),
}));

import { fakeFeed, rec, WINDOW } from './mandiFeed.fake';

type Feed = typeof import('./mandiFeed');

let feed: Feed;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  store.saved = null;
  store.load.mockReset();
  store.load.mockImplementation(async () => store.saved);
  store.save.mockReset();
  store.save.mockImplementation(async () => true);
  vi.resetModules();
  feed = await import('./mandiFeed');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a day that fits in one request', () => {
  it('is read in one request and is complete', async () => {
    const fetch = fakeFeed([rec('Onion', 'Maharashtra', 2000), rec('Wheat', 'Punjab', 2500)]);
    vi.stubGlobal('fetch', fetch);

    const snap = await feed.getMandiSnapshot();
    expect(snap?.rows).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('a day bigger than the 10,000-row window', () => {
  it('is read state by state until the states add up to the day', async () => {
    // Kerala's rows sit past row 10,000, so the first page never shows them
    // and they are only found through CropBid's own list of states, under the
    // feed's spelling "Keralam".
    const rows = [
      ...Array.from({ length: WINDOW }, (_, i) => rec('Onion', 'Maharashtra', 2000 + (i % 7))),
      ...Array.from({ length: 5 }, () => rec('Banana', 'Keralam', 3000)),
    ];
    vi.stubGlobal('fetch', fakeFeed(rows));

    const snap = await feed.getMandiSnapshot();
    expect(snap?.rows).toHaveLength(WINDOW + 5);
    // Stored under CropBid's spelling, so "Kerala" from the picker finds it.
    expect(snap?.rows.filter((r) => r.state === 'Kerala')).toHaveLength(5);
  });

  it('reads every state even when the first ones have grown past the opening total', async () => {
    // The day is counted at 10,005 rows, Punjab's 5 past the first page. By
    // the time Maharashtra and Gujarat are read, Maharashtra has 10 more, so
    // those two alone reach the count while Punjab is still unread. Stopping
    // there would drop Punjab and call the day whole.
    const rows = [
      ...Array.from({ length: 6000 }, () => rec('Onion', 'Maharashtra', 2000)),
      ...Array.from({ length: 4000 }, () => rec('Onion', 'Gujarat', 2000)),
      ...Array.from({ length: 5 }, () => rec('Wheat', 'Punjab', 2500)),
    ];
    const inner = fakeFeed(rows);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const res = await inner(input);
      if (inner.mock.calls.length === 1) rows.push(...Array.from({ length: 10 }, () => rec('Onion', 'Maharashtra', 2000)));
      return res;
    }));

    const snap = await feed.getMandiSnapshot();
    expect(snap?.rows.filter((r) => r.state === 'Punjab')).toHaveLength(5);
  });

  it('asks for each state with the exact filter, not the word match', async () => {
    const rows = Array.from({ length: WINDOW + 1 }, () => rec('Onion', 'Andhra Pradesh', 2000));
    const fetch = fakeFeed(rows);
    vi.stubGlobal('fetch', fetch);

    await feed.getMandiSnapshot();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const second = new URL(fetch.mock.calls[1][0] as string);
    expect(second.searchParams.get('filters[state.keyword]')).toBe('Andhra Pradesh');
    expect(second.searchParams.has('filters[state]')).toBe(false);
  });
});

describe('a key that caps every page (the shared demo key)', () => {
  it('is not served as the day, and is not swept ten rows at a time', async () => {
    // Ten rows passed off as India's price is the bug that hid Maharashtra's
    // onion. Reference prices, labelled as such, are the honest answer.
    const rows = Array.from({ length: 30 }, (_, i) => rec('Onion', i < 15 ? 'Punjab' : 'Maharashtra', 2000));
    const fetch = fakeFeed(rows, { cap: 10 });
    vi.stubGlobal('fetch', fetch);

    expect(await feed.getMandiSnapshot()).toBeNull();
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('capped the page at 10')));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('when the feed fails', () => {
  it('waits out a 429 and carries on, without holding the visitor while it does', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)], {
      fail: () => (calls++ === 0 ? 429 : undefined),
    }));

    // Cold start into a 429: this visitor is let go after ten seconds and
    // gets reference prices...
    const pending = feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();

    // ...while the download waits out the throttle and finishes for the next.
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await feed.getMandiSnapshot())?.rows).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('keeps serving the last complete copy, then lets it go after three days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T06:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));
    const good = await feed.getMandiSnapshot();
    expect(good?.rows).toHaveLength(1);

    // Past the refresh interval, and the feed is down: the visitor gets the
    // copy they had, straight away, while the retry happens behind them.
    vi.stubGlobal('fetch', fakeFeed([], { fail: () => 503 }));
    vi.setSystemTime(new Date('2026-09-21T09:00:00Z'));
    expect(await feed.getMandiSnapshot()).toBe(good);

    // Four days on, still down: a copy that old is not today's price.
    vi.setSystemTime(new Date('2026-09-25T09:00:00Z'));
    const pending = feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(await pending).toBeNull();
  });

  it('serves nothing rather than a half-read day, even on a cold start', async () => {
    // The first page is 10,000 rows of the country, in the feed's own order:
    // whole states can be missing from it. Served, the board would show it
    // as live national prices and a state's view would show its reports gone.
    vi.useFakeTimers();
    const rows = [
      ...Array.from({ length: WINDOW }, () => rec('Onion', 'Punjab', 2000)),
      rec('Onion', 'Maharashtra', 3800),
    ];
    vi.stubGlobal('fetch', fakeFeed(rows, {
      fail: (u) => (u.searchParams.get('filters[state.keyword]') === 'Maharashtra' ? 503 : undefined),
    }));

    const pending = feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(await feed.getMandiSnapshot()).toBeNull();
  });

  it('never lets a half-finished download replace a complete one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T06:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));
    const good = await feed.getMandiSnapshot();

    // Later the day outgrows the window and every state request fails, so the
    // sweep stops with only the first page: a slice of the country.
    const bigger = Array.from({ length: WINDOW + 1 }, () => rec('Onion', 'Punjab', 9000));
    vi.stubGlobal('fetch', fakeFeed(bigger, {
      fail: (u) => (u.searchParams.has('filters[state.keyword]') ? 503 : undefined),
    }));
    vi.setSystemTime(new Date('2026-09-21T09:00:00Z'));
    await feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(await feed.getMandiSnapshot()).toBe(good);
  });
});

describe('across a restart', () => {
  // Every deploy restarts the API. On 2026-09-26 data.gov.in was down, a
  // deploy threw away the day's only complete copy, and the rates went to
  // reference prices until the feed came back.
  const savedDay = (fetchedAt: number) => ({
    rows: [{ state: 'Maharashtra', district: 'D', market: 'Pune', commodity: 'Onion', variety: 'Other', grade: 'FAQ', date: '25/09/2026', min: 1600, max: 2400, modal: 2000 }],
    fetchedAt,
  });

  it('saves every complete copy', async () => {
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));
    const snap = await feed.getMandiSnapshot();
    await vi.waitFor(() => expect(store.save).toHaveBeenCalledWith(snap));
  });

  it('never saves a copy that was not complete', async () => {
    vi.stubGlobal('fetch', fakeFeed(Array.from({ length: 30 }, () => rec('Onion', 'Punjab', 2000)), { cap: 10 }));
    expect(await feed.getMandiSnapshot()).toBeNull();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('serves the saved copy at once while the feed is down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    store.saved = savedDay(Date.parse('2026-09-26T08:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([], { fail: () => 502 }));

    expect(await feed.getMandiSnapshot()).toBe(store.saved);
  });

  it('tells the subscribers about the saved copy, so "vs usual" is there after a restart', async () => {
    store.saved = savedDay(Date.now() - 60_000);
    vi.stubGlobal('fetch', fakeFeed([], { fail: () => 502 }));
    const seen = vi.fn();
    feed.onMandiSnapshot(seen);

    await feed.getMandiSnapshot();
    expect(seen).toHaveBeenCalledWith(store.saved);
  });

  it('leaves a saved copy older than three days where it is', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    store.saved = savedDay(Date.parse('2026-09-22T08:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([], { fail: () => 502 }));

    const pending = feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
  });

  it('does not put the saved copy back over a fresher download', async () => {
    // The database is slow to answer and the feed is quick: the download
    // lands first, and the older saved copy arriving after it is ignored.
    let answer: (s: unknown) => void = () => {};
    store.load.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 3000)]));

    const pending = feed.getMandiSnapshot();
    await vi.waitFor(() => expect(store.save).toHaveBeenCalled());
    answer(savedDay(Date.now() - 60 * 60 * 1000));
    const snap = await pending;

    expect(snap?.rows[0].modal).toBe(3000);
    expect((await feed.getMandiSnapshot())?.rows[0].modal).toBe(3000);
  });

  it('carries on without the saved copy when the database cannot be read', async () => {
    store.load.mockImplementation(async () => { throw new Error('connection refused'); });
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));

    expect((await feed.getMandiSnapshot())?.rows).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('could not read the saved mandi copy'));
  });

  it('does not hold the visitor on a database that hangs', async () => {
    vi.useFakeTimers();
    store.load.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fakeFeed([], { fail: () => 502 }));

    const pending = feed.getMandiSnapshot();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toBeNull();
  });
});

describe('state spellings', () => {
  it('stores the feed\'s own spellings under CropBid\'s', () => {
    expect(feed.normaliseState('Keralam')).toBe('Kerala');
    expect(feed.normaliseState('Chattisgarh')).toBe('Chhattisgarh');
    expect(feed.normaliseState('NCT of Delhi')).toBe('Delhi');
    expect(feed.normaliseState('Pondicherry')).toBe('Puducherry');
    expect(feed.normaliseState('maharashtra')).toBe('Maharashtra');
  });
});
