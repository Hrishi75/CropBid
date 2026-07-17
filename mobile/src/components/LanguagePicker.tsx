// =============================================================================
// LanguagePicker — English / हिन्दी / मराठी
// =============================================================================
// Two faces of the same switch. LanguageChips is the full three-chip row on
// the Profile tab; LanguagePill is the compact storefront-header button that
// opens the same choice as an alert sheet, so guests (no Profile tab) can
// switch too. Language names are always shown in their own script so a Hindi/
// Marathi speaker can find theirs even when the UI is in a language they
// can't read — mirrors client/src/components/ui/LanguageSwitcher.tsx.
// =============================================================================

import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressScale } from './motion';
import { colors, design, font } from '../theme';

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'A' },
  { code: 'hi', label: 'हिन्दी', short: 'अ' },
  { code: 'mr', label: 'मराठी', short: 'अ' },
];

function current(lang: string) {
  return LANGUAGES.find((l) => lang === l.code || lang.startsWith(`${l.code}-`)) ?? LANGUAGES[0];
}

export function LanguageChips() {
  const { i18n } = useTranslation();
  const active = current(i18n.language).code;
  return (
    <View style={styles.chipRow}>
      {LANGUAGES.map((l) => {
        const on = active === l.code;
        return (
          <PressScale
            key={l.code}
            onPress={() => i18n.changeLanguage(l.code)}
            scaleTo={0.94}
            cardStyle={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{l.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

export function LanguagePill() {
  const { i18n } = useTranslation();
  const active = current(i18n.language);
  const openSheet = () => {
    Alert.alert('Language · भाषा', undefined, [
      ...LANGUAGES.map((l) => ({ text: l.label, onPress: () => i18n.changeLanguage(l.code) })),
      { text: '✕', style: 'cancel' as const },
    ]);
  };
  return (
    <PressScale onPress={openSheet} scaleTo={0.92} cardStyle={styles.pill}>
      <Text style={styles.pillText}>{active.label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: design.paper,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sansMed, fontSize: 13.5, color: design.ink2 },
  chipTextOn: { color: '#f4f1ea' },

  pill: {
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: design.paper,
  },
  pillText: { fontFamily: font.sansMed, fontSize: 12, color: design.ink2 },
});
