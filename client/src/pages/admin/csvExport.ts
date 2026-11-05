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

/** Every row of a paged admin list, for the filters given. */
export async function fetchEveryRow<T>(path: string, filters: Record<string, string>, key: string): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_BATCHES; i++) {
    const params = new URLSearchParams(filters);
    params.set('limit', String(BATCH));
    params.set('offset', String(i * BATCH));
    const res = await api.get(`${path}?${params}`);
    const batch: T[] = res.data[key] ?? [];
    rows.push(...batch);
    if (batch.length < BATCH) return rows;
  }
  throw new Error('Too many rows to export');
}

/** A date as YYYY-MM-DD, which every spreadsheet sorts correctly. */
export const day = (iso: string) => iso.slice(0, 10);
