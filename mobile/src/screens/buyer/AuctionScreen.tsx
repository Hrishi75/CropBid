// Buyer app · Live auction negotiation — port of crop-bid ScreenAuction.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconArrow, IconChevR } from '../../components/icons';
import { LiveDot, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';

type Side = 'buyer' | 'seller' | 'system';
type Line = { side: Side; name: string; time: string; body: React.ReactNode };
const styles_b = { fontFamily: font.sansSemi } as const;
const THREAD: Line[] = [
  { side: 'buyer', name: 'Buyer · Wheat Desk-KC', time: '14:22:01', body: <><Text>Opening at </Text><Text style={styles_b}>$282.10/MT</Text><Text> — 5,000 MT HRW 12.5%, FOB KC, Oct 15–30, std GAFTA-49.</Text></> },
  { side: 'seller', name: 'Seller · Hartmann Farms', time: '14:22:04', body: <><Text>Counter </Text><Text style={styles_b}>$291.50/MT</Text><Text>. Clean 13.1% protein, falling number 320+. 50% L/C on signing.</Text></> },
  { side: 'buyer', name: 'Buyer · Wheat Desk-KC', time: '14:22:11', body: <><Text>Premium acknowledged. </Text><Text style={styles_b}>$286.80/MT</Text><Text>, 30% L/C, balance NET-15 post-discharge. Confirm certs.</Text></> },
  { side: 'seller', name: 'Seller · Hartmann Farms', time: '14:22:15', body: <><Text style={styles_b}>$288.00/MT</Text><Text> — final. USDA-FGIS certs attached, EU-RED traceable.</Text></> },
  { side: 'system', name: 'Settlement engine', time: '14:22:19', body: <Text>Match found. Within ceiling by $4.00. Drafting GAFTA-49…</Text> },
];

export default function AuctionScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  return (
    <View style={styles.flex}>
      {/* sticky lot header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerInner}>
          <View style={[styles.rowBetween, { marginBottom: 8 }]}>
            <View style={styles.rowCenter}>
              <Pressable onPress={() => nav.goBack()} hitSlop={10} style={{ transform: [{ rotate: '180deg' }] }}>
                <IconChevR size={15} stroke={design.ink2} />
              </Pressable>
              <View style={{ width: 8 }} />
              <StatusPill tone="ember" dot>Live auction</StatusPill>
            </View>
            <Mono style={styles.timer}>⏱ 03:47</Mono>
          </View>
          <View style={styles.rowBetweenBaseline}>
            <View>
              <Text style={styles.lotTitle}>HRW Wheat · 12.5%</Text>
              <Text style={styles.lotSub}>5,000 MT · FOB KC · Oct 15–30</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono style={styles.spotLabel}>SPOT REF</Mono>
              <Mono style={styles.spotVal}>$287.40</Mono>
            </View>
          </View>
        </View>
      </View>

      {/* chat scroll */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingTop: insets.top + 86, paddingBottom: insets.bottom + 150, paddingHorizontal: 16, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        {THREAD.map((m, i) => (
          <Msg key={i} {...m} />
        ))}
        {/* competing bid inline */}
        <View style={styles.outbid}>
          <Mono style={styles.outbidEmber}>ADM-12 outbid · $287.20</Mono>
          <Mono style={styles.outbidMuted}> 1.4s ago</Mono>
        </View>
      </ScrollView>

      {/* settlement bar */}
      <View style={[styles.settleBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.rowBetween, { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 8, alignItems: 'center' }]}>
          <View>
            <Mono style={styles.settleLabel}>SETTLEMENT</Mono>
            <Text style={styles.settleVal}>
              $288.00<Text style={styles.settleUnit}>/MT</Text> · $1.44M
            </Text>
          </View>
          <Mono style={styles.saved}>+$17.4K saved</Mono>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <Pressable style={({ pressed }) => [styles.signBtn, pressed && { opacity: 0.9 }]} onPress={() => nav.navigate('Tabs', { screen: 'Contracts' })}>
            <Text style={styles.signBtnText}>Review &amp; sign contract </Text>
            <IconArrow size={14} stroke={colors.forest} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Msg({ side, name, time, body }: Line) {
  const isBuyer = side === 'buyer';
  const isSeller = side === 'seller';
  const isSystem = side === 'system';
  const bg = isBuyer ? 'rgba(31,45,24,0.05)' : isSeller ? 'rgba(200,96,43,0.05)' : 'transparent';
  const border = isBuyer ? 'rgba(31,45,24,0.15)' : isSeller ? 'rgba(200,96,43,0.18)' : design.line;
  const dot = isBuyer ? colors.forest : isSeller ? colors.ember : design.ink3;
  return (
    <View
      style={[
        styles.msg,
        {
          alignSelf: isBuyer ? 'flex-start' : isSeller ? 'flex-end' : 'center',
          backgroundColor: bg,
          borderColor: border,
          borderStyle: isSystem ? 'dashed' : 'solid',
        },
      ]}
    >
      <View style={styles.msgHead}>
        <View style={[styles.msgDot, { backgroundColor: dot }]} />
        <Mono style={styles.msgName}>{name}</Mono>
        <Mono style={styles.msgTime}>{time}</Mono>
      </View>
      <Text style={[styles.msgBody, { fontStyle: isSystem ? 'italic' : 'normal', color: isSystem ? design.ink2 : design.ink }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, backgroundColor: 'rgba(244,241,234,0.96)', borderBottomWidth: 1, borderBottomColor: design.line },
  headerInner: { paddingHorizontal: 18, paddingBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenBaseline: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  timer: { fontSize: 13, color: design.ink2 },
  lotTitle: { fontFamily: font.sansMed, fontSize: 17, letterSpacing: -0.25, color: design.ink },
  lotSub: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 1 },
  spotLabel: { fontSize: 10.5, color: design.ink3 },
  spotVal: { fontFamily: font.monoSemi, fontSize: 15 },

  outbid: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, borderStyle: 'dashed', borderRadius: 999 },
  outbidEmber: { fontFamily: font.monoSemi, fontSize: 11, color: colors.ember },
  outbidMuted: { fontSize: 11, color: design.ink3 },

  msg: { maxWidth: '90%', paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14 },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  msgDot: { width: 7, height: 7, borderRadius: 999 },
  msgName: { fontSize: 10, color: design.ink3, letterSpacing: 0.3 },
  msgTime: { fontSize: 10, color: design.ink3, opacity: 0.7, marginLeft: 'auto' },
  msgBody: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20 },

  settleBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, backgroundColor: colors.forest },
  settleLabel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(244,241,234,0.65)' },
  settleVal: { fontFamily: font.sansMed, fontSize: 18, letterSpacing: -0.18, color: '#e9e6dc', marginTop: 2 },
  settleUnit: { color: 'rgba(244,241,234,0.6)', fontSize: 14 },
  saved: { fontSize: 11.5, color: design.leaf },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: design.mint },
  signBtnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.forest },
});
