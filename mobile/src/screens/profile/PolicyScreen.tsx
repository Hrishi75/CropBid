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
// react-native-webview is already a dependency (RazorpayCheckout), so this
// costs nothing to add.
// =============================================================================

import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { colors, design, font, radius, spacing } from '../../theme';

/** Where the live documents are. One constant, so a domain change is one edit. */
const SITE = 'https://cropbid.in';

export const POLICY_URL = {
  terms: `${SITE}/terms`,
  privacy: `${SITE}/privacy`,
  faq: `${SITE}/faq`,
} as const;

export type PolicyKind = keyof typeof POLICY_URL;

type PolicyRoute = RouteProp<{ Policy: { kind: PolicyKind } }, 'Policy'>;

export default function PolicyScreen() {
  const { kind } = useRoute<PolicyRoute>().params;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const url = POLICY_URL[kind];

  if (failed) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.failTitle}>{t('Could not load the page')}</Text>
        <Text style={styles.failBody}>
          {t('Check your connection, or open it in your browser.')}
        </Text>
        <Pressable onPress={() => Linking.openURL(url)} style={styles.openBtn}>
          <Text style={styles.openText}>{t('Open in browser')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <WebView
        source={{ uri: url }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={() => { setLoading(false); setFailed(true); }}
        style={styles.flex}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.sage} />
        </View>
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
});
