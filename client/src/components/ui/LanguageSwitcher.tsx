// =============================================================================
// LanguageSwitcher — English / हिन्दी / मराठी dropdown
// =============================================================================
// Native <select> (accessible, works on every device) styled to sit in the
// navbar. Language names are shown in their own script so a Hindi/Marathi
// speaker can find theirs even when the UI is in a language they can't read.
// =============================================================================

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user } = useAuth();

  // The switcher is the only place a signed-in user tells us what they read,
  // so it mirrors the choice onto their account as well as into localStorage.
  // The server needs it for one thing the browser can't do: Hindi and Marathi
  // share the Devanagari script, so User.language is what decides which of the
  // two a typed description gets stored as (services/translation.service.ts).
  //
  // Fire-and-forget on purpose. Switching language must never show an error
  // toast — the UI has already changed, localStorage already holds the choice,
  // and a failed sync just means the next request re-sends it.
  function changeLanguage(code: string) {
    i18n.changeLanguage(code);
    syncLanguage(code);
  }

  function syncLanguage(code: string) {
    if (!user) return;
    api.patch('/auth/me', { language: code.toUpperCase() }).catch(() => {});
  }

  // Re-sync whenever the account and the browser disagree.
  //
  // Syncing only on change loses the preference for good if that one request
  // fails, and also misses the common case of picking a language while logged
  // out and then signing in. Since User.language is the only thing that tells
  // Hindi from Marathi (both are Devanagari), a lost sync means descriptions
  // get translated from the wrong language — so it is worth converging on
  // every mount rather than trusting a single fire-and-forget call.
  useEffect(() => {
    if (!user) return;
    const current = i18n.language.slice(0, 2).toUpperCase();
    if (current !== user.language) syncLanguage(i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.language, i18n.language]);

  return (
    <select
      className="cb-lang-select"
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
      aria-label="Language"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
