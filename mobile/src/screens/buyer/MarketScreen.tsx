// Buyer app · Marketplace (dark forest) — port of crop-bid ScreenMarket.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconSearch } from '../../components/icons';
import { MiniChart, Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';

type Row = { crop: string; grade: string; price: string; d: string; vol: string; closing: string; tone: 'pos' | 'neg' };
const ROWS: Row[] = [
  { crop: 'HRW Wheat', grade: '12.5% protein', price: '$288.00', d: '+0.8%', vol: '5,000 MT', closing: '03:41', tone: 'pos' },
  { crop: 'Yellow Corn', grade: 'US #2', price: '$176.20', d: '-0.4%', vol: '12,000 MT', closing: '01:08', tone: 'neg' },
  { crop: 'Soybeans', grade: 'GMO-free', price: '$412.75', d: '+1.2%', vol: '3,500 MT', closing: '06:55', tone: 'pos' },
  { crop: 'Arabica', grade: 'Specialty 85+', price: '$5,820', d: '+2.1%', vol: '240 MT', closing: '00:42', tone: 'pos' },
  { crop: 'Cocoa', grade: 'Fairtrade', price: '$9,140', d: '-0.9%', vol: '600 MT', closing: '04:12', tone: 'neg' },
  { crop: 'Barley', grade: 'Malting', price: '$214.30', d: '+0.5%', vol: '8,000 MT', closing: '02:30', tone: 'pos' },
];
const FILTERS = ['All', 'Grains', 'Oilseeds', 'Softs', 'Closing soon'];
const POS = '#9bc97a';
const NEG = '#e07a3f';

export default function MarketScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <View>
              <Mono style={styles.eyebrow}>MARKETPLACE · LIVE</Mono>
              <Text style={styles.h1}>287 clearing now</Text>
            </View>
            <View style={styles.searchBtn}>
              <IconSearch size={19} stroke="#e9e6dc" />
            </View>
          </View>
        </View>

        {/* filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f, i) => (
            <View key={f} style={[styles.chip, i === 0 ? styles.chipActive : styles.chipIdle]}>
              <Text style={[styles.chipText, { color: i === 0 ? colors.forest : 'rgba(244,241,234,0.75)' }]}>{f}</Text>
            </View>
          ))}
        </ScrollView>

        {/* lot cards */}
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {ROWS.map((r) => {
            const c = r.tone === 'pos' ? POS : NEG;
            return (
              <Pressable key={r.crop} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => nav.navigate('Auction')}>
                <View style={styles.cardTop}>
                  <View style={{ minWidth: 0 }}>
                    <Text style={styles.crop}>{r.crop}</Text>
                    <Text style={styles.grade}>{r.grade}</Text>
                  </View>
                  <Mono style={{ fontSize: 12, color: c }}>{r.d}</Mono>
                </View>
                <View style={styles.priceRow}>
                  <Mono style={styles.price}>{r.price}</Mono>
                  <MiniChart
                    width={130}
                    height={34}
                    data={r.tone === 'pos' ? [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12] : [10, 9, 11, 8, 9, 7, 8, 6, 5, 7, 5]}
                    color={c}
                    fill
                  />
                </View>
                <View style={styles.cardFoot}>
                  <Mono style={styles.vol}>{r.vol}/MT</Mono>
                  <View style={styles.footRight}>
                    <Mono style={styles.closes}>● closes {r.closing}</Mono>
                    <Text style={styles.bid}>Bid →</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.forestDeep },
  headerPad: { paddingHorizontal: 20, paddingVertical: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(244,241,234,0.55)' },
  h1: { marginTop: 4, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: '#f4f1ea' },
  searchBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  chipActive: { backgroundColor: design.mint },
  chipIdle: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontFamily: font.sansMed, fontSize: 13, letterSpacing: -0.13 },

  card: { backgroundColor: design.forestCard, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  crop: { fontFamily: font.sansMed, fontSize: 16.5, letterSpacing: -0.16, color: '#f4f1ea' },
  grade: { fontFamily: font.sans, fontSize: 12, color: 'rgba(244,241,234,0.5)', marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  price: { fontFamily: font.monoSemi, fontSize: 25, letterSpacing: -0.25, color: '#f4f1ea' },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  vol: { fontSize: 11.5, color: 'rgba(244,241,234,0.5)' },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closes: { fontSize: 11.5, color: colors.ember2 },
  bid: { fontFamily: font.sansSemi, fontSize: 12.5, color: POS },
});
