// =============================================================================
// getForecastBoard covers every commodity /rates shows, not the 30-crop board
// =============================================================================
// The forecast used to read getBoard(), so /forecast stopped at 30 crops while
// /rates listed about 220. It now reads getAllRates(); these pin that it
// forecasts every row it is handed, and that a thin crop cannot outrank a
// well-reported one in the list the storefront strip takes its ten from.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommodityRate } from './rates.service';

const rates: CommodityRate[] = [];

vi.mock('./rates.service', () => ({
  getAllRates: vi.fn(async () => ({ date: '26/09/2026', live: true, states: [], groups: [], rates })),
  getMarketBreakdown: vi.fn(async (commodity: string) => {
    const r = rates.find((x) => x.commodity === commodity);
    return r ? { commodity, label: r.label, emoji: r.emoji, unit: r.unit, count: r.mandis, records: [], excluded: 0 } : null;
  }),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    listing: { groupBy: vi.fn(async () => []) },
    bid: { findMany: vi.fn(async () => []) },
  },
}));

const { getForecastBoard } = await import('./prediction.service');

const rate = (commodity: string, over: Partial<CommodityRate> = {}): CommodityRate => ({
  commodity, label: commodity, emoji: '🥬', group: 'vegetables', unit: 'KG',
  modal: 20, min: 18, max: 22, usual: 20, usualDays: 10, changePct: 0,
  mandis: 30, source: 'national', state: null, date: '26/09/2026',
  ...over,
});

describe('getForecastBoard', () => {
  beforeEach(() => { rates.length = 0; });

  it('forecasts every commodity on /rates, board crop or not', async () => {
    rates.push(
      rate('Tomato'),
      rate('Bitter gourd', { label: 'Bitter Gourd (Karela)' }),
      rate('Arhar (Tur/Red Gram)(Whole)', { group: 'pulses', unit: 'QUINTAL', modal: 7000 }),
      rate('Kulthi(Horse Gram)', { group: 'pulses', unit: 'QUINTAL', usual: null, usualDays: 0, changePct: null }),
    );
    const board = await getForecastBoard();
    expect(board.predictions.map((p) => p.commodity).sort()).toEqual(rates.map((r) => r.commodity).sort());
    const tur = board.predictions.find((p) => p.commodity.startsWith('Arhar'))!;
    expect(tur.group).toBe('pulses');
  });

  it('treats a crop with no history as no comparison, not as steady at usual', async () => {
    rates.push(rate('Kulthi(Horse Gram)', { usual: null, usualDays: 0, changePct: null }));
    const [p] = (await getForecastBoard()).predictions;
    expect(p.demand.drivers[0]).toMatch(/Not enough price history/);
    expect(Number.isFinite(p.outlook.pct7d)).toBe(true);
    // Thirty mandis, but nothing to compare today with: not a high-confidence read.
    expect(p.outlook.confidence).toBe('medium');
  });

  it('gives high confidence to a widely reported crop with history', async () => {
    rates.push(rate('Tomato'));
    const [p] = (await getForecastBoard()).predictions;
    expect(p.outlook.confidence).toBe('high');
  });

  it('puts a well-reported crop ahead of a thin one that moved further', async () => {
    rates.push(
      rate('Thin', { mandis: 2, changePct: -30 }),
      rate('Broad', { mandis: 40, changePct: -6 }),
    );
    const board = await getForecastBoard();
    const thin = board.predictions.find((p) => p.commodity === 'Thin')!;
    const broad = board.predictions.find((p) => p.commodity === 'Broad')!;
    expect(Math.abs(thin.outlook.pct7d)).toBeGreaterThan(Math.abs(broad.outlook.pct7d));
    expect(thin.outlook.confidence).toBe('low');
    expect(board.predictions[0].commodity).toBe('Broad');
  });
});
