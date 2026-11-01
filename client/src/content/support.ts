// =============================================================================
// CropBid is the point of contact between the two sides of a deal
// =============================================================================
// Buyers and sellers see each other's name and nothing else; anyone who needs
// to reach the other side calls or WhatsApps CropBid on this number, and
// CropBid does the delivery (server/src/services/contactVisibility.ts).
// The same number is in server/src/utils/contactDetails.ts and
// mobile/src/lib/support.ts: change all three together.
// =============================================================================

export const CROPBID_CONTACT_PHONE = '6362953105';
export const CROPBID_CONTACT_DISPLAY = '63629 53105';
export const CROPBID_TEL_HREF = `tel:+91${CROPBID_CONTACT_PHONE}`;

/** A WhatsApp chat with CropBid, with an opening line typed in. */
export function cropbidWhatsAppHref(text = 'Hi CropBid, I have a question about a deal.'): string {
  return `https://wa.me/91${CROPBID_CONTACT_PHONE}?text=${encodeURIComponent(text)}`;
}
