// =============================================================================
// i18n — English / Hindi / Marathi (mirrors client/src/i18n.ts)
// =============================================================================
// Keys are the literal English strings (natural-language keys), so components
// write t('Log in') and untranslated strings simply render as English — no
// en.json needed, and coverage can grow one key at a time in hi.json/mr.json.
// The choice persists in SecureStore and is offered via the language chips in
// the Profile tab and the storefront header pill (components/LanguagePicker).
// =============================================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import hi from './locales/hi.json';
import mr from './locales/mr.json';

const STORAGE_KEY = 'cropbid.lang';

i18n.use(initReactI18next).init({
  resources: {
    hi: { translation: hi },
    mr: { translation: mr },
  },
  lng: 'en',
  fallbackLng: 'en',
  // Keys are full English phrases — disable '.'/':' separators so phrases with
  // punctuation aren't treated as nested paths or namespaces.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React already escapes
});

// SecureStore is async, so the app boots in English and the saved choice lands
// a beat later — react-i18next re-renders everything when it does.
SecureStore.getItemAsync(STORAGE_KEY)
  .then((lang) => {
    if (lang === 'hi' || lang === 'mr') i18n.changeLanguage(lang);
  })
  .catch(() => {
    // storage unavailable — boot language stays English
  });

i18n.on('languageChanged', (lang) => {
  SecureStore.setItemAsync(STORAGE_KEY, lang).catch(() => {
    // storage unavailable — the choice just won't persist
  });
});

export default i18n;
