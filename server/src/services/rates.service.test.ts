// =============================================================================
// rates.service tests: what the numbers on /rates and the board are made of
// =============================================================================
// Every case here is something the live board got wrong on 2026-09-21 while
// it asked data.gov.in one crop at a time: spring onion averaged into onion,
// paddy missing a state that spells it differently, "Kerala" finding nothing,
// a ₹0 low end from one mandi's typo, and 230 commodities the feed reported
// that no page showed. The feed itself (paging, completeness, retries) is
// covered in mandiFeed.test.ts.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config', () => ({
  config: { dataGov: { apiKey: 'test-key', resourceId: 'test-resource', usingDemoKey: false } },
}));

// The usual-price table, faked: what each test puts in `usualRows` is what the
// service reads at start-up, and `queryRaw` records each write and returns
// what the test says the database would. usualPrices.test.ts covers the real
// table and its arithmetic.
type UsualRow = { commodity: string; state: string; perQuintal: number; days: number; pendingPerQuintal: number };
const db = vi.hoisted(() => ({
  usualRows: [] as Array<{ commodity: string; state: string; perQuintal: number; days: number; pendingPerQuintal: number }>,
  queryRaw: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
}));
vi.mock('../lib/prisma', () => ({
  prisma: {
    usualPrice: { findMany: async () => db.usualRows },
    $queryRaw: (...args: unknown[]) => db.queryRaw(...args),
  },
}));

// No saved copy of the feed: each test starts cold, from its own download.
// mandiFeedStore.test.ts covers the real table.
vi.mock('./mandiFeedStore', () => ({
  loadMandiCopy: async () => null,
  saveMandiCopy: async () => true,
}));

import { fakeFeed, rec } from './mandiFeed.fake';
import { commodityFor } from './mandiCommodities';

type Rates = typeof import('./rates.service');
let rates: Rates;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  // A fresh module per test, so each one downloads its own feed.
  db.usualRows = [];
  db.queryRaw.mockReset();
  db.queryRaw.mockImplementation(async () => []);
  vi.resetModules();
  rates = await import('./rates.service');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('matching names exactly', () => {
  it('does not average spring onion into onion', async () => {
    vi.stubGlobal('fetch', fakeFeed([
      rec('Onion', 'Maharashtra', 2000), rec('Onion', 'Punjab', 2000), rec('Onion', 'Gujarat', 2000),
      rec('Onion Green', 'Maharashtra', 8500), rec('Onion Green', 'Punjab', 8500),
    ]));

    expect((await rates.getRateForCrop('Onion'))?.modal).toBe(20);
    expect((await rates.getMarketBreakdown('Onion'))?.count).toBe(3);
  });

  it('counts a crop the feed files under two names once, under either', async () => {
    // Most states report paddy as "Paddy(Common)"; the board's id is the
    // older "Paddy(Dhan)(Common)". Basmati is a different price and stays out.
    vi.stubGlobal('fetch', fakeFeed([
      rec('Paddy(Common)', 'Maharashtra', 2400),
      rec('Paddy(Dhan)(Common)', 'Punjab', 2400),
      rec('Paddy(Basmati)', 'Punjab', 3900),
    ]));

    const paddy = await rates.getRateForCrop('Paddy(Dhan)(Common)', { state: 'Maharashtra' });
    expect(paddy?.source).toBe('state');
    expect(paddy?.modal).toBe(2400);
    expect((await rates.getMarketBreakdown('Paddy(Common)'))?.count).toBe(2);
  });

  it('finds Kerala under the feed\'s "Keralam", and a Pradesh is only itself', async () => {
    vi.stubGlobal('fetch', fakeFeed([
      rec('Wheat', 'Keralam', 3000),
      rec('Wheat', 'Andhra Pradesh', 2500),
      rec('Wheat', 'Madhya Pradesh', 2400),
    ]));

    const kerala = await rates.getRateForCrop('Wheat', { state: 'Kerala' });
    expect(kerala?.source).toBe('state');
    expect(kerala?.modal).toBe(3000);
    const ap = await rates.getMarketBreakdown('Wheat', 'Andhra Pradesh');
    expect(ap?.records.map((r) => r.state)).toEqual(['Andhra Pradesh']);
  });
});

