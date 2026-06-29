// Buyer app · Marketplace — wired to /browse with live listings.
// Filter chips narrow by quality grade / organic; tapping a lot opens
// ListingDetail where a bid can be placed.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconSearch } from '../../components/icons';
import { MiniChart, Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { browse } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Listing } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import { isFreshProduce } from '../../lib/crops';

const FILTERS = ['All', 'Fresh produce', 'Grade A', 'Grade B', 'Organic', 'Most bid'] as const;
type Filter = (typeof FILTERS)[number];
const POS = colors.sage;
const NEG = colors.ember;
const SPARK_POS = [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12];
const SPARK_NEG = [10, 9, 11, 8, 9, 7, 8, 6, 5, 7, 5];

export default function MarketScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await browse();
      setListings(data.listings ?? []);
      setTotal(data.pagination?.total ?? data.listings?.length ?? 0);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the market'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'Fresh produce':
        return listings.filter((l) => isFreshProduce(l.cropName));
      case 'Grade A':
        return listings.filter((l) => l.qualityGrade === 'A');
      case 'Grade B':
        return listings.filter((l) => l.qualityGrade === 'B');
      case 'Organic':
        return listings.filter((l) => l.organic);
      case 'Most bid':
        return [...listings].sort((a, b) => (b._count?.bids ?? 0) - (a._count?.bids ?? 0));
      default:
        return listings;
    }
  }, [listings, filter]);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {/* header */}
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <View>
              <Mono style={styles.eyebrow}>MARKETPLACE · LIVE</Mono>
              <Text style={styles.h1}>{total} {total === 1 ? 'lot' : 'lots'} open</Text>
            </View>
            <View style={styles.searchBtn}>
              <IconSearch size={19} stroke={design.ink2} />
            </View>
          </View>
        </View>

        {/* filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                <Text style={[styles.chipText, { color: active ? colors.textInverse : design.ink2 }]}>{f}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* lot cards */}
        {loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.errorText}>No lots match this filter.</Text>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {visible.map((l, i) => {
              const pos = i % 3 !== 1; // decorative spark direction
              const c = pos ? POS : NEG;
              const bidCount = l._count?.bids ?? 0;
              return (
                <Pressable
                  key={l.id}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
                  onPress={() => nav.navigate('ListingDetail', { id: l.id, preview: l })}
                >
                  <View style={styles.cardTop}>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text style={styles.crop} numberOfLines={1}>
                        {l.cropName}
                        {l.cropVariety ? ` · ${l.cropVariety}` : ''}
                      </Text>
                      <Text style={styles.grade} numberOfLines={1}>
                        Grade {l.qualityGrade}{l.organic ? ' · Organic' : ''} · {l.location}, {l.state}
                      </Text>
                    </View>
                    {l.matchScore != null ? (
                      <Mono style={{ fontSize: 12, color: c }}>match {Math.round(l.matchScore)}%</Mono>
                    ) : (
                      <Mono style={{ fontSize: 12, color: c }}>{timeAgo(l.createdAt)}</Mono>
                    )}
                  </View>
                  <View style={styles.priceRow}>
                    <Mono style={styles.price}>
                      {money(l.pricePerUnitMin, l.currency)}–{money(l.pricePerUnitMax, l.currency)}
                    </Mono>
                    <MiniChart width={130} height={34} data={pos ? SPARK_POS : SPARK_NEG} color={c} fill />
                  </View>
                  <View style={styles.cardFoot}>
                    <Mono style={styles.vol}>
                      {l.quantity.toLocaleString('en-IN')} {unitLabel(l.unit)}
                    </Mono>
                    <View style={styles.footRight}>
                      <Mono style={styles.closes}>● {bidCount} {bidCount === 1 ? 'bid' : 'bids'}</Mono>
                      <Text style={styles.bid}>Bid →</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingVertical: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10.5, letterSpacing: 1, color: design.ink3 },
  h1: { marginTop: 4, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },
  searchBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  chipActive: { backgroundColor: colors.forest },
  chipIdle: { backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line },
  chipText: { fontFamily: font.sansMed, fontSize: 13, letterSpacing: -0.13 },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  crop: { fontFamily: font.sansMed, fontSize: 16.5, letterSpacing: -0.16, color: design.ink },
  grade: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  price: { fontFamily: font.monoSemi, fontSize: 20, letterSpacing: -0.25, color: design.ink },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: design.line },
  vol: { fontSize: 11.5, color: design.ink3 },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closes: { fontSize: 11.5, color: colors.ember },
  bid: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.forest },
});
