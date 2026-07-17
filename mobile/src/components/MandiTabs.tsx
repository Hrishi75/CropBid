// =============================================================================
// MandiTabs — the Mandi section's segmented switcher
// =============================================================================
// Live rates ⇄ Price forecast. Pure segmented control: the section is one
// screen (screens/MandiScreen) and this just flips its local tab state, so
// switching is instant — no navigation, no screen transition.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressScale, glide } from './motion';
import { colors, design, font } from '../theme';

export type MandiTab = 'rates' | 'forecast';

export default function MandiTabs({ active, onChange }: { active: MandiTab; onChange: (tab: MandiTab) => void }) {
  const { t } = useTranslation();

  const Seg = ({ id, label }: { id: MandiTab; label: string }) => {
    const on = active === id;
    return (
      // Layout must go on the Pressable itself (`style`) — flex inside
      // `cardStyle` collapses to zero width because the Pressable wrapper
      // sizes to content.
      <PressScale
        onPress={() => { if (!on) { glide(); onChange(id); } }}
        scaleTo={0.96}
        style={styles.segSlot}
        cardStyle={[styles.seg, on && styles.segOn]}
      >
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
