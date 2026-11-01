// =============================================================================
// CropBid is the point of contact (decided 2026-11-02)
// =============================================================================
// The two sides of a deal see each other's name and nothing else: no phone, no
// email, no address, no company or firm name. Anyone who wants to reach the
// other side reaches CropBid instead, on this number, by call or WhatsApp, and
// CropBid also does the delivery.
//
// The server holds the rule in contactVisibility.ts (what is returned) and
// here (what may be typed into text the other side reads). Changing the number
// means changing it here, in client/src/content/support.ts and in
// mobile/src/lib/support.ts.
// =============================================================================

import { ApiError } from './ApiError';

export const CROPBID_CONTACT_PHONE = '6362953105';

// An Indian mobile (6-9 then nine more digits), with or without +91 / 0 and
// with spaces, dots or dashes between the digits. Prices such as "1,00,000"
// and quantities do not match: commas break the run and they rarely start 6-9
// with ten digits.
const PHONE = /(?:\+?\s*91[\s.-]*|\b0)?[6-9](?:[\s.-]*\d){9}\b/;
const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/i;
const CHAT_LINK = /\b(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp\.com\/|t\.me\/|telegram\.me\/)/i;

/** What kind of contact detail the text carries, if any. */
export function findContactDetail(text: string | null | undefined): 'phone' | 'email' | 'link' | null {
  if (!text) return null;
  if (PHONE.test(text)) return 'phone';
  if (EMAIL.test(text)) return 'email';
  if (CHAT_LINK.test(text)) return 'link';
  return null;
}

/**
 * Refuses text the other side would read if it carries a way to reach the
 * writer. A 400 that says why and where to go instead.
 */
export function assertNoContactDetails(text: string | null | undefined, field = 'Your message'): void {
  const found = findContactDetail(text);
  if (!found) return;
  const what = found === 'phone' ? 'a phone number' : found === 'email' ? 'an email address' : 'a chat link';
  throw new ApiError(
    400,
    `${field} contains ${what}. Buyers and sellers reach each other through CropBid: call or WhatsApp ${CROPBID_CONTACT_PHONE}. Please remove it.`,
    'CONTACT_DETAILS_NOT_ALLOWED',
  );
}
