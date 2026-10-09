// =============================================================================
// WhatsAppButton: the round green "chat with us" button, bottom right
// =============================================================================
// Opens a WhatsApp chat with CropBid's business number, with a first line
// already typed. A plain wa.me link: WhatsApp opens the app on a phone and
// WhatsApp Web (or the desktop app) on a computer, and nothing about the chat
// passes through our servers.
//
// OFF UNTIL CONFIGURED. The number is VITE_WHATSAPP_NUMBER, a build variable
// like the Google client id: blank, and the button is not drawn, so a build
// that forgot it shows nothing rather than a link to nobody. It is public by
// design (it is printed on the button's link), so it is not a secret.
//
// Mounted outside AppContent beside CookieNotice, for the same reason: it is a
// browser-only control with nothing to say to a crawler.
// =============================================================================

import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isEmbedded } from '../../utils/embedded';

/**
 * Digits only, country code first, which is what wa.me wants. A bare ten-digit
 * Indian number gets 91 in front, because writing it without the code is the
 * likely slip and wa.me would otherwise read it as some other country.
 */
function whatsAppDigits(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

const NUMBER = whatsAppDigits(import.meta.env.VITE_WHATSAPP_NUMBER);

// Where it stays away. The cart and checkout end in a pay button at the foot of
// a phone screen, which a floating button would sit on; admin pages are ops,
// who have the number already.
function hiddenOn(pathname: string): boolean {
  return (
    pathname === '/cart' ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/admin')
  );
}

export function WhatsAppButton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // Inside the phone app the page is a document in a frame, and a chat button
  // would take the reader out of the app (utils/embedded).
  if (!NUMBER || isEmbedded() || hiddenOn(pathname)) return null;

  const text = t('Hi CropBid, I have a question.');
  const href = `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`;
  const label = t('Chat with CropBid on WhatsApp');

  return (
    <a
      className="cb-wa"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      {/* The WhatsApp glyph, drawn inline so there is no image to fetch. */}
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.53 1.74 6.5L3 29l6.68-1.75A12.95 12.95 0 0 0 16.04 29C23.2 29 29.03 23.18 29.03 16S23.2 3 16.04 3Zm0 23.8c-1.98 0-3.92-.53-5.61-1.54l-.4-.24-3.97 1.04 1.06-3.86-.26-.4A10.74 10.74 0 0 1 5.2 16c0-5.97 4.86-10.83 10.84-10.83 5.97 0 10.83 4.86 10.83 10.83 0 5.98-4.86 10.8-10.83 10.8Zm5.94-8.1c-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.17-.22.32-.84 1.05-1.03 1.27-.19.22-.38.24-.7.08-.33-.16-1.38-.51-2.62-1.62-.97-.86-1.62-1.93-1.81-2.25-.19-.33-.02-.5.14-.66.15-.15.33-.38.49-.57.16-.19.22-.33.33-.54.1-.22.05-.41-.03-.57-.08-.16-.73-1.76-1-2.41-.27-.63-.53-.55-.73-.56h-.62c-.22 0-.57.08-.87.41-.3.32-1.14 1.11-1.14 2.71 0 1.6 1.17 3.14 1.33 3.36.16.22 2.3 3.5 5.56 4.91.78.34 1.38.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.13-.3-.21-.62-.37Z"
        />
      </svg>
    </a>
  );
}
