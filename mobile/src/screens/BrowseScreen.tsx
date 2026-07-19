// Market tab (farmer app) — every live listing on CropBid in a grocery-app
// style 2-column photo grid with search and pull-to-refresh, kept in CropBid's
// paper-and-forest palette. Farmers use it to see what other farms are asking
// before pricing their own crop. Taps push ListingDetail, which is read-only
// for farmers: its buy/bid actions are role-gated to buyers and consumers.
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
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
import { cropImageFor } from '../utils/cropImages';
import type { Listing } from '../api/types';
import { Mono } from '../components/buyerKit';
import { FadeInImage, PressScale, Pulse, glide } from '../components/motion';
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
      glide();
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
            <View style={styles.skelWrap}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.skelCard}>
                  <Pulse style={styles.skelPhoto} />
                  <View style={{ padding: 10, gap: 8 }}>
                    <Pulse style={styles.skelLine} />
                    <Pulse style={[styles.skelLine, { width: '55%' }]} />
                  </View>
                </View>
              ))}
            </View>
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
  const img = mediaUrl(listing.images?.[0]) ?? cropImageFor(listing.cropName);
  return (
    <PressScale onPress={onPress} style={styles.cardSlot} cardStyle={styles.card}>
      <View>
        {img ? (
          <FadeInImage uri={img} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoLetter}>{listing.cropName[0]}</Text>
          </View>
        )}
        {/* grade chip overlaid on the photo, matching the web storefront card */}
        <View style={styles.gradeChip}>
          <Mono style={styles.gradeChipText}>{listing.organic ? 'ORGANIC' : `GRADE ${listing.qualityGrade}`}</Mono>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Mono style={styles.qty}>{listing.quantity.toLocaleString('en-IN')} {unitLabel(listing.unit).toUpperCase()}</Mono>
        <Text style={styles.crop} numberOfLines={1}>
          {listing.cropName}
          {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {listing.location}, {listing.state}
        </Text>
        <Text style={styles.price} numberOfLines={1}>
          {money(listing.pricePerUnitMin, listing.currency)}–{money(listing.pricePerUnitMax, listing.currency)}
          <Text style={styles.perUnit}> /{unitLabel(listing.unit)}</Text>
        </Text>
        <Mono style={styles.time}>{timeAgo(listing.createdAt)}</Mono>
      </View>
    </PressScale>
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
  cardSlot: {
    flex: 1,
    // A lone card in the last FlatList row would otherwise stretch full-width.
    maxWidth: '48.5%',
    marginBottom: 10,
  },
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardBody: { padding: 10 },
  gradeChip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(251,249,243,0.92)',
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gradeChipText: { fontSize: 8.5, letterSpacing: 0.5, color: design.ink2 },
  qty: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },

  // skeleton loading grid
  skelWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  skelCard: {
    width: '48%',
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.lineLight,
    borderRadius: 14,
    overflow: 'hidden',
  },
  skelPhoto: { width: '100%', height: 112, backgroundColor: design.paper2 },
  skelLine: { width: '80%', height: 11, borderRadius: 6, backgroundColor: design.paper2 },
  photo: { width: '100%', height: 112, backgroundColor: design.paper2 },
  photoEmpty: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  photoLetter: { fontFamily: font.sansBold, fontSize: 26, color: colors.forest },
  crop: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 4 },
  meta: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 2 },
  price: { fontFamily: font.sansBold, fontSize: 13.5, color: design.ink, marginTop: 5 },
  perUnit: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3 },
  time: { fontSize: 9.5, color: design.ink3, marginTop: 4 },
});
