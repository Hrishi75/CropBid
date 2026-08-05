// Stored translations — picking the right description for the reader.
//
// The server translates listing and requirement descriptions once, when they
// are written, into descriptionEn / descriptionHi / descriptionMr (see
// server/src/services/translation.service.ts). This picks whichever matches
// the UI language and falls back to the original when it is missing.
//
// A null column is NORMAL, not an error: the translation API may be switched
// off, over quota, or the text may have been too long to translate safely.
// Falling back to the original is always correct — it is what the seller
// actually wrote.
//
// ⚠️ Pass i18n.language in from `useTranslation()`, never read it at module
// level. Only the hook subscribes to languageChanged, so a module-level read
// would leave descriptions stuck in whatever language the page first loaded.

export interface HasStoredTranslations {
  description: string | null;
  descriptionEn?: string | null;
  descriptionHi?: string | null;
  descriptionMr?: string | null;
}

export interface LocalizedText {
  text: string | null;
  /** True when `text` is a machine translation rather than the original. */
  isTranslated: boolean;
}

/**
 * The description to show, plus whether it is a translation.
 *
 * Callers surface `isTranslated` in the UI — buyers quote prices against these
 * descriptions, so they should know when they are reading a machine's words
 * rather than the seller's.
 */
export function localizedDescription(
  row: HasStoredTranslations,
  language: string,
): LocalizedText {
  const original = row.description;

  // 'hi-IN' and 'hi' both mean Hindi; i18next hands back either depending on
  // how the language was set.
  const lang = (language || 'en').slice(0, 2).toLowerCase();

  const translated =
    lang === 'hi' ? row.descriptionHi : lang === 'mr' ? row.descriptionMr : row.descriptionEn;

  if (translated && translated !== original) {
    return { text: translated, isTranslated: true };
  }
  return { text: original, isTranslated: false };
}
