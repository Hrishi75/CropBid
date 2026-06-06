// Buyer app · Settlement / contract — port of crop-bid ScreenSettle.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrow, IconCheck, IconChevR, IconShield } from '../../components/icons';
import { Eyebrow, GridBg, Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';

const TERMS: [string, string][] = [
  ['Commodity', 'HRW Wheat · 12.5% protein'],
  ['Counterparty', 'Hartmann Farms · USDA-FGIS'],
  ['Volume', '5,000 MT'],
  ['Price', '$288.00 / MT'],
  ['Delivery', 'FOB Kansas City · Oct 15–30'],
  ['Payment', '30% L/C · NET-15 balance'],
  ['Certs', 'USDA-FGIS · EU-RED traceable'],
];

export default function SettleScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <View style={styles.backRow}>
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <IconChevR size={16} stroke={design.ink2} />
          </View>
          <Text style={styles.backText}>Auction #B-22841</Text>
        </View>

        {/* match hero */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View style={styles.hero}>
            <GridBg opacity={0.1} />
            <View style={{ alignItems: 'center' }}>
              <View style={styles.heroBadge}>
                <IconCheck size={26} sw={2.4} stroke="#9bc97a" />
              </View>
              <Mono style={styles.heroTag}>MATCH FOUND · GAFTA-49</Mono>
              <Text style={styles.heroVal}>$1.44M</Text>
              <Text style={styles.heroSub}>5,000 MT @ $288.00/MT · saved $17,400</Text>
            </View>
          </View>
        </View>

        {/* terms */}
        <View style={styles.sectionHead}>
          <Eyebrow>Contract terms</Eyebrow>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.termsCard}>
            {TERMS.map(([k, v], i) => (
              <View key={k} style={[styles.termRow, i === TERMS.length - 1 && { borderBottomWidth: 0 }]}>
                <Mono style={styles.termKey}>{k}</Mono>
                <Text style={styles.termVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* audit note */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <View style={styles.audit}>
            <IconShield size={17} sw={2} stroke={colors.sage} />
            <Text style={styles.auditText}>Full bid log is replayable &amp; exportable. 11 quotes, 3 counters, timestamped.</Text>
          </View>
        </View>
      </ScrollView>

      {/* sign bar */}
      <View style={styles.bottomBar}>
        <View style={styles.signRow}>
          <Pressable style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnGhostText}>Export log</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}>
            <Text style={styles.btnPrimaryText}>Sign &amp; bind </Text>
            <IconArrow size={14} stroke="#f4f1ea" />
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

  hero: { backgroundColor: colors.forest, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, overflow: 'hidden' },
  heroBadge: { width: 52, height: 52, borderRadius: 999, backgroundColor: 'rgba(155,201,122,0.18)', borderWidth: 1, borderColor: 'rgba(155,201,122,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTag: { fontSize: 10.5, letterSpacing: 1.2, color: 'rgba(244,241,234,0.6)' },
  heroVal: { fontFamily: font.sansMed, fontSize: 32, letterSpacing: -0.64, color: '#e9e6dc', marginTop: 8 },
  heroSub: { fontFamily: font.sans, fontSize: 12.5, color: 'rgba(244,241,234,0.7)', marginTop: 2 },

  sectionHead: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  termsCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, overflow: 'hidden' },
  termRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: design.lineLight },
  termKey: { fontSize: 11.5, color: design.ink3, letterSpacing: 0.44, textTransform: 'uppercase' },
  termVal: { fontFamily: font.sansMed, fontSize: 14, color: design.ink, textAlign: 'right', maxWidth: 200 },

  audit: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, backgroundColor: 'rgba(107,142,78,0.08)', borderWidth: 1, borderColor: 'rgba(107,142,78,0.2)', borderRadius: 12 },
  auditText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, lineHeight: 19, color: design.ink2 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingBottom: 14, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  signRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: design.line },
  btnGhostText: { fontFamily: font.sansMed, fontSize: 14, color: design.ink2 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, backgroundColor: colors.forest },
  btnPrimaryText: { fontFamily: font.sansMed, fontSize: 14, color: '#f4f1ea' },
});
