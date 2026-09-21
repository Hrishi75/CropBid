// =============================================================================
// A stand-in for data.gov.in's mandi resource, for tests only
// =============================================================================
// Behaves the way the real one was measured to on 2026-09-21: `total` in every
// reply, `limit` echoed back, no row past 10,000, and exact matching only
// through `filters[state.keyword]`.
// =============================================================================

import { vi } from 'vitest';

export interface FakeRecord {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  arrival_date: string; min_price: number; max_price: number; modal_price: number;
}

export function rec(commodity: string, state: string, modal: number, extra: Partial<FakeRecord> = {}): FakeRecord {
  return {
    state, district: 'D', market: `${state} APMC`, commodity, variety: 'Other', grade: 'FAQ',
    arrival_date: '21/09/2026', min_price: modal * 0.8, max_price: modal * 1.2, modal_price: modal, ...extra,
  };
}

export const WINDOW = 10_000;

/**
 * A stand-in for data.gov.in. `cap` is the demo key's habit of returning
 * fewer rows than asked; `fail` returns an HTTP status for the requests it
 * picks, which is how a 429 or an outage is staged.
 */
export function fakeFeed(rows: FakeRecord[], opts: { cap?: number; fail?: (u: URL) => number | undefined } = {}) {
  return vi.fn(async (input: string) => {
    const u = new URL(input);
    const status = opts.fail?.(u);
    if (status) return { ok: false, status, json: async () => ({}) } as unknown as Response;
    const state = u.searchParams.get('filters[state.keyword]');
    const limit = Math.min(Number(u.searchParams.get('limit')), opts.cap ?? WINDOW);
    const matched = state ? rows.filter((r) => r.state === state) : rows;
    return {
      ok: true, status: 200,
      json: async () => ({ total: matched.length, limit: String(limit), records: matched.slice(0, limit) }),
    } as unknown as Response;
  });
}