describe('the price band', () => {
  it('leaves a typo out of every figure, and says it did', async () => {
    // Patti APMC reported onion at ₹0.07 a quintal on 2026-09-21. Taken at
    // face value it made the card read "₹0 – ₹120".
    vi.stubGlobal('fetch', fakeFeed([
      ...[2000, 2200, 2400, 2600, 2800, 3000].map((m, i) => rec('Onion', 'Maharashtra', m, { market: `M${i}` })),
      rec('Onion', 'Punjab', 0.07, { market: 'Patti APMC', min_price: 0.07, max_price: 0.07 }),
    ]));

    const onion = await rates.getRateForCrop('Onion');
    expect(onion?.min).toBeGreaterThan(15);
    const breakdown = await rates.getMarketBreakdown('Onion');
    expect(breakdown?.count).toBe(6);
    expect(breakdown?.excluded).toBe(1);
  });

  it('is where most mandis sat, not the single lowest and highest report', async () => {
    const modals = Array.from({ length: 11 }, (_, i) => 2000 + i * 100); // 2000..3000
    vi.stubGlobal('fetch', fakeFeed([
      ...modals.map((m, i) => rec('Wheat', 'Punjab', m, { market: `M${i}` })),
      // One mandi's own low is a fifth of everyone's modal: real, but not the band.
      rec('Wheat', 'Punjab', 2500, { market: 'Outlier', min_price: 400, max_price: 9000 }),
    ]));

    const wheat = await rates.getRateForCrop('Wheat');
    expect(wheat?.min).toBeGreaterThanOrEqual(2100);
    expect(wheat?.max).toBeLessThanOrEqual(2900);
    expect(wheat!.min).toBeLessThanOrEqual(wheat!.modal);
    expect(wheat!.max).toBeGreaterThanOrEqual(wheat!.modal);
  });
});

describe('a crop the feed never answered for', () => {
  it('falls back to the reference price rather than returning null', async () => {
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));

    const rate = await rates.getRateForCrop('Cocoa');
    expect(rate?.source).toBe('reference');
    expect(rate?.modal).toBe(14800);
  });
});

describe('getAllRates, the whole /rates page', () => {
  it('lists every food commodity, leaves out livestock and flowers, and keeps the board\'s 30', async () => {
    vi.stubGlobal('fetch', fakeFeed([
      rec('Tomato', 'Maharashtra', 2500),
      rec('Bitter gourd', 'Maharashtra', 3500),
      rec('Ox', 'Rajasthan', 45000),
      rec('Marigold(Calcutta)', 'Delhi', 6000),
      rec('Dragon Fruit', 'Gujarat', 12000),
    ]));

    const all = await rates.getAllRates();
    const ids = all.rates.map((r) => r.commodity);
    expect(ids).toContain('Bitter gourd');
    expect(all.rates.find((r) => r.commodity === 'Bitter gourd')?.group).toBe('vegetables');
    expect(ids).not.toContain('Ox');
    expect(ids).not.toContain('Marigold(Calcutta)');
    // A name the table has never seen is shown, not dropped.
    expect(all.rates.find((r) => r.commodity === 'Dragon Fruit')?.group).toBe('other');
    // All 30 board crops, reported or not; unreported ones say so.
    const board = (await rates.getBoard()).rates.map((r) => r.commodity);
    expect(board.every((id) => ids.includes(id))).toBe(true);
    expect(all.rates.find((r) => r.commodity === 'Milk')?.source).toBe('reference');
    expect(all.rates.find((r) => r.commodity === 'Bitter gourd')?.usual).toBeNull();
  });

  it('for a state, lists what that state reported, plus the board through its fallback', async () => {
    vi.stubGlobal('fetch', fakeFeed([
      rec('Bitter gourd', 'Maharashtra', 3500),
      rec('Pumpkin', 'Punjab', 1500),
      rec('Tomato', 'Punjab', 2500),
    ]));

    const mh = await rates.getAllRates('Maharashtra');
    const ids = mh.rates.map((r) => r.commodity);
    expect(ids).toContain('Bitter gourd');
    expect(ids).not.toContain('Pumpkin');
    expect(mh.rates.find((r) => r.commodity === 'Tomato')?.source).toBe('national');
    expect(mh.states).toEqual(['Maharashtra', 'Punjab']);
  });

  it('opens the mandi table for a commodity that is not on the board', async () => {
    vi.stubGlobal('fetch', fakeFeed([rec('Bitter gourd', 'Maharashtra', 3500)]));

    const b = await rates.getMarketBreakdown('Bitter gourd');
    expect(b?.count).toBe(1);
    expect(b?.unit).toBe('KG');
    expect(b?.records[0].modal).toBe(35);
  });
});

