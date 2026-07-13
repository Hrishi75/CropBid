// Market tab (farmer app) — every live listing on CropBid in a grocery-app
// style 2-column photo grid with search and pull-to-refresh, kept in CropBid's
// paper-and-forest palette. Farmers use it to see what other farms are asking
// before pricing their own crop. Taps push ListingDetail, which is read-only
// for farmers: its buy/bid actions are role-gated to buyers and consumers.
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { browse } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';
import type { Listing } from '../api/types';
import { Mono } from '../components/buyerKit';
import { colors, design, font } from '../theme';
import { money, timeAgo, unitLabel } from '../lib/format';

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (query?: string) => {
    try {
      const res = await browse({ search: query?.trim() || undefined });
      setListings(res.listings ?? []);
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
    await load(search);
    setRefreshing(false);
  }, [load, search]);

  return (
    <View style={styles.flex}>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
        ListHeaderComponent={
          <View>
            <View style={styles.headerPad}>
              <Mono style={styles.eyebrow}>OPEN MARKET</Mono>
              <Text style={styles.h1}>What farms are selling</Text>
            </View>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.search}
                value={search}
                onChangeText={setSearch}
                placeholder="Search crop or place…"
                placeholderTextColor={design.ink3}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => load(search)}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyText}>{error ?? 'Nothing on sale right now — pull down to check again.'}</Text>
          )
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => nav.navigate('ListingDetail', { id: item.id, preview: item })} />
        )}
      />
    </View>
  );
}

function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const img = mediaUrl(listing.images?.[0]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      {img ? (
        <Image source={{ uri: img }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.photoLetter}>{listing.cropName[0]}</Text>
        </View>
      )}
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Mono style={styles.pillText}>{listing.quantity.toLocaleString('en-IN')} {unitLabel(listing.unit).toUpperCase()}</Mono>
        </View>
        <View style={styles.pill}>
          <Mono style={styles.pillText}>GRADE {listing.qualityGrade}</Mono>
        </View>
      </View>
      <Text style={styles.crop} numberOfLines={1}>
        {listing.cropName}
        {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {listing.organic ? 'Organic · ' : ''}{listing.location}, {listing.state}
      </Text>
      <Text style={styles.price} numberOfLines={1}>
        {money(listing.pricePerUnitMin, listing.currency)}–{money(listing.pricePerUnitMax, listing.currency)}
        <Text style={styles.perUnit}> /{unitLabel(listing.unit)}</Text>
      </Text>
      <Mono style={styles.time}>{timeAgo(listing.createdAt)}</Mono>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingVertical: 6 },
  eyebrow: { fontSize: 10.5, letterSpacing: 1, color: design.ink3 },
  h1: { marginTop: 4, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },

  searchWrap: { paddingHorizontal: 16, marginTop: 10, marginBottom: 12 },
  search: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: font.sans,
    fontSize: 14.5,
    color: design.ink,
  },

  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },

  gridRow: { paddingHorizontal: 16, gap: 10 },
  card: {
    flex: 1,
    // A lone card in the last FlatList row would otherwise stretch full-width.
    maxWidth: '48.5%',
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 9,
    marginBottom: 10,
  },
  photo: { width: '100%', height: 104, borderRadius: 10, backgroundColor: design.paper2 },
  photoEmpty: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  photoLetter: { fontFamily: font.sansBold, fontSize: 26, color: colors.forest },
  pillRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  pill: { backgroundColor: design.paper2, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  pillText: { fontSize: 8.5, letterSpacing: 0.4, color: design.ink2 },
  crop: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 5 },
  meta: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 2 },
  price: { fontFamily: font.sansBold, fontSize: 13.5, color: design.ink, marginTop: 5 },
  perUnit: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3 },
  time: { fontSize: 9.5, color: design.ink3, marginTop: 4 },
});
