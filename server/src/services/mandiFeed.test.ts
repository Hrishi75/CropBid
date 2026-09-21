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

import { fakeFeed, rec, WINDOW } from './mandiFeed.fake';

type Feed = typeof import('./mandiFeed');

let feed: Feed;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
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
    expect(snap?.complete).toBe(true);
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

    const first = await feed.getMandiSnapshot();
    // The first request after a restart does not wait for the sweep: it gets
    // the first page, labelled partial.
    expect(first?.complete).toBe(false);

    let snap = first;
    for (let i = 0; i < 50 && !snap?.complete; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
      snap = await feed.getMandiSnapshot();
    }
    expect(snap?.complete).toBe(true);
    expect(snap?.rows).toHaveLength(WINDOW + 5);
    // Stored under CropBid's spelling, so "Kerala" from the picker finds it.
    expect(snap?.rows.filter((r) => r.state === 'Kerala')).toHaveLength(5);
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
  it('is not mistaken for the whole day, and is not swept ten rows at a time', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => rec('Onion', i < 15 ? 'Punjab' : 'Maharashtra', 2000));
    const fetch = fakeFeed(rows, { cap: 10 });
    vi.stubGlobal('fetch', fetch);

    const snap = await feed.getMandiSnapshot();
    expect(snap?.rows).toHaveLength(10);
    expect(snap?.complete).toBe(false);
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
    expect((await feed.getMandiSnapshot())?.complete).toBe(true);
    expect(calls).toBe(2);
  });

  it('keeps serving the last complete copy, then lets it go after three days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T06:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));
    const good = await feed.getMandiSnapshot();
    expect(good?.complete).toBe(true);

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

describe('state spellings', () => {
  it('stores the feed\'s own spellings under CropBid\'s', () => {
    expect(feed.normaliseState('Keralam')).toBe('Kerala');
    expect(feed.normaliseState('Chattisgarh')).toBe('Chhattisgarh');
    expect(feed.normaliseState('NCT of Delhi')).toBe('Delhi');
    expect(feed.normaliseState('Pondicherry')).toBe('Puducherry');
    expect(feed.normaliseState('maharashtra')).toBe('Maharashtra');
  });
});
