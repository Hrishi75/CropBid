// Buyer app · Agent brief (guardrails + deploy) — port of crop-bid ScreenBrief.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBolt, IconCheck, IconChevR } from '../../components/icons';
import { Eyebrow, Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';

function GuardRow({ label, val, bar, hot }: { label: string; val: string; bar: number; hot?: boolean }) {
  const accent = hot ? colors.ember : colors.forest;
  return (
    <View style={{ paddingVertical: 13 }}>
      <View style={styles.guardHead}>
        <Mono style={styles.guardLabel}>{label}</Mono>
        <Mono style={[styles.guardVal, { color: hot ? colors.ember : design.ink }]}>{val}</Mono>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${bar * 100}%`, backgroundColor: accent }]} />
        <View style={[styles.knob, { left: `${bar * 100}%`, borderColor: accent }]} />
      </View>
    </View>
  );
}

const CHIPS = ['USDA verified', 'EU-RED', 'GLOBALG.A.P.', 'Allowlist · 142'];

export default function BriefScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <View style={styles.backRow}>
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <IconChevR size={16} stroke={design.ink2} />
          </View>
          <Text style={styles.backText}>Agents</Text>
        </View>

        <View style={styles.titlePad}>
          <Eyebrow>New buyer agent</Eyebrow>
          <Text style={styles.h1}>
            Brief it in <Text style={styles.h1Serif}>plain English.</Text>
          </Text>
        </View>

        {/* prompt field */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View style={styles.card}>
            <Mono style={styles.briefTag}>● BRIEF</Mono>
            <Text style={styles.briefBody}>
              Buy <Text style={styles.b}>5,000 MT hard red winter wheat</Text>, min 12% protein, FOB Kansas City, delivery Oct 15–30. Don't pay over{' '}
              <Text style={styles.b}>$294</Text>. Match competing bids within 0.5%.
            </Text>
          </View>
        </View>

        {/* guardrails */}
        <View style={[styles.sectionHead, { paddingTop: 20 }]}>
          <Eyebrow>Guardrails · hard stop</Eyebrow>
          <Mono style={styles.noOverride}>no override</Mono>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.guardCard}>
            <GuardRow label="PRICE FLOOR" val="$275.00 /MT" bar={0.5} />
            <View style={styles.divider} />
            <GuardRow label="PRICE CEILING" val="$292.00 /MT" bar={0.9} hot />
            <View style={styles.divider} />
            <GuardRow label="VOLUME RANGE" val="4.5–5.5K MT" bar={0.72} />
            <View style={styles.divider} />
            <GuardRow label="WALK-AWAY" val="$294.00 /MT" bar={0.98} hot />
          </View>
        </View>

        {/* counterparties */}
        <View style={[styles.sectionHead, { paddingTop: 20 }]}>
          <Eyebrow>Counterparties</Eyebrow>
        </View>
        <View style={styles.chipWrap}>
          {CHIPS.map((t, i) => {
            const last = i === 3;
            return (
              <View key={t} style={[styles.cpChip, last ? styles.cpChipActive : styles.cpChipIdle]}>
                {i < 3 ? <IconCheck size={13} sw={2.4} stroke={colors.sage} /> : null}
                <Text style={[styles.cpText, { color: last ? '#e9e6dc' : design.ink2 }]}>{t}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* deploy bar */}
      <View style={styles.bottomBar}>
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable style={({ pressed }) => [styles.deployBtn, pressed && { opacity: 0.9 }]}>
            <IconBolt size={17} fill="#f4f1ea" stroke="none" />
            <Text style={styles.deployText}> Deploy agent</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 4 },
  backText: { fontFamily: font.sans, fontSize: 15, color: design.ink2 },
  titlePad: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  h1: { marginTop: 8, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  briefTag: { fontSize: 10.5, color: colors.sage, letterSpacing: 0.8 },
  briefBody: { marginTop: 8, fontFamily: font.sans, fontSize: 15, lineHeight: 22.5, color: design.ink },
  b: { fontFamily: font.sansSemi },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 6 },
  noOverride: { fontSize: 11, color: design.ink3 },
  guardCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  guardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  guardLabel: { fontSize: 11, color: design.ink3, letterSpacing: 0.55 },
  guardVal: { fontFamily: font.monoSemi, fontSize: 14 },
  track: { height: 5, backgroundColor: design.paper2, borderRadius: 3, justifyContent: 'center' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  knob: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { borderTopWidth: 1, borderTopColor: design.lineLight },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  cpChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  cpChipIdle: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  cpChipActive: { backgroundColor: colors.forest },
  cpText: { fontFamily: font.sansMed, fontSize: 12.5 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingBottom: 14, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  deployBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, backgroundColor: colors.forest },
  deployText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },
});
