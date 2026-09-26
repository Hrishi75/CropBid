// =============================================================================
// Mandi feed store: the last complete copy, kept in the database
// =============================================================================
// mandiFeed.ts holds the day in memory, and every deploy restarts the API. On
// a day data.gov.in is down, that restart threw away the only complete copy
// there was and the rates went to reference prices until the feed came back
// (2026-09-26, the day this was written). So each complete copy is also saved
// here, and a restart serves it while a fresh one downloads.
//
// One row, rewritten in place: a full day is about 17,000 rows, some 300 KB
// gzipped, written at most every two hours.
// =============================================================================

import { gunzipSync, gzipSync } from 'zlib';
import { prisma } from '../lib/prisma';
import type { MandiRow, MandiSnapshot } from './mandiFeed';

const KEY = 'day';

/**
 * Saves a complete copy, unless the one already stored is as new or newer.
 * During a deploy the old and new processes both download, and the older
 * download landing second must not overwrite the newer one. The condition is
 * in the write itself, so there is no read-then-write gap for it to fall into.
 * Returns whether the copy was written.
 */
export async function saveMandiCopy(snap: MandiSnapshot, key = KEY): Promise<boolean> {
  const rows = gzipSync(Buffer.from(JSON.stringify(snap.rows)));
  const fetchedAt = new Date(snap.fetchedAt);
  const written = await prisma.$executeRaw`
    INSERT INTO "MandiFeedCopy" ("key", "fetchedAt", "rowCount", "rows", "updatedAt")
    VALUES (${key}, ${fetchedAt}, ${snap.rows.length}, ${rows}, now())
    ON CONFLICT ("key") DO UPDATE SET
      "fetchedAt" = EXCLUDED."fetchedAt",
      "rowCount"  = EXCLUDED."rowCount",
      "rows"      = EXCLUDED."rows",
      "updatedAt" = now()
    WHERE "MandiFeedCopy"."fetchedAt" < EXCLUDED."fetchedAt"`;
  return written > 0;
}

/** The stored copy, or null when there is none or it does not read back whole. */
export async function loadMandiCopy(key = KEY): Promise<MandiSnapshot | null> {
  const stored = await prisma.mandiFeedCopy.findUnique({ where: { key } });
  if (!stored) return null;
  const rows = JSON.parse(gunzipSync(stored.rows).toString('utf8')) as MandiRow[];
  if (!Array.isArray(rows) || rows.length !== stored.rowCount) return null;
  return { rows, fetchedAt: stored.fetchedAt.getTime() };
}
