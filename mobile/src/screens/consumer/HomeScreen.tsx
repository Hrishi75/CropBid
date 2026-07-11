// Consumer app · Home — browse crops farmers have opened up for direct retail
// sale (directSaleEnabled). No bidding here: tapping a lot opens ListingDetail
// where the consumer picks a quantity and buys instantly at the listed price.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { browse } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Listing } from '../../api/types';
import { money, unitLabel } from '../../lib/format';

export default function ConsumerHomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await browse({ directSale: true });
      setListings(data.listings ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load crops'));
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

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <Mono style={styles.eyebrow}>DIRECT FROM FARMERS</Mono>
          <Text style={styles.h1}>{listings.length} {listings.length === 1 ? 'crop' : 'crops'} available</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : listings.length === 0 ? (
          <Text style={styles.errorText}>No farmers are selling directly right now — check back soon.</Text>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {listings.map((l) => (
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
                </View>
                <View style={styles.priceRow}>
                  <Mono style={styles.price}>
                    {money(l.retailPricePerUnit ?? 0, l.currency)}
                    <Text style={styles.priceUnit}> /{unitLabel(l.unit)}</Text>
                  </Mono>
                </View>
                <View style={styles.cardFoot}>
                  <Mono style={styles.vol}>
                    {l.remainingQuantity.toLocaleString('en-IN')} {unitLabel(l.unit)} in stock
                  </Mono>
                  <Text style={styles.buy}>Buy →</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingVertical: 6 },
  eyebrow: { fontSize: 10.5, letterSpacing: 1, color: design.ink3 },
  h1: { marginTop: 4, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16, marginTop: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  crop: { fontFamily: font.sansMed, fontSize: 16.5, letterSpacing: -0.16, color: design.ink },
  grade: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  price: { fontFamily: font.monoSemi, fontSize: 20, letterSpacing: -0.25, color: design.ink },
  priceUnit: { fontFamily: font.sans, fontSize: 12, color: design.ink3 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: design.line },
  vol: { fontSize: 11.5, color: design.ink3 },
  buy: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.forest },
});
