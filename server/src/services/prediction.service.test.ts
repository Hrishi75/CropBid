// =============================================================================
// prediction.service tests — canonical crop-name resolution
// =============================================================================
// The platform-signal matcher must never conflate distinct crops (the old
// substring matcher let "Sweet Potato" feed the Potato forecast) and must
// resolve every known alias spelling to the same board commodity so activity
// aggregates instead of being dropped.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveCommodity } from './prediction.service';

describe('resolveCommodity', () => {
  it('resolves exact board names regardless of case and punctuation', () => {
    expect(resolveCommodity('Tomato')).toBe('Tomato');
    expect(resolveCommodity('  green CHILLI ')).toBe('Green Chilli');
    expect(resolveCommodity('Paddy(Dhan)(Common)')).toBe('Paddy(Dhan)(Common)');
    expect(resolveCommodity('Paddy (Rice)')).toBe('Paddy(Dhan)(Common)');
  });

  it('resolves alias spellings, plurals and Hindi names', () => {
    expect(resolveCommodity('Soybean')).toBe('Soyabean');
    expect(resolveCommodity('Soyabean')).toBe('Soyabean');
    expect(resolveCommodity('soya bean')).toBe('Soyabean');
    expect(resolveCommodity('Tomatoes')).toBe('Tomato');
    expect(resolveCommodity('aloo')).toBe('Potato');
    expect(resolveCommodity('Basmati Rice')).toBe('Paddy(Dhan)(Common)');
    expect(resolveCommodity('corn')).toBe('Maize');
  });

  it('never matches a distinct crop that merely contains a board name', () => {
    expect(resolveCommodity('Sweet Potato')).toBeNull();
    expect(resolveCommodity('Custard Apple')).toBeNull();
    expect(resolveCommodity('Red Chilli')).toBeNull();
    expect(resolveCommodity('Onion Seeds')).toBeNull();
  });

  it('returns null for unknown or empty names instead of guessing', () => {
    expect(resolveCommodity('Dragon Fruit')).toBeNull();
    expect(resolveCommodity('')).toBeNull();
  });
});
