// =============================================================================
// WhatsAppButton: the round green "chat with us" button on the storefront
// =============================================================================
// The app's version of the website's floating button (client/src/components/
// ui/WhatsAppButton.tsx). It lives on the storefront home, the screen every
// signed-out visitor and every shopper lands on, and not on every screen: the
// app's bottom edge already carries the floating tab bar, the basket bar and
// the pay buttons, and a button over all of them would sit on something. Every
// stack reaches the same chat from Help.
//
// Absolutely positioned inside the screen that renders it, like CartBar, and
// lifted above that bar while the basket has something in it.
// =============================================================================

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Alert } from '../lib/alert';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER, openWhatsApp, whatsAppDisplay } from '../lib/whatsapp';

// The WhatsApp glyph, the same path the website draws.
const GLYPH =
  'M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.53 1.74 6.5L3 29l6.68-1.75A12.95 12.95 0 0 0 16.04 29C23.2 29 29.03 23.18 29.03 16S23.2 3 16.04 3Zm0 23.8c-1.98 0-3.92-.53-5.61-1.54l-.4-.24-3.97 1.04 1.06-3.86-.26-.4A10.74 10.74 0 0 1 5.2 16c0-5.97 4.86-10.83 10.84-10.83 5.97 0 10.83 4.86 10.83 10.83 0 5.98-4.86 10.8-10.83 10.8Zm5.94-8.1c-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.17-.22.32-.84 1.05-1.03 1.27-.19.22-.38.24-.7.08-.33-.16-1.38-.51-2.62-1.62-.97-.86-1.62-1.93-1.81-2.25-.19-.33-.02-.5.14-.66.15-.15.33-.38.49-.57.16-.19.22-.33.33-.54.1-.22.05-.41-.03-.57-.08-.16-.73-1.76-1-2.41-.27-.63-.53-.55-.73-.56h-.62c-.22 0-.57.08-.87.41-.3.32-1.14 1.11-1.14 2.71 0 1.6 1.17 3.14 1.33 3.36.16.22 2.3 3.5 5.56 4.91.78.34 1.38.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.13-.3-.21-.62-.37Z';

export function WhatsAppGlyph({ size = 28, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path fill={color} d={GLYPH} />
    </Svg>
  );
}

/** Open the chat, or say the number out loud when nothing on the device can. */
export function useOpenWhatsApp() {
  const { t } = useTranslation();
  return async () => {
    const opened = await openWhatsApp(t('Hi CropBid, I have a question.'));
    if (!opened) Alert.alert(t('Chat on WhatsApp'), whatsAppDisplay() ?? '');
  };
}

export function WhatsAppButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { items } = useCart();
  const open = useOpenWhatsApp();

  if (!WHATSAPP_NUMBER) return null;

  // CartBar's own rule for when it is on screen, so the two never overlap.
  const cartShown = user?.role === 'CONSUMER' && items.length > 0;

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.fab,
        { bottom: cartShown ? 84 : 16, transform: [{ scale: pressed ? 0.92 : 1 }] },
      ]}
      accessibilityRole="link"
      accessibilityLabel={t('Chat with CropBid on WhatsApp')}
      hitSlop={6}
    >
      <WhatsAppGlyph />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    // WhatsApp's own green: the glyph is only recognised in it.
    backgroundColor: '#25D366',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
