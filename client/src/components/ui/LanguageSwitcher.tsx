// =============================================================================
// LanguageSwitcher — English / हिन्दी / मराठी dropdown
// =============================================================================
// Native <select> (accessible, works on every device) styled to sit in the
// navbar. Language names are shown in their own script so a Hindi/Marathi
// speaker can find theirs even when the UI is in a language they can't read.
// =============================================================================

import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <select
      className="cb-lang-select"
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label="Language"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
