// =============================================================================
// MandiTabs — the Mandi section's segmented switcher
// =============================================================================
// Live rates ⇄ Price forecast. Both screens are stack routes registered in
// every role's navigator (and the guest stack); the switcher replaces the
// current route so the section behaves like two tabs of one page rather than
// stacking screens on top of each other.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { PressScale, glide } from './motion';
import { colors, design, font } from '../theme';

type MandiRoutes = { Rates: undefined; Forecast: undefined };

export default function MandiTabs({ active }: { active: 'rates' | 'forecast' }) {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MandiRoutes>>();

  const go = (target: 'rates' | 'forecast') => {
    if (target === active) return;
    glide();
    nav.replace(target === 'rates' ? 'Rates' : 'Forecast');
  };

  const Seg = ({ id, label }: { id: 'rates' | 'forecast'; label: string }) => {
    const on = active === id;
    return (
      // Layout must go on the Pressable itself (`style`) — flex inside
      // `cardStyle` collapses to zero width because the Pressable wrapper
      // sizes to content.
      <PressScale onPress={() => go(id)} scaleTo={0.96} style={styles.segSlot} cardStyle={[styles.seg, on && styles.segOn]}>
        <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
      </PressScale>
    );
  };

  return (
    <View style={styles.bar}>
      <Seg id="rates" label={t('Live rates')} />
      <Seg id="forecast" label={t('Price forecast')} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: design.paper,
    borderBottomWidth: 1, borderBottomColor: design.line,
  },
  segSlot: { flex: 1 },
  seg: {
    alignItems: 'center',
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingVertical: 8, backgroundColor: design.paper,
  },
  segOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  segText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  segTextOn: { color: '#f4f1ea' },
});
