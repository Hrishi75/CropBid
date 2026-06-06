// Buyer app · Home / dashboard — port of crop-bid ScreenHome.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Wordmark, MARKS } from '../../components/marks';
import { IconArrow, IconBell } from '../../components/icons';
import { Eyebrow, GridBg, LiveDot, MiniChart, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';

type Agent = { name: string; crop: string; lots: string; state: string; tone: 'ember' | 'sage' | 'paper'; glyph: string };
const AGENTS: Agent[] = [
  { name: 'Wheat Desk · KC', crop: 'HRW · Yellow Corn', lots: '12 lots', state: 'negotiating', tone: 'ember', glyph: 'sprout' },
  { name: 'Oilseeds', crop: 'Soybeans · GMO-free', lots: '5 lots', state: 'scanning', tone: 'sage', glyph: 'bars' },
  { name: 'Specialty', crop: 'Arabica 85+ · Cocoa', lots: '3 lots', state: 'idle', tone: 'paper', glyph: 'kernel' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <Wordmark size={17} glyph="arc" />
            <View>
              <IconBell size={22} stroke={design.ink2} />
              <View style={styles.bellDot} />
            </View>
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={styles.greeting}>Good morning, Marta</Text>
            <Text style={styles.h1}>
              3 agents working,{'\n'}
              <Text style={styles.h1Serif}>1 needs you.</Text>
            </Text>
          </View>
        </View>

        {/* portfolio card */}
        <View style={styles.sidePad}>
          <View style={styles.portfolio}>
            <GridBg opacity={0.12} />
            <View>
              <View style={styles.rowBetweenTop}>
                <View>
                  <Mono style={styles.portfolioLabel}>CONTRACTED · QTD</Mono>
                  <Text style={styles.portfolioValue}>$48.2M</Text>
                </View>
                <View style={styles.benchRow}>
                  <IconArrow size={11} stroke={design.leaf} />
                  <Mono style={styles.benchText}> +1.6% vs bench</Mono>
                </View>
              </View>
              <MiniChart width={330} height={46} data={[4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 16]} color={design.leaf} fill />
              <View style={styles.statsRow}>
                {[['42', 'contracts'], ['$612K', 'saved'], ['7', 'lots open']].map(([n, l]) => (
                  <View key={l} style={{ flex: 1 }}>
                    <Text style={styles.statN}>{n}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* action required */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>Needs your decision</Eyebrow>
          <View style={styles.liveRow}>
            <LiveDot size={6} />
            <Mono style={styles.liveText}> 1 live</Mono>
          </View>
        </View>
        <View style={styles.sidePad}>
          <View style={styles.actionCard}>
            <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'center' }]}>
              <StatusPill tone="ember" dot>Auction #B-22841</StatusPill>
              <Mono style={styles.muted12}>03:47 left</Mono>
            </View>
            <Text style={styles.cardTitle}>HRW Wheat · 12.5% protein</Text>
            <Text style={styles.cardSub}>5,000 MT · FOB Kansas City · matched at $288.00/MT</Text>
            <View style={styles.actionBtns}>
              <Pressable style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]} onPress={() => nav.navigate('Auction')}>
                <Text style={styles.btnPrimaryText}>Review contract </Text>
                <IconArrow size={13} stroke={colors.textInverse} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}>
                <Text style={styles.btnGhostText}>Snooze</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* active agents */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Your agents</Eyebrow>
          <Text style={styles.manage}>Manage</Text>
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {AGENTS.map((a) => {
            const Mark = MARKS[a.glyph];
            return (
              <View key={a.name} style={styles.agentRow}>
                <View style={styles.agentIcon}>
                  <Mark size={22} color={colors.forest} accent={colors.ember} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.agentName}>{a.name}</Text>
                  <Text style={styles.agentCrop}>{a.crop}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <StatusPill tone={a.tone}>{a.state}</StatusPill>
                  <Mono style={styles.agentLots}>{a.lots}</Mono>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingBottom: 14 },
  sidePad: { paddingHorizontal: 16 },
  sidePadHead: { paddingHorizontal: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  bellDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 999, backgroundColor: colors.ember, borderWidth: 1.5, borderColor: design.bg },
  greeting: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3 },
  h1: { marginTop: 2, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink, lineHeight: 32 },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  portfolio: { backgroundColor: colors.forest, borderRadius: 16, padding: 20, overflow: 'hidden' },
  portfolioLabel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(233,230,220,0.7)' },
  portfolioValue: { fontFamily: font.sansMed, fontSize: 34, letterSpacing: -0.7, color: '#e9e6dc', marginTop: 4 },
  benchRow: { flexDirection: 'row', alignItems: 'center' },
  benchText: { fontSize: 12, color: design.leaf },
  statsRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statN: { fontFamily: font.sansMed, fontSize: 17, color: '#e9e6dc' },
  statL: { fontSize: 11, color: 'rgba(244,241,234,0.6)', marginTop: 1 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  liveText: { fontSize: 11, color: colors.ember },

  actionCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: 'rgba(200,96,43,0.4)', borderRadius: 16, padding: 16, shadowColor: colors.ember, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  muted12: { fontSize: 12, color: design.ink3 },
  cardTitle: { fontFamily: font.sansMed, fontSize: 16.5, letterSpacing: -0.25, color: design.ink },
  cardSub: { fontFamily: font.sans, fontSize: 13.5, color: design.ink2, marginTop: 2 },
  actionBtns: { flexDirection: 'row', gap: 9, marginTop: 14 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.forest },
  btnPrimaryText: { fontFamily: font.sansMed, fontSize: 14, letterSpacing: -0.14, color: '#f4f1ea' },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: design.line },
  btnGhostText: { fontFamily: font.sansMed, fontSize: 14, color: design.ink2 },
  pressed: { opacity: 0.85 },

  manage: { fontFamily: font.sansMed, fontSize: 13, color: colors.forest },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  agentIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, alignItems: 'center', justifyContent: 'center' },
  agentName: { fontFamily: font.sansMed, fontSize: 15, letterSpacing: -0.15, color: design.ink },
  agentCrop: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 1 },
  agentLots: { marginTop: 5, fontSize: 11.5, color: design.ink3 },
});
