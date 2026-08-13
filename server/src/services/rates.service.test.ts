// =============================================================================
// rates.service tests — the storefront must not flicker
// =============================================================================
// The hero chips and the price ticker read `source` to decide whether to show
// a real day-over-day move or a flat "ref". So an intermittent upstream — one
// 429 out of the burst getBoard fires, one 8s timeout — used to change what the
// homepage SAYS between two loads a minute apart: live price with a move, then
// reference with none, then back. These tests pin the two behaviours that stop
// that: a failed fetch reuses the last real records, and a crop that has been
// silent past the staleness bound is allowed to fall back to reference.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config', () => ({
  config: { dataGov: { apiKey: 'test-key', resourceId: 'test-resource', usingDemoKey: false } },
}));

import { getRateForCrop } from './rates.service';

function recordsResponse(records: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ records }) } as unknown as Response;
}

// Wheat, because the board carries a QUINTAL reference of 2480 for it — a feed
// modal of 2600 is an unmistakable +4.8%.
const WHEAT = [{
  state: 'Madhya Pradesh', district: 'Sehore', market: 'Sehore APMC',
  commodity: 'Wheat', variety: 'Sharbati', grade: 'FAQ', arrival_date: '05/08/2026',
  min_price: 2500, max_price: 2700, modal_price: 2600,
}];

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('feed failure after a good fetch', () => {
  it('reuses the last real records instead of dropping to reference', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T06:00:00Z'));

    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse(WHEAT)));
    const first = await getRateForCrop('Wheat');
    expect(first?.source).toBe('national');
    expect(first?.modal).toBe(2600);

    // Next day the daily cache resets and the feed is rate-limited. The rate
    // must still read live — this is the flicker the storefront reported.
    vi.setSystemTime(new Date('2026-08-06T06:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as unknown as Response)));

    const second = await getRateForCrop('Wheat');
    expect(second?.source).toBe('national');
    expect(second?.modal).toBe(2600);
    expect(second?.changePct).toBe(first?.changePct);
  });

  it('ages the reused records out once the crop has been silent for days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T06:00:00Z'));

    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse(WHEAT)));
    expect((await getRateForCrop('Wheat'))?.source).toBe('national');

    // Four days on, still nothing from the feed: a stale number stops being a
    // fair anchor, so the board says "reference" out loud.
    vi.setSystemTime(new Date('2026-08-09T06:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as unknown as Response)));

    const aged = await getRateForCrop('Wheat');
    expect(aged?.source).toBe('reference');
    expect(aged?.changePct).toBe(0);
  });
});

describe('a page walk that breaks halfway', () => {
  it('serves the partial page but does not let it become the snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T06:00:00Z'));

    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse(WHEAT)));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(2600);

    // Next day: a full first page (so the walk continues) and then a failure.
    // 200 mandis is a slice of the country, not the country — worth serving
    // today, not worth quoting for the rest of the week.
    vi.setSystemTime(new Date('2026-08-06T06:00:00Z'));
    const slice = Array.from({ length: 200 }, () => ({ ...WHEAT[0], modal_price: 3000 }));
    let page = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      page += 1;
      if (page === 1) return recordsResponse(slice);
      throw new Error('data.gov.in 503');
    }));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(3000);

    // Day after, feed fully down: the reused number must be the complete
    // sweep from the 5th, not the biased slice from the 6th.
    vi.setSystemTime(new Date('2026-08-07T06:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as unknown as Response)));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(2600);
  });
});

describe('a page walk that hits the page cap', () => {
  it('does not let a truncated prefix become the snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T06:00:00Z'));

    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse(WHEAT)));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(2600);

    // Next day every page comes back FULL, so the walk runs out of page budget
    // instead of ever seeing the short page that proves the result set ended.
    // That looks identical to success from inside the loop and means the
    // opposite: 5,000 records is a prefix of the country, not the country.
    vi.setSystemTime(new Date('2026-08-06T06:00:00Z'));
    const fullPage = Array.from({ length: 200 }, () => ({ ...WHEAT[0], modal_price: 3000 }));
    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse(fullPage)));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(3000);

    // Day after, feed fully down. The reused number must be the complete sweep
    // from the 5th — not the capped prefix from the 6th.
    vi.setSystemTime(new Date('2026-08-07T06:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as unknown as Response)));
    expect((await getRateForCrop('Wheat'))?.modal).toBe(2600);
  });
});

describe('a crop the feed never answered for', () => {
  it('falls back to the reference price rather than returning null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => recordsResponse([])));

    const rate = await getRateForCrop('Cocoa');
    expect(rate?.source).toBe('reference');
    expect(rate?.modal).toBe(14800);
  });
});
