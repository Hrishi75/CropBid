// =============================================================================
// usualPrices tests, against a real Postgres
// =============================================================================
// The running average only means anything if it survives restarts, counts
// each day once, and never restarts itself from a single day. Those are
// properties of what reaches the table, so these tests write to it and read
// it back rather than mocking Prisma. Each test loads a fresh copy of the
// module, which is what a restart is.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../lib/prisma';

type Usual = typeof import('./usualPrices');

const A = '__test usual A';
const B = '__test usual B';

async function fresh(): Promise<Usual> {
  vi.resetModules();
  return import('./usualPrices');
}

const row = (commodity: string, state = '') =>
  prisma.usualPrice.findUnique({ where: { commodity_state: { commodity, state } } });
// All-India prices for one day, keyed the way the service keys them.
const india = (u: Usual, entries: Array<[string, number]>) =>
  new Map(entries.map(([commodity, price]) => [u.usualKey(commodity, ''), price]));

beforeEach(async () => {
  await prisma.usualPrice.deleteMany({ where: { commodity: { startsWith: '__test' } } });
});

afterAll(async () => {
  await prisma.usualPrice.deleteMany({ where: { commodity: { startsWith: '__test' } } });
  await prisma.$disconnect();
});

describe('starting from today', () => {
  it('has no history on the first day, so offers today\'s price marked as no comparison', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', india(u, [[A, 4750]]));

    expect(u.usualFor(A, '')).toEqual({ perQuintal: 4750, days: 0 });
    expect(await row(A)).toBeNull(); // nothing is written until the day is over
  });
});

describe('folding a day in', () => {
  it('counts a day\'s last price once the feed has moved on, and writes it', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', india(u, [[A, 4000]])); // morning: few mandis in
    await u.observeDay('2026-09-22', india(u, [[A, 4700]])); // evening: the day's real price
    await u.observeDay('2026-09-23', india(u, [[A, 9999]]));

    expect(u.usualFor(A, '')).toEqual({ perQuintal: 4700, days: 1 });
    const saved = await row(A);
    expect(saved?.perQuintal).toBe(4700);
    expect(saved?.days).toBe(1);
    expect(saved?.lastDay.toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('averages the days so far, then gives each new day a thirtieth', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', india(u, [[A, 100]]));
    await u.observeDay('2026-09-23', india(u, [[A, 200]]));
    await u.observeDay('2026-09-24', india(u, [[A, 0]]));
    expect(u.usualFor(A, '')?.perQuintal).toBe(150); // the mean of 100 and 200

    // A full month in, one more day moves it by a thirtieth of the gap.
    await prisma.usualPrice.update({ where: { commodity_state: { commodity: A, state: '' } }, data: { perQuintal: 100, days: 30 } });
    const later = await fresh();
    await later.loadUsualPrices();
    await later.observeDay('2026-09-25', india(later, [[A, 400]]));
    await later.observeDay('2026-09-26', india(later, [[A, 0]]));
    expect(later.usualFor(A, '')?.perQuintal).toBeCloseTo(110);
    expect((await row(A))?.days).toBe(31);
  });

  it('leaves a crop that did not report alone, keeping its average for when it returns', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', india(u, [[A, 100], [B, 500]]));
    await u.observeDay('2026-09-23', india(u, [[A, 200]])); // B out of season
    await u.observeDay('2026-09-24', india(u, [[A, 300]]));

    expect(u.usualFor(B, '')).toEqual({ perQuintal: 500, days: 1 });
    expect((await row(B))?.lastDay.toISOString().slice(0, 10)).toBe('2026-09-22');
  });
});

describe('state by state', () => {
  it('keeps a separate average for each state, beside the all-India one', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', new Map([
      [u.usualKey(A, ''), 1100], [u.usualKey(A, 'Tamil Nadu'), 3500], [u.usualKey(A, 'Uttar Pradesh'), 550],
    ]));
    await u.observeDay('2026-09-23', new Map());

    expect(u.usualFor(A, 'Tamil Nadu')).toEqual({ perQuintal: 3500, days: 1 });
    expect(u.usualFor(A, 'Uttar Pradesh')).toEqual({ perQuintal: 550, days: 1 });
    expect(u.usualFor(A, '')).toEqual({ perQuintal: 1100, days: 1 });
    expect((await row(A, 'Tamil Nadu'))?.perQuintal).toBe(3500);
    expect(await prisma.usualPrice.count({ where: { commodity: A } })).toBe(3);
  });
});

describe('restarts and overlaps', () => {
  it('reads its history back after a restart', async () => {
    const u = await fresh();
    await u.loadUsualPrices();
    await u.observeDay('2026-09-22', india(u, [[A, 4700]]));
    await u.observeDay('2026-09-23', india(u, [[A, 4800]]));

    const restarted = await fresh();
    await restarted.loadUsualPrices();
    expect(restarted.usualFor(A, '')).toEqual({ perQuintal: 4700, days: 1 });
  });

  it('counts a day once even when two processes both fold it', async () => {
    // A deploy briefly runs the old and the new API side by side, and each
    // may have seen a different last refresh of the same day. Whichever
    // writes first stands; the second must not write that day over it.
    const first = await fresh();
    await first.loadUsualPrices();
    const second = await fresh();
    await second.loadUsualPrices();

    await first.observeDay('2026-09-22', india(first, [[A, 100]]));
    await second.observeDay('2026-09-22', india(second, [[A, 150]]));
    await first.observeDay('2026-09-23', india(first, [[A, 0]]));
    await second.observeDay('2026-09-23', india(second, [[A, 0]]));

    const saved = await row(A);
    expect(saved?.days).toBe(1);
    expect(saved?.perQuintal).toBe(100);
  });

  it('never folds into a table it could not read, which would restart every average', async () => {
    // Knowing nothing of the 20 days on file, a fold would write this crop
    // back as a one-day average. So a failed read means no write at all.
    const executeRaw = vi.fn(async () => 0);
    vi.doMock('../lib/prisma', () => ({
      prisma: {
        usualPrice: { findMany: vi.fn(async () => { throw new Error('connection refused'); }) },
        $executeRaw: executeRaw,
      },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const u = await fresh();
      expect(await u.loadUsualPrices()).toBe(false);
      await u.observeDay('2026-09-22', india(u, [[A, 9000]]));
      await u.observeDay('2026-09-23', india(u, [[A, 9000]]));
      expect(executeRaw).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../lib/prisma');
      warn.mockRestore();
    }
  });
});
