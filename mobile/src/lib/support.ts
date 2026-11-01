// =============================================================================
// CropBid is the point of contact between the two sides of a deal
// =============================================================================
// Buyers and sellers see each other's name and nothing else; anyone who needs
// to reach the other side calls or WhatsApps CropBid on this number, and
// CropBid does the delivery (server/src/services/contactVisibility.ts).
// The same number is in server/src/utils/contactDetails.ts and
// client/src/content/support.ts: change all three together.
// =============================================================================

import { Linking } from 'react-native';

export const CROPBID_CONTACT_PHONE = '6362953105';
export const CROPBID_CONTACT_DISPLAY = '63629 53105';

export function callCropBid(): void {
  void Linking.openURL(`tel:+91${CROPBID_CONTACT_PHONE}`).catch(() => {});
}

export function whatsAppCropBid(about?: string): void {
  const text = about ? `Hi CropBid, about ${about}: ` : 'Hi CropBid, I have a question about a deal.';
  void Linking.openURL(`https://wa.me/91${CROPBID_CONTACT_PHONE}?text=${encodeURIComponent(text)}`).catch(() => {});
}
