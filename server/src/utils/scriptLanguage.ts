// =============================================================================
// Script detection — which language was this description written in?
// =============================================================================
// WHY THIS EXISTS:
// Sarvam's translate endpoint needs a source_language_code; it does not detect
// one for text (only the speech endpoint does). So before storing translations
// we have to work out what the farmer typed in.
//
// WHY IT'S A SCRIPT CHECK AND NOT A LANGUAGE CHECK:
// Distinguishing Hindi from Marathi properly means a language-ID model — a
// third metered API call per listing, to pick between two options. Both are
// written in Devanagari, so the script narrows it to two and User.language
// settles it for free. That is the whole trick: cheap check, then the account
// preference as the tiebreaker.
//
// Counting rather than sampling the first character, because farmers mix
// scripts constantly ("50 quintal प्याज़", "Nashik कांदा"). One stray Latin
// word must not flip a Devanagari description to English, and vice versa.
// =============================================================================

export type TextScript = 'devanagari' | 'latin' | 'other';

// Devanagari block. Covers Hindi and Marathi, plus the digits ०-९.
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

// A script has to carry at least this share of the letters to win. Set low
// because the realistic ambiguity is "mostly one script with loanwords from
// the other", not a genuine 50/50 split — and at 30% the two thresholds can
// both be met, which is why the comparison below picks the larger count
// rather than testing them independently.
const MIN_SHARE = 0.3;

/**
 * Which script dominates a piece of text.
 *
 * Returns 'other' when there are no letters at all (a price, an empty string,
 * emoji) or when neither script clears the threshold — callers treat that as
 * "don't translate this", which is the right call for text that carries no
 * prose to translate.
 */
export function detectScript(text: string): TextScript {
  if (!text) return 'other';

  let devanagari = 0;
  let latin = 0;

  for (const char of text) {
    if (DEVANAGARI.test(char)) devanagari += 1;
    else if (LATIN.test(char)) latin += 1;
  }

  const letters = devanagari + latin;
  if (letters === 0) return 'other';

  if (devanagari >= latin && devanagari / letters >= MIN_SHARE) return 'devanagari';
  if (latin > devanagari && latin / letters >= MIN_SHARE) return 'latin';
  return 'other';
}

/**
 * The language a description was most likely written in.
 *
 * `authorLanguage` is the writer's User.language. It is consulted ONLY to
 * break the Hindi/Marathi tie — a Marathi speaker writing in English still
 * gets 'EN', because what matters is the language of the text, not of the
 * person. Returns null when there is nothing worth translating.
 */
export function detectSourceLanguage(
  text: string,
  authorLanguage: 'EN' | 'HI' | 'MR' | null | undefined,
): 'EN' | 'HI' | 'MR' | null {
  const script = detectScript(text);
  if (script === 'other') return null;
  if (script === 'latin') return 'EN';
  // Devanagari: Hindi unless the account says otherwise. Hindi is the default
  // because it is the larger user base and the DB default, so an unset
  // preference lands on the more likely answer.
  return authorLanguage === 'MR' ? 'MR' : 'HI';
}
