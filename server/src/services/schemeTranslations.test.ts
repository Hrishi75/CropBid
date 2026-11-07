// =============================================================================
// Scheme translations keep up with the English
// =============================================================================
// A farmer reading /schemes in Hindi or Marathi acts on the ₹ amounts and
// percentages they read, so a translation that kept an old figure after the
// English changed is worse than no translation. These tests pin that every
// scheme has both languages, and that every number in each English field
// appears in the same field of each translation.
// =============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_LABEL, SCHEMES, searchSchemes } from './schemes.service';
import { CATEGORY_TEXT, SCHEME_TEXT } from './schemeTranslations';

const FIELDS = ['tagline', 'benefit', 'eligibility', 'apply'] as const;

/** Every number in a text, commas dropped: "₹1,400+ in 72 hours" → ["1400", "72"]. */
const numbers = (text: string) => (text.replace(/(\d),(\d)/g, '$1$2').match(/\d+(\.\d+)?/g) ?? []);

describe('scheme translations', () => {
  it('covers every scheme in Hindi and Marathi, and nothing that is not a scheme', () => {
    for (const s of SCHEMES) {
      expect(s.translations, s.slug).toBeDefined();
      for (const lang of ['hi', 'mr'] as const) {
        for (const f of FIELDS) expect(s.translations![lang][f].trim(), `${s.slug} ${lang} ${f}`).not.toBe('');
      }
      expect(s.translations!.mr.name, `${s.slug} mr name`).toBeTruthy();
    }
    expect(Object.keys(SCHEME_TEXT).sort()).toEqual(SCHEMES.map((s) => s.slug).sort());
  });

  it('keeps every number the English gives', () => {
    for (const s of SCHEMES) {
      for (const lang of ['hi', 'mr'] as const) {
        for (const f of FIELDS) {
          const translated = numbers(s.translations![lang][f]);
          for (const n of numbers(s[f])) {
            expect(translated, `${s.slug} ${lang} ${f} is missing ${n}`).toContain(n);
          }
        }
      }
    }
  });

  it('finds a scheme by its Marathi words', () => {
    expect(searchSchemes('पीक विमा').map((s) => s.slug)).toContain('pmfby');
  });

  it('finds a scheme by the Hindi or Marathi category name the page shows', () => {
    expect(Object.keys(CATEGORY_TEXT).sort()).toEqual(Object.keys(CATEGORY_LABEL).sort());
    expect(searchSchemes('आय सहायता').map((s) => s.slug)).toContain('pm-kisan');
    expect(searchSchemes('उत्पन्न सहाय्य').map((s) => s.slug)).toContain('pm-kisan');
  });

  it('names each category exactly as the website shows it', () => {
    const locales = join(__dirname, '../../../client/src/locales');
    const hi = JSON.parse(readFileSync(join(locales, 'hi.json'), 'utf8'));
    const mr = JSON.parse(readFileSync(join(locales, 'mr.json'), 'utf8'));
    for (const [id, english] of Object.entries(CATEGORY_LABEL)) {
      expect(CATEGORY_TEXT[id], id).toEqual({ hi: hi[english], mr: mr[english] });
    }
  });
});
