import { describe, it, expect } from 'vitest';
import { COMMODITIES, EMOJI, commodityFor, emojiFor } from './mandiCommodities';

describe('commodity emoji', () => {
  // A key that is not an id matches nothing and the crop quietly shows its
  // group's icon, which is the bug this table exists to fix.
  it('keys every emoji by a real commodity id', () => {
    const ids = new Set(COMMODITIES.map((c) => c.id));
    const strays = Object.keys(EMOJI).filter((k) => !ids.has(k));
    expect(strays).toEqual([]);
  });

  it('gives a crop its own emoji and falls back to its group', () => {
    expect(emojiFor(commodityFor('Capsicum')!)).toBe('🫑');
    expect(emojiFor(commodityFor('Chilly Capsicum')!)).toBe('🫑');
    expect(emojiFor(commodityFor('Cardamom')!)).toBe('🧂');
  });
});
