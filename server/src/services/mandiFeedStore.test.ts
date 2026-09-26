// =============================================================================
// mandiFeedStore tests, against a real Postgres
// =============================================================================
// What matters is what a restart reads back, and that the older of two saves
// racing through a deploy cannot overwrite the newer. Both are properties of
// the table, so these write to it rather than mocking Prisma. Each test uses
// its own key, never "day", which is the copy production serves.
// =============================================================================

import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { loadMandiCopy, saveMandiCopy } from './mandiFeedStore';
import type { MandiRow } from './mandiFeed';

const row = (modal: number): MandiRow => ({
  state: 'Maharashtra', district: 'Pune', market: 'Pune', commodity: 'Onion',
  variety: 'Other', grade: 'FAQ', date: '25/09/2026', min: modal * 0.8, max: modal * 1.2, modal,
});
const day = (n: number, modal = 2000) => Array.from({ length: n }, (_, i) => row(modal + (i % 7)));

afterAll(async () => {
  await prisma.mandiFeedCopy.deleteMany({ where: { key: { startsWith: '__test' } } });
  await prisma.$disconnect();
});

describe('the saved copy', () => {
  it('reads back exactly what was saved', async () => {
    const snap = { rows: day(17_000), fetchedAt: Date.parse('2026-09-25T10:00:00.123Z') };
    expect(await saveMandiCopy(snap, '__test round trip')).toBe(true);

    expect(await loadMandiCopy('__test round trip')).toEqual(snap);
  });

  it('is null when nothing has been saved', async () => {
    expect(await loadMandiCopy('__test never saved')).toBeNull();
  });

  it('is replaced by a newer copy', async () => {
    const key = '__test newer';
    await saveMandiCopy({ rows: day(3, 2000), fetchedAt: Date.parse('2026-09-25T10:00:00Z') }, key);
    expect(await saveMandiCopy({ rows: day(5, 3000), fetchedAt: Date.parse('2026-09-25T12:00:00Z') }, key)).toBe(true);

    const back = await loadMandiCopy(key);
    expect(back?.rows).toHaveLength(5);
    expect(back?.rows[0].modal).toBe(3000);
  });

  it('is not overwritten by an older copy landing second', async () => {
    // Two processes in a deploy's overlap: the old one's download finishes
    // after the new one's, but it started earlier and is older.
    const key = '__test older';
    await saveMandiCopy({ rows: day(5, 3000), fetchedAt: Date.parse('2026-09-25T12:00:00Z') }, key);
    expect(await saveMandiCopy({ rows: day(3, 2000), fetchedAt: Date.parse('2026-09-25T10:00:00Z') }, key)).toBe(false);

    const back = await loadMandiCopy(key);
    expect(back?.rows).toHaveLength(5);
    expect(back?.fetchedAt).toBe(Date.parse('2026-09-25T12:00:00Z'));
  });

  it('is not served when it does not read back whole', async () => {
    const key = '__test damaged';
    await saveMandiCopy({ rows: day(4), fetchedAt: Date.now() }, key);
    await prisma.mandiFeedCopy.update({ where: { key }, data: { rowCount: 5 } });

    expect(await loadMandiCopy(key)).toBeNull();
  });
});
