// Farmer app · My Listings — wired to /listings/my. Lists the farmer's own
// lots with status, tap to edit (CreateListing), long-press / trash to delete
// (DELETE /listings/:id). Header action opens a blank CreateListing.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { IconArrow } from '../../components/icons';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { deleteListing, myListings } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import { cropImageFor } from '../../utils/cropImages';
import type { Listing, ListingStatus } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';

const STATUS_TONE: Record<ListingStatus, 'sage' | 'ember' | 'paper'> = {
  ACTIVE: 'sage',
  IN_AUCTION: 'ember',
  SOLD: 'paper',
  EXPIRED: 'paper',
};

// Plain words for each status so a farmer knows at a glance what's happening.
const STATUS_WORD: Record<string, string> = {
  ACTIVE: 'on sale',
  IN_AUCTION: 'in auction',
  SOLD: 'sold',
  EXPIRED: 'expired',
};

// Statuses the API adds later still need readable text, not raw strings like "IN_REVIEW".
function statusWord(status: string) {
  return STATUS_WORD[status] ?? status.toLowerCase().replace(/_/g, ' ');
}

export default function MyListingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await myListings();
      setListings(data.listings ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your listings'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever the tab regains focus so a new/edited listing shows up.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function onDelete(l: Listing) {
    Alert.alert('Remove this crop?', `"${l.cropName}" will no longer be for sale. This can't be undone.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(l.id);
          try {
            await deleteListing(l.id);
            await load();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  const activeCount = listings.filter((l) => l.status === 'ACTIVE').length;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <View>
              <Eyebrow>Your crops · {activeCount} on sale</Eyebrow>
              <Text style={styles.h1}>My crops</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.9 }]}
              onPress={() => nav.navigate('CreateListing')}
            >
              <Text style={styles.newBtnText}>Sell a crop </Text>
              <IconArrow size={13} stroke="#f4f1ea" />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : listings.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Nothing on sale yet. Tap “Sell a crop” to put your first crop in front of buyers —
                offers will come to you.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {listings.map((l) => {
              const img = mediaUrl(l.images?.[0]) ?? cropImageFor(l.cropName);
              const bids = l._count?.bids ?? 0;
              return (
                <Pressable
                  key={l.id}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
                  onPress={() => nav.navigate('CreateListing', { id: l.id })}
                  onLongPress={() => onDelete(l)}
                >
                  <View style={styles.cardTop}>
                    {img ? <Image source={{ uri: img }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.crop} numberOfLines={1}>
                          {l.cropName}{l.cropVariety ? ` · ${l.cropVariety}` : ''}
                        </Text>
                        <StatusPill tone={STATUS_TONE[l.status] ?? 'paper'}>{statusWord(l.status)}</StatusPill>
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        Grade {l.qualityGrade}{l.organic ? ' · Organic' : ''} · {l.location}, {l.state}
                      </Text>
                      <View style={styles.priceRow}>
                        <Mono style={styles.price}>
                          {money(l.pricePerUnitMin, l.currency)}–{money(l.pricePerUnitMax, l.currency)}
                          <Text style={styles.priceUnit}>/{unitLabel(l.unit)}</Text>
                        </Mono>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardFoot}>
                    <Mono style={styles.foot}>
                      {l.quantity.toLocaleString('en-IN')} {unitLabel(l.unit)} · {timeAgo(l.createdAt)}
                    </Mono>
                    <View style={styles.footRight}>
                      <Mono style={styles.footBids}>● {bids} {bids === 1 ? 'offer' : 'offers'}</Mono>
                      <Pressable
                        hitSlop={10}
                        onPress={() => onDelete(l)}
                        disabled={busyId === l.id}
                      >
                        {busyId === l.id ? (
                          <ActivityIndicator size="small" color={colors.ember} />
                        ) : (
                          <Text style={styles.delete}>Delete</Text>
                        )}
                      </Pressable>
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
  headerPad: { paddingHorizontal: 20, paddingVertical: 6, paddingBottom: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h1: { marginTop: 4, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },
  newBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.forest },
  newBtnText: { fontFamily: font.sansMed, fontSize: 13.5, color: '#f4f1ea' },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 18 },
  emptyText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 14 },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: design.paper2 },
  thumbEmpty: { borderWidth: 1, borderColor: design.line },
  crop: { flex: 1, fontFamily: font.sansMed, fontSize: 16, letterSpacing: -0.16, color: design.ink },
  meta: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 3 },
  priceRow: { marginTop: 8 },
  price: { fontFamily: font.monoSemi, fontSize: 16.5, color: design.ink },
  priceUnit: { fontFamily: font.mono, fontSize: 12.5, color: design.ink3 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: design.line },
  foot: { fontSize: 11.5, color: design.ink3 },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  footBids: { fontSize: 11.5, color: colors.ember },
  delete: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.ember },
});
