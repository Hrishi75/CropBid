// =============================================================================
// scriptLanguage tests
// =============================================================================
// Pure functions, so these are cheap and worth being thorough about — a wrong
// answer here means a description gets translated FROM the wrong language,
// which produces confident nonsense rather than an obvious failure.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { detectScript, detectSourceLanguage } from './scriptLanguage';

describe('detectScript', () => {
  it('detects plain English', () => {
    expect(detectScript('Fresh onions from Nashik, A grade')).toBe('latin');
  });

  it('detects plain Hindi/Marathi', () => {
    expect(detectScript('नाशिक से ताज़ा प्याज़')).toBe('devanagari');
  });

  it('keeps Devanagari when Latin loanwords are mixed in', () => {
    // The realistic farmer input: Devanagari prose with English units.
    expect(detectScript('50 quintal प्याज़, A ग्रेड, नाशिक से ताज़ा माल')).toBe('devanagari');
  });

  it('keeps Latin when a single Devanagari word is mixed in', () => {
    expect(detectScript('Fresh kanda from Nashik, top quality produce प्याज़')).toBe('latin');
  });

  it('returns other for text with no letters', () => {
    expect(detectScript('50 / 2000 — 100%')).toBe('other');
    expect(detectScript('   ')).toBe('other');
    expect(detectScript('')).toBe('other');
  });

  it('returns other for scripts we do not handle', () => {
    // Tamil. Sarvam supports it, but the UI does not, so there is nothing to
    // translate into and no reason to spend a call finding that out.
    expect(detectScript('புதிய வெங்காயம்')).toBe('other');
  });
});

describe('detectSourceLanguage', () => {
  it('maps Latin script to EN regardless of the author preference', () => {
    // A Marathi speaker writing in English wrote English. The text decides.
    expect(detectSourceLanguage('Fresh onions', 'MR')).toBe('EN');
    expect(detectSourceLanguage('Fresh onions', 'HI')).toBe('EN');
    expect(detectSourceLanguage('Fresh onions', null)).toBe('EN');
  });

  it('breaks the Devanagari tie with the author preference', () => {
    expect(detectSourceLanguage('ताज़ा प्याज़', 'MR')).toBe('MR');
    expect(detectSourceLanguage('ताज़ा प्याज़', 'HI')).toBe('HI');
  });

  it('defaults Devanagari to Hindi when the author preference is unset', () => {
    expect(detectSourceLanguage('ताज़ा प्याज़', null)).toBe('HI');
    expect(detectSourceLanguage('ताज़ा प्याज़', undefined)).toBe('HI');
    expect(detectSourceLanguage('ताज़ा प्याज़', 'EN')).toBe('HI');
  });

  it('returns null when there is nothing to translate', () => {
    expect(detectSourceLanguage('', 'HI')).toBeNull();
    // Digits and punctuation only — no prose, so nothing worth a paid call.
    expect(detectSourceLanguage('2000 / 50 — 100%', 'HI')).toBeNull();
    expect(detectSourceLanguage('புதிய வெங்காயம்', 'HI')).toBeNull();
  });
});
