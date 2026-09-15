// =============================================================================
// NotificationPrefsScreen — what this device shows you
// =============================================================================
// SAYS WHAT IT ACTUALLY CONTROLS. There is no push infrastructure in the
// product and no preference model on the server, so these switches change what
// THIS INSTALL does and nothing else. Emails and WhatsApp messages the server
// sends are not affected, and the page says that in as many words rather than
// implying a reach it does not have.
//
// A switch that silently does nothing is worse than a missing switch, because
// the user cannot tell.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '../../lib/prefs';
import { colors, design, font, radius, spacing } from '../../theme';

export default function NotificationPrefsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => { loadPrefs().then(setPrefs); }, []);

  // Written on every change rather than on leaving the screen: there is no save
  // button, so a shopper who backs out immediately must still keep the choice.
  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void savePrefs(next);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <View style={styles.pad}>
        <Row
          label={t('Order updates')}
          hint={t('When an order is packed, on its way, or delivered.')}
          value={prefs.orderUpdates}
          onChange={(v) => set('orderUpdates', v)}
        />
        <Row
          label={t('Price alerts')}
          hint={t('When something you have bought before moves sharply at the mandi.')}
          value={prefs.priceAlerts}
          onChange={(v) => set('priceAlerts', v)}
        />
        <Row
          label={t('Offers and new shops')}
          hint={t('Occasional, and off unless you turn it on.')}
          value={prefs.offers}
          onChange={(v) => set('offers', v)}
        />

        <View style={styles.note}>
          <Mono style={styles.noteLabel}>{t('WHAT THESE COVER')}</Mono>
          <Text style={styles.noteText}>
            {t('These settings apply to this device. Emails and WhatsApp messages about your orders are sent regardless, because they are how we reach you if something goes wrong with a delivery or a payment.')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({
  label, hint, value, onChange,
}: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: design.line, true: colors.sage }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 13,
    marginBottom: spacing.sm,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: font.sansMed, fontSize: 15, color: design.ink },
  rowHint: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 2 },

  note: {
    marginTop: spacing.lg,
    borderLeftWidth: 3, borderLeftColor: colors.wheat,
    paddingLeft: spacing.md,
  },
  noteLabel: { fontSize: 9, letterSpacing: 0.8, color: design.ink3 },
  noteText: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: design.ink3, marginTop: 4 },
});
