// =============================================================================
// usualPrices tests, against a real Postgres
// =============================================================================
// The running average only means anything if it survives restarts, counts
// each day once, and is the same number in every process. Those are
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
  const u = await import('./usualPrices');
  await u.loadUsualPrices();
  return u;
}

const row = (commodity: string, state = '') =>
  prisma.usualPrice.findUnique({ where: { commodity_state: { commodity, state } } });
// All-India prices for one day, keyed the way the service keys them.
const india = (u: Usual, entries: Array<[string, number]>) =>
  new Map(entries.map(([commodity, price]) => [u.usualKey(commodity, ''), price]));
const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);

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
    await u.observeDay('2026-09-22', india(u, [[A, 4750]]));

    expect(u.usualFor(A, '')).toEqual({ perQuintal: 4750, days: 0 });
    const saved = await row(A);
    expect(saved?.days).toBe(0);
    expect(day(saved?.pendingDay)).toBe('2026-09-22');
  });
});

describe('folding a day in', () => {
  it('counts a day\'s last price once the feed has moved on', async () => {
    const u = await fresh();
    await u.observeDay('2026-09-22', india(u, [[A, 4000]])); // morning: few mandis in
    await u.observeDay('2026-09-22', india(u, [[A, 4700]])); // evening: the day's real price
    await u.observeDay('2026-09-23', india(u, [[A, 9999]]));

    expect(u.usualFor(A, '')).toEqual({ perQuintal: 4700, days: 1 });
    const saved = await row(A);
    expect(saved?.perQuintal).toBe(4700);
    expect(day(saved?.lastDay)).toBe('2026-09-22');
    expect(day(saved?.pendingDay)).toBe('2026-09-23');
  });

  it('averages the days so far, then gives each new day a thirtieth', async () => {
    const u = await fresh();
    await u.observeDay('2026-09-22', india(u, [[A, 100]]));
    await u.observeDay('2026-09-23', india(u, [[A, 200]]));
    await u.observeDay('2026-09-24', india(u, [[A, 300]]));
    expect(u.usualFor(A, '')?.perQuintal).toBe(150); // the mean of 100 and 200

    // A full month in, one more day moves it by a thirtieth of the gap.
    await prisma.usualPrice.update({
      where: { commodity_state: { commodity: A, state: '' } },
      data: { perQuintal: 100, days: 30, pendingPerQuintal: 400 },
    });
    await u.observeDay('2026-09-25', india(u, [[A, 1]]));
    expect(u.usualFor(A, '')?.perQuintal).toBeCloseTo(110);
    expect((await row(A))?.days).toBe(31);
  });

  it('ignores a copy older than the day it is watching', async () => {
    const u = await fresh();
    await u.observeDay('2026-09-23', india(u, [[A, 500]]));
    await u.observeDay('2026-09-22', india(u, [[A, 9000]]));

    const saved = await row(A);
    expect(saved?.pendingPerQuintal).toBe(500);
    expect(day(saved?.pendingDay)).toBe('2026-09-23');
    expect(saved?.days).toBe(0);
  });

  it('keeps a crop that stopped reporting, and counts its last day when it returns', async () => {
    const u = await fresh();
    await u.observeDay('2026-09-22', india(u, [[A, 100], [B, 500]]));
    await u.observeDay('2026-09-23', india(u, [[A, 200]])); // B out of season
    await u.observeDay('2026-09-30', india(u, [[B, 650]]));

    expect(u.usualFor(B, '')).toEqual({ perQuintal: 500, days: 1 });
    expect(day((await row(B))?.lastDay)).toBe('2026-09-22');
  });
});

describe('state by state', () => {
  it('keeps a separate average for each state, beside the all-India one', async () => {
    const u = await fresh();
    const keys: Array<[string, string, number]> = [[A, '', 1100], [A, 'Tamil Nadu', 3500], [A, 'Uttar Pradesh', 550]];
    const on = (d: string) => u.observeDay(d, new Map(keys.map(([c, s, p]) => [u.usualKey(c, s), p])));
    await on('2026-09-22');
    await on('2026-09-23');

    expect(u.usualFor(A, 'Tamil Nadu')).toEqual({ perQuintal: 3500, days: 1 });
    expect(u.usualFor(A, 'Uttar Pradesh')).toEqual({ perQuintal: 550, days: 1 });
    expect(u.usualFor(A, '')).toEqual({ perQuintal: 1100, days: 1 });
    expect(await prisma.usualPrice.count({ where: { commodity: A } })).toBe(3);
  });
});

describe('restarts and overlaps', () => {
  it('does not lose a day when the process restarts before the next date arrives', async () => {
    // The day's last refresh is on one process; the next date is first seen
    // by another, after a deploy. The day is on the row, so it still counts.
    const before = await fresh();
    await before.observeDay('2026-09-22', india(before, [[A, 4700]]));

    const after = await fresh();
    await after.observeDay('2026-09-23', india(after, [[A, 4800]]));
    expect(after.usualFor(A, '')).toEqual({ perQuintal: 4700, days: 1 });
  });

  it('gives every process the same average, and counts a day once', async () => {
    // A deploy briefly runs the old and the new API side by side, and each
    // may have seen a different last refresh of the same day.
    const first = await fresh();
    const second = await fresh();
    await first.observeDay('2026-09-22', india(first, [[A, 100]]));
    await second.observeDay('2026-09-22', india(second, [[A, 150]]));
    await first.observeDay('2026-09-23', india(first, [[A, 300]]));
    await second.observeDay('2026-09-23', india(second, [[A, 300]]));

    const saved = await row(A);
    expect(saved?.days).toBe(1);
    expect(saved?.perQuintal).toBe(150); // the day's latest price, as committed
    expect(first.usualFor(A, '')).toEqual({ perQuintal: 150, days: 1 });
    expect(second.usualFor(A, '')).toEqual({ perQuintal: 150, days: 1 });
  });

  it('cannot be corrupted by a process whose memory is out of date', async () => {
    // This process read the table while it was empty; another has since
    // written 20 days. The fold uses the row, not this process's memory.
    const u = await fresh();
    await prisma.usualPrice.create({
      data: {
        commodity: A, state: '', perQuintal: 4000, days: 20, lastDay: new Date('2026-09-20'),
        pendingDay: new Date('2026-09-21'), pendingPerQuintal: 4210,
      },
    });
    await u.observeDay('2026-09-22', india(u, [[A, 4500]]));

    const saved = await row(A);
    expect(saved?.days).toBe(21);
    expect(saved?.perQuintal).toBeCloseTo(4010);
    expect(u.usualFor(A, '')?.perQuintal).toBeCloseTo(4010);
  });
});
