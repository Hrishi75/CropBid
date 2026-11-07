// =============================================================================
// The company WhatsApp chat: one number, one way to open it
// =============================================================================
// The website's twin is client/src/components/ui/WhatsAppButton.tsx; both read
// the same number from their own build variable and build the same wa.me link.
//
// OFF UNTIL CONFIGURED. EXPO_PUBLIC_WHATSAPP_NUMBER is inlined at build time,
// like EXPO_PUBLIC_API_URL. Unset, `WHATSAPP_NUMBER` is null and every caller
// draws nothing, so a build that forgot it shows no button to nobody.
// =============================================================================

import { Linking } from 'react-native';

/**
 * Digits only, country code first, which is what wa.me wants. Leading zeros go
 * first (a trunk 0 or an international 00, which wa.me reads as neither), then
 * a bare ten-digit number gets 91, since the product is India only.
 */
function whatsAppDigits(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export const WHATSAPP_NUMBER = whatsAppDigits(process.env.EXPO_PUBLIC_WHATSAPP_NUMBER);

/** The number as a person reads it: +91 98220 55667. */
export function whatsAppDisplay(): string | null {
  if (!WHATSAPP_NUMBER) return null;
  if (WHATSAPP_NUMBER.startsWith('91') && WHATSAPP_NUMBER.length === 12) {
    return `+91 ${WHATSAPP_NUMBER.slice(2, 7)} ${WHATSAPP_NUMBER.slice(7)}`;
  }
  return `+${WHATSAPP_NUMBER}`;
}

/**
 * Open the chat with `text` already typed. A wa.me link rather than the
 * whatsapp:// scheme: it opens the app where WhatsApp is installed and the
 * web page that offers to install it where it is not, and it needs no
 * LSApplicationQueriesSchemes entry on iOS. Resolves false when nothing could
 * open it, so the caller can show the number instead.
 */
export async function openWhatsApp(text: string): Promise<boolean> {
  if (!WHATSAPP_NUMBER) return false;
  try {
    await Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`);
    return true;
  } catch {
    return false;
  }
}
