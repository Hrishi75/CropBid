// =============================================================================
// PolicyScreen — the terms and the privacy policy, from the website
// =============================================================================
// A WEBVIEW ONTO cropbid.in, NOT A COPY. These are legal documents and
// CLAUDE.md §5 is explicit that every claim in them has to be true of the code
// today, which has been got wrong before. Two copies of a document held to that
// standard is two places to keep true, and the app's copy is the one nobody
// would remember to update: the web pages are edited when the product changes
// because the footer links to them, and an app build lands weeks later.
//
// So the app shows the same document the website serves, and it cannot drift by
// construction. What is lost is offline reading, which is a fair trade for a
// page somebody opens once.
//
// TWO RENDERERS, BECAUSE WEBVIEW HAS NO WEB. `react-native-webview` renders
// the string "React Native WebView does not support this platform." in a
// browser: not an error, not a blank, a sentence where the terms should be. It
// does not throw, so onError never fires and the fallback below never showed.
// The same trap as Alert.alert being a silent no-op (see lib/alert).
//
// So web renders a plain iframe and native keeps the WebView. cropbid.in sends
// no X-Frame-Options or frame-ancestors, so it frames; if that ever changes the
// iframe goes blank, which is why "Open in browser" is always on screen rather
// than only in the error state.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { colors, design, font, radius, spacing } from '../../theme';

/**
 * Where the live documents are.
 *
 * Overridable the same way `EXPO_PUBLIC_API_URL` is, and for the same reason:
 * these pages come from the web client, so a change to them cannot be seen in
 * the app until it deploys. Pointing this at a local `npm run dev -- --port
 * 5199` makes the pair testable together.
 *
 * Defaults to production, so an unset variable behaves exactly as before.
 */
const SITE = process.env.EXPO_PUBLIC_SITE_URL || 'https://cropbid.in';

/**
 * Tells the site it is being read inside the app.
 *
 * The page then drops its cookie notice and its own nav and footer
 * (client/src/utils/embedded). Without it a shopper opening the terms gets a
 * banner about browser storage they are not using and a "Marketplace" link that
 * would navigate the frame out of the app.
 *
 * A query param rather than a frame check, because a native WebView renders the
 * page as the TOP-LEVEL document: `window.self !== window.top` is false there
 * and would leave the chrome on for every phone.
 */
const EMBED = '?app=1';

export const POLICY_URL = {
  terms: `${SITE}/terms${EMBED}`,
  privacy: `${SITE}/privacy${EMBED}`,
  faq: `${SITE}/faq${EMBED}`,
} as const;

export type PolicyKind = keyof typeof POLICY_URL;

type PolicyRoute = RouteProp<{ Policy: { kind: PolicyKind } }, 'Policy'>;

export default function PolicyScreen() {
  const { kind } = useRoute<PolicyRoute>().params;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // A frame the host refuses to render never errors, it just stays empty. So
  // "still not loaded after a while" is the only signal that case gives, and
  // it is what puts the escape hatch on screen.
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading) { setStalled(false); return; }
    const t = setTimeout(() => setStalled(true), 6000);
    return () => clearTimeout(t);
  }, [loading]);

  const url = POLICY_URL[kind];

  if (failed) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.failTitle}>{t('Could not load the page')}</Text>
        <Text style={styles.failBody}>
          {t('Check your connection, or open it in your browser.')}
        </Text>
        <Pressable onPress={() => Linking.openURL(url.replace(EMBED, ''))} style={styles.openBtn}>
          <Text style={styles.openText}>{t('Open in browser')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {Platform.OS === 'web' ? (
        // createElement because React Native's JSX namespace has no <iframe>,
        // and this file still has to compile for native.
        React.createElement('iframe', {
          src: url,
          onLoad: () => setLoading(false),
          style: { flex: 1, border: 'none', width: '100%', height: '100%' },
          title: 'CropBid',
        })
      ) : (
        <WebView
          source={{ uri: url }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
          onHttpError={() => { setLoading(false); setFailed(true); }}
          style={styles.flex}
        />
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.sage} />
        </View>
      ) : null}

      {/* THE ESCAPE HATCH, ONLY ONCE SOMETHING HAS GONE WRONG.
          It used to sit here permanently, reasoning that a frame the host
          refuses renders blank rather than firing onError, so an error-only
          hatch would never appear. True, but it made every healthy page carry
          a bar that reads like a warning: the document loads fine and the app
          still says "Open in browser" underneath it. The timer covers the
          blank case without the false alarm.

          It opens the FULL page, chrome and all: once they have left for a
          browser they are on the website, and a nav-less page would strand
          them there. */}
      {stalled ? (
        <Pressable
          onPress={() => Linking.openURL(url.replace(EMBED, ''))}
          style={styles.openBar}
        >
          <Text style={styles.openBarText}>{t('Trouble loading? Open in browser')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  loading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.bg,
  },
  fallback: { flex: 1, backgroundColor: design.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  failTitle: { fontFamily: font.sansSemi, fontSize: 18, color: design.ink },
  failBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3, marginTop: 6 },
  openBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.forest, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.lg,
  },
  openText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  openBar: {
    borderTopWidth: 1, borderTopColor: design.line,
    paddingVertical: 12, alignItems: 'center',
    backgroundColor: design.paper,
  },
  openBarText: { fontFamily: font.sansMed, fontSize: 13.5, color: colors.forest },
});
