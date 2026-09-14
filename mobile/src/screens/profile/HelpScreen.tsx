// =============================================================================
// HelpScreen — how to reach a person
// =============================================================================
// ONE EMAIL, AND IT IS THE REAL ONE. There is no support inbox in the product,
// no ticketing, and nobody on a chat rota, so this does not pretend otherwise:
// it gives the address, sets the expectation, and gets out of the way. A "we
// usually reply in minutes" line under an address nobody is watching is worse
// than no line at all.
//
// The FAQ link goes to the website rather than a copy, for the same reason
// PolicyScreen does: it is edited when the product changes, and an app copy
// would go stale silently.
// =============================================================================

import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { IconArrow } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { colors, design, font, radius, spacing } from '../../theme';

export const SUPPORT_EMAIL = 'info@cropbid.in';

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const { user } = useAuth();

  /**
   * Open the mail app with the subject and account already filled in.
   *
   * The account id rides in the body because the first thing any reply needs is
   * "which account", and asking somebody to find it is asking them to give up.
   * Nothing sensitive: an id and the name they chose.
   */
  async function email() {
    const body = [
      '',
      '',
      '---',
      `Account: ${user?.name ?? 'not signed in'}`,
      user?.id ? `Ref: ${user.id.slice(0, 8)}` : '',
    ].filter(Boolean).join('\n');

    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CropBid app')}&body=${encodeURIComponent(body)}`;

    // Not every device has a mail client configured, and openURL rejects rather
    // than failing silently. Falling back to showing the address means the
    // shopper can still copy it down.
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('Write to us'), SUPPORT_EMAIL);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <View style={styles.pad}>
        <Text style={styles.copy}>
          {t('Something wrong with an order, a payment, or your account? Write to us and a person will read it.')}
        </Text>

        <PressScale onPress={email} scaleTo={0.98} cardStyle={styles.emailCard}>
          <Mono style={styles.emailLabel}>{t('EMAIL US')}</Mono>
          <Text style={styles.emailAddr}>{SUPPORT_EMAIL}</Text>
          <Text style={styles.emailHint}>
            {t('Opens your mail app with your account reference filled in.')}
          </Text>
        </PressScale>

        <Row
          label={t('Common questions')}
          hint={t('Delivery, payments, refunds, selling')}
          onPress={() => nav.navigate('Policy', { kind: 'faq' })}
        />
        <Row
          label={t('Terms and conditions')}
          onPress={() => nav.navigate('Policy', { kind: 'terms' })}
        />
        <Row
          label={t('Privacy policy')}
          onPress={() => nav.navigate('Policy', { kind: 'privacy' })}
        />

        <Text style={styles.foot}>
          {t('We are a small team. Expect a reply within a working day or two, not within minutes.')}
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.99} cardStyle={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <IconArrow size={14} stroke={design.ink3} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  copy: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 22, color: design.ink2 },

  emailCard: {
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  emailLabel: { fontSize: 9, letterSpacing: 1.2, color: colors.sage2 },
  emailAddr: { fontFamily: font.sansBold, fontSize: 20, color: colors.surface, marginTop: 4, letterSpacing: -0.3 },
  emailHint: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: 'rgba(244,241,234,0.6)', marginTop: 6 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 13,
    marginTop: spacing.sm,
  },
  rowLabel: { fontFamily: font.sansMed, fontSize: 15, color: design.ink },
  rowHint: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 2 },

  foot: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 19, color: design.ink3, marginTop: spacing.xl },
});
