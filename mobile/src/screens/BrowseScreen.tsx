import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { browse } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';
import type { Listing } from '../api/types';
import type { BrowseStackParamList } from '../navigation/types';
import { Badge, Loading } from '../components/ui';
import { money, timeAgo, unitLabel } from '../lib/format';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<BrowseStackParamList, 'BrowseList'>;

export default function BrowseScreen({ navigation }: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (query?: string) => {
    setError(null);
    try {
      const res = await browse({ search: query?.trim() || undefined });
      setListings(res.listings);
    } catch (e) {
      setError(errorMessage(e, 'Could not load listings'));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(search);
    setRefreshing(false);
  }, [load, search]);

  if (loading) return <Loading label="Loading listings…" />;

  return (
    <View style={styles.flex}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search crops, location…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => load(search)}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !error ? <Text style={styles.empty}>No listings found.</Text> : null
        }
        renderItem={({ item }) => (
          <ListingRow
            listing={item}
            onPress={() =>
              navigation.navigate('ListingDetail', { id: item.id, preview: item })
            }
          />
        )}
      />
    </View>
  );
}

function ListingRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const img = mediaUrl(listing.images?.[0]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {img ? (
        <Image source={{ uri: img }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Text style={styles.thumbEmptyText}>{listing.cropName[0]}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.crop} numberOfLines={1}>
            {listing.cropName}
            {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
          </Text>
          {listing.organic ? <Badge status="ORGANIC" /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {listing.quantity} {unitLabel(listing.unit)} · Grade {listing.qualityGrade} ·{' '}
          {listing.state}
        </Text>
        <View style={styles.rowBottom}>
          <Text style={styles.price}>
            {money(listing.pricePerUnitMin, listing.currency)}–
            {money(listing.pricePerUnitMax, listing.currency)}
            <Text style={styles.priceUnit}> /{unitLabel(listing.unit)}</Text>
          </Text>
          <Text style={styles.time}>{timeAgo(listing.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  searchBar: { padding: spacing.lg, paddingBottom: spacing.sm },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  error: { color: colors.error, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  rowPressed: { opacity: 0.9 },
  thumb: { width: 92, height: 92 },
  thumbEmpty: { backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  thumbEmptyText: { fontSize: 32, fontWeight: '700', color: colors.sage },
  rowBody: { flex: 1, padding: spacing.md, justifyContent: 'space-between' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  crop: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  price: { fontSize: 15, fontWeight: '700', color: colors.forest },
  priceUnit: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  time: { fontSize: 12, color: colors.textMuted },
});
