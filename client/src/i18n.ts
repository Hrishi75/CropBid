// =============================================================================
// i18n — English / Hindi / Marathi
// =============================================================================
// Keys are the literal English strings (natural-language keys), so components
// write t('Sign in') and untranslated strings simply render as English — no
// en.json needed, and coverage can grow one key at a time in hi.json/mr.json.
// The choice persists in localStorage and is offered via the language dropdown
// in the navbar (components/ui/LanguageSwitcher).
// =============================================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import hi from './locales/hi.json';
import mr from './locales/mr.json';

const STORAGE_KEY = 'cropbid.lang';

function storedLanguage(): string {
  try {
    const lang = localStorage.getItem(STORAGE_KEY);
    return lang === 'hi' || lang === 'mr' ? lang : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: {
    hi: { translation: hi },
    mr: { translation: mr },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  // Keys are full English phrases — disable '.'/':' separators so phrases with
  // punctuation aren't treated as nested paths or namespaces.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React already escapes
});

i18n.on('languageChanged', (lang) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable — the choice just won't persist
  }
});

export default i18n;
