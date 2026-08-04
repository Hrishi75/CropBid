// =============================================================================
// LanguageSwitcher — English / हिन्दी / मराठी dropdown
// =============================================================================
// Native <select> (accessible, works on every device) styled to sit in the
// navbar. Language names are shown in their own script so a Hindi/Marathi
// speaker can find theirs even when the UI is in a language they can't read.
// =============================================================================

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
    if (user) {
      api.patch('/auth/me', { language: code.toUpperCase() }).catch(() => {});
    }
  }

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
