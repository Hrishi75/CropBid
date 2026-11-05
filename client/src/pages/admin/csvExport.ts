// =============================================================================
// CSV export for the admin pages
// =============================================================================
// Every export is every row matching the page's filters, read from the same
// endpoint the page lists from, a batch at a time. An export of the page on
// screen would be fifteen rows passed off as the whole table.
//
// No export carries a phone number, an email or an address. A file leaves the
// admin panel and lives on somebody's laptop; a contact list of every account
// is exactly what should not be in one (CLAUDE.md §12).
// =============================================================================

import api from '../../lib/axios';

export type CsvValue = string | number | boolean | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  let cell = value;
  // A cell starting with any of these is run as a formula when the file is
  // opened in Excel or Sheets, and names and crop varieties are typed by users.
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(name: string, csv: string) {
  // The byte-order mark makes Excel read the file as UTF-8, so Hindi and
  // Marathi names come through.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cropbid-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const BATCH = 200;
// A stop for a list that never comes back short: 50,000 rows.
const MAX_BATCHES = 250;
const ATTEMPTS = 3;

export class ExportChangedError extends Error {
  constructor() {
    super('The list kept changing while it was exported');
  }
}

/**
 * Every row of a paged admin list, for the filters given.
 *
 * The lists are newest first and read by offset, so a row added, removed or
 * moved out of the filter between two batches shifts the rest: a row is read
 * twice or never. So every batch must report the same total as the first,
 * and the rows must come to that total with no id twice. Anything else means
 * the list moved underneath, and the read starts again; after three tries it
 * fails rather than download a file that is quietly wrong.
 */
export async function fetchEveryRow<T extends { id: string }>(
  path: string,
  filters: Record<string, string>,
  key: string,
): Promise<T[]> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rows = await readOnce<T>(path, filters, key);
    if (rows) return rows;
  }
  throw new ExportChangedError();
}

async function readOnce<T extends { id: string }>(path: string, filters: Record<string, string>, key: string) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const params = new URLSearchParams(filters);
    params.set('limit', String(BATCH));
    params.set('offset', String(i * BATCH));
    const res = await api.get(`${path}?${params}`);
    const batch: T[] = res.data[key] ?? [];
    if (total === null) total = res.data.total;
    else if (res.data.total !== total) return null;
    for (const row of batch) {
      if (seen.has(row.id)) return null;
      seen.add(row.id);
      rows.push(row);
    }
    if (batch.length < BATCH) return rows.length === total ? rows : null;
  }
  throw new Error('Too many rows to export');
}

/** A date as YYYY-MM-DD, which every spreadsheet sorts correctly. */
export const day = (iso: string) => iso.slice(0, 10);