describe('the board', () => {
  it('names every crop by its id in the commodity table, so the aliases apply', async () => {
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 2000)]));

    const board = await rates.getBoard();
    expect(board.rates).toHaveLength(30);
    for (const r of board.rates) expect(commodityFor(r.commodity)?.id).toBe(r.commodity);
  });
});

describe('vs usual', () => {
  // State "" is the all-India row.
  const onFile = (commodity: string, state: string, perQuintal: number, days: number): UsualRow =>
    ({ commodity, state, perQuintal, days, pendingPerQuintal: perQuintal });

  it('compares today with what the crop has been selling for lately, not a typed-in price', async () => {
    // The typed-in onion price is ₹18/kg; the last 12 days averaged ₹40.
    db.usualRows = [onFile('Onion', 'Maharashtra', 4000, 12)];
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 4400)]));

    const onion = await rates.getRateForCrop('Onion');
    expect(onion?.usual).toBe(40);
    expect(onion?.usualDays).toBe(12);
    expect(onion?.changePct).toBe(10);
  });

  it('makes no comparison on a crop\'s first day, rather than claiming a steady one', async () => {
    vi.stubGlobal('fetch', fakeFeed([
      rec('Onion', 'Maharashtra', 3800), rec('Onion', 'Punjab', 5000),
      rec('Bitter gourd', 'Maharashtra', 3000),
    ]));

    const onion = await rates.getRateForCrop('Onion');
    expect(onion?.usualDays).toBe(0);
    expect(onion?.changePct).toBe(0);
    // Maharashtra's price against today's national one is a gap between two
    // places, not a move against usual, and must not be shown as one.
    const mh = await rates.getRateForCrop('Onion', { state: 'Maharashtra' });
    expect(mh?.source).toBe('state');
    expect(mh?.changePct).toBe(0);
    const all = await rates.getAllRates();
    for (const id of ['Onion', 'Bitter gourd']) {
      const r = all.rates.find((x) => x.commodity === id);
      expect(r?.usual).toBeNull();
      expect(r?.changePct).toBeNull();
    }
  });

  it('covers every commodity, not only the 30 on the board', async () => {
    db.usualRows = [onFile('Bitter gourd', 'Maharashtra', 3000, 5)];
    vi.stubGlobal('fetch', fakeFeed([rec('Bitter gourd', 'Maharashtra', 3300)]));

    const karela = (await rates.getAllRates()).rates.find((r) => r.commodity === 'Bitter gourd');
    expect(karela?.usual).toBe(30);
    expect(karela?.usualDays).toBe(5);
    expect(karela?.changePct).toBe(10);
  });

  it('falls back to the crop\'s own recent average when the feed has nothing for it', async () => {
    db.usualRows = [onFile('Onion', '', 4000, 12)];
    vi.stubGlobal('fetch', fakeFeed([rec('Tomato', 'Maharashtra', 2500)]));

    const onion = await rates.getRateForCrop('Onion');
    expect(onion?.source).toBe('reference');
    expect(onion?.modal).toBe(40); // not the typed-in ₹18
  });

  it('hands every download to the averages, state by state, and takes the result back', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 4700, { arrival_date: '21/09/2026' })]));
    await rates.getBoard();
    await vi.waitFor(() => expect(db.queryRaw).toHaveBeenCalledTimes(1));
    // [template, day, commodities, states, prices, span]
    const [, day21, ids, states, prices] = db.queryRaw.mock.calls[0] as [unknown, string, string[], string[], number[]];
    expect(day21).toBe('2026-09-21');
    const at = (state: string) => ids.findIndex((id, n) => id === 'Onion' && states[n] === state);
    expect(prices[at('')]).toBe(4700);
    expect(prices[at('Maharashtra')]).toBe(4700);

    // Next morning the feed carries the 22nd. The copy on hand is stale, so
    // this request starts a download; the database folds the 21st in and
    // hands back the averages, which is what the cards then use.
    db.queryRaw.mockImplementation(async () => [
      { commodity: 'Onion', state: '', perQuintal: 4700, days: 1, pendingPerQuintal: 5000 },
      { commodity: 'Onion', state: 'Maharashtra', perQuintal: 4700, days: 1, pendingPerQuintal: 5000 },
    ]);
    vi.setSystemTime(new Date('2026-09-22T04:00:00Z'));
    vi.stubGlobal('fetch', fakeFeed([rec('Onion', 'Maharashtra', 5000, { arrival_date: '22/09/2026' })]));
    await rates.getBoard();
    await vi.waitFor(() => expect(db.queryRaw).toHaveBeenCalledTimes(2));
    expect(db.queryRaw.mock.calls[1][1]).toBe('2026-09-22');

    await vi.waitFor(async () => expect((await rates.getRateForCrop('Onion'))?.usualDays).toBe(1));
    expect((await rates.getRateForCrop('Onion'))?.changePct).toBeCloseTo(6.4, 1); // ₹50 against ₹47
  });

  it('compares like with like, so the states that report first cannot swing all India', async () => {
    // 2026-09-22, mid-afternoon: Tamil Nadu's farmer markets (potato ₹35) had
    // all reported and Uttar Pradesh's bulk mandis (₹5.5) a third of theirs.
    // The all-India median read ₹35 against a usual of ₹11, while neither
    // state's price had moved at all.
    db.usualRows = [
      onFile('Potato', 'Tamil Nadu', 3500, 5),
      onFile('Potato', 'Uttar Pradesh', 550, 5),
      onFile('Potato', '', 1131, 5),
    ];
    vi.stubGlobal('fetch', fakeFeed([
      ...Array.from({ length: 10 }, (_, i) => rec('Potato', 'Tamil Nadu', 3500, { market: `TN${i}` })),
      ...Array.from({ length: 2 }, (_, i) => rec('Potato', 'Uttar Pradesh', 550, { market: `UP${i}` })),
    ]));

    const potato = await rates.getRateForCrop('Potato');
    expect(potato?.modal).toBe(35);
    expect(potato?.changePct).toBe(0);
    expect(potato?.usualDays).toBe(5);
    expect(potato?.usual).toBe(35); // the usual the 0% implies, so the two agree
  });

  it('compares a state with its own past, not with all India', async () => {
    db.usualRows = [
      onFile('Onion', 'Maharashtra', 3800, 5), onFile('Onion', 'Punjab', 5000, 5),
      onFile('Bitter gourd', 'Maharashtra', 3000, 5),
    ];
    vi.stubGlobal('fetch', fakeFeed([
      rec('Onion', 'Maharashtra', 3990), rec('Onion', 'Punjab', 5000),
      rec('Bitter gourd', 'Maharashtra', 3300),
    ]));

    expect((await rates.getRateForCrop('Onion', { state: 'Maharashtra' }))?.changePct).toBe(5);
    const karela = (await rates.getAllRates('Maharashtra')).rates.find((r) => r.commodity === 'Bitter gourd');
    expect(karela?.changePct).toBe(10);
  });
});
