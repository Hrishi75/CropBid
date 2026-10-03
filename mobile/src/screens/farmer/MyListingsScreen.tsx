// Farmer app · My Listings — wired to /listings/my. Lists the seller's own
// lots with status, tap to edit (CreateListing), long-press / trash to delete
// (DELETE /listings/:id). Header action opens a blank CreateListing.
//
// The page answers three questions in order: how is my stock doing overall
// (the summary strip), which lots need me (offers, sold out), and how much of
// each lot is left (the stock bar). Worded by seller kind through
// lib/sellerType, so a shop's page says "My Stock", not "My crops".
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { IconArrow, IconBell, IconClose, IconPlus } from '../../components/icons';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { deleteListing, myListings } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import { cropEmojiFor, cropImageFor } from '../../utils/cropImages';
import { useAuth } from '../../context/AuthContext';
import { Appear } from '../../components/motion';
import { sellerWords } from '../../lib/sellerType';
import type { Listing, ListingStatus } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';

type Filter = 'all' | 'live' | 'done';

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
  const [filter, setFilter] = useState<Filter>('all');
  const { user } = useAuth();
  const words = sellerWords(user);
  // A local shop's prices are fixed on the shelf and households buy outright,
  // so there are no offers to count or reply to.
  const isShop = user?.farmerProfile?.sellerType === 'LOCAL_SHOP';

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

  const live = listings.filter((l) => l.status === 'ACTIVE' || l.status === 'IN_AUCTION');
  const done = listings.filter((l) => l.status !== 'ACTIVE' && l.status !== 'IN_AUCTION');
  const offers = listings.reduce((n, l) => n + (l._count?.bids ?? 0), 0);
  const shown = filter === 'live' ? live : filter === 'done' ? done : listings;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Eyebrow>{words.stockLabel}</Eyebrow>
              <Text style={styles.h1}>{words.stockTab}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.9 }]}
              onPress={() => nav.navigate('CreateListing')}
              accessibilityLabel={words.listCta}
            >
              <IconPlus size={15} stroke="#f4f1ea" />
              <Text style={styles.newBtnText}>{words.listCta}</Text>
            </Pressable>
          </View>

          {/* The whole stock at a glance. Counts only: lots are priced per
              kilo, quintal or tonne, so a summed value or quantity would add
              unlike things. */}
          {listings.length > 0 ? (
            <View style={styles.stats}>
              <Stat value={live.length} label="on sale" />
              {!isShop ? <View style={styles.statDivider} /> : null}
              {!isShop ? <Stat
                value={offers}
                label={offers === 1 ? 'offer received' : 'offers received'}
                accent={offers > 0}
                onPress={offers > 0 ? () => nav.navigate('Bids') : undefined}
              /> : null}
              <View style={styles.statDivider} />
              <Stat value={done.length} label="sold or ended" />
            </View>
          ) : null}

          {listings.length > 0 ? (
            <View style={styles.filters}>
              <FilterChip label="All" count={listings.length} on={filter === 'all'} onPress={() => setFilter('all')} />
              <FilterChip label="On sale" count={live.length} on={filter === 'live'} onPress={() => setFilter('live')} />
              <FilterChip label="Sold & ended" count={done.length} on={filter === 'done'} onPress={() => setFilter('done')} />
            </View>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : listings.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyTitle}>Nothing on sale yet</Text>
              <Text style={styles.emptyText}>
                Put your first lot in front of buyers. It takes two minutes, and offers come to you.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.9 }]}
                onPress={() => nav.navigate('CreateListing')}
              >
                <Text style={styles.newBtnText}>{words.listCta}</Text>
                <IconArrow size={13} stroke="#f4f1ea" />
              </Pressable>
            </View>
          </View>
        ) : shown.length === 0 ? (
          <Text style={styles.errorText}>
            {filter === 'live' ? 'Nothing on sale right now.' : 'Nothing sold or ended yet.'}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {shown.map((l, i) => {
              const img = mediaUrl(l.images?.[0]) ?? cropImageFor(l.cropName);
              const bids = l._count?.bids ?? 0;
              const unit = unitLabel(l.unit);
              const left = Math.max(0, Math.min(l.remainingQuantity ?? l.quantity, l.quantity));
              const leftPct = l.quantity > 0 ? (left / l.quantity) * 100 : 0;
              const ended = l.status !== 'ACTIVE' && l.status !== 'IN_AUCTION';
              return (
                <Appear key={l.id} index={i}>
                <Pressable
                  style={({ pressed }) => [styles.card, ended && styles.cardEnded, pressed && { opacity: 0.92 }]}
                  onPress={() => nav.navigate('CreateListing', { id: l.id })}
                  onLongPress={() => onDelete(l)}
                  accessibilityHint="Opens the lot to edit it"
                >
                  <View style={styles.cardTop}>
                    {img ? (
                      <Image source={{ uri: img }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]}>
                        <Text style={styles.thumbEmoji}>{cropEmojiFor(l.cropName)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.crop} numberOfLines={1}>
                          {l.cropName}{l.cropVariety ? ` · ${l.cropVariety}` : ''}
                        </Text>
                        {/* Small and quiet: it is the one control on the card
                            that cannot be undone, so it is not a word in
                            ember type beside the offer count any more. */}
                        <Pressable
                          hitSlop={10}
                          onPress={() => onDelete(l)}
                          disabled={busyId === l.id}
                          accessibilityLabel={`Remove ${l.cropName}`}
                          style={styles.removeBtn}
                        >
                          {busyId === l.id ? (
                            <ActivityIndicator size="small" color={colors.ember} />
                          ) : (
                            <IconClose size={11} stroke={design.ink3} />
                          )}
                        </Pressable>
                      </View>
                      <View style={styles.tagRow}>
                        <StatusPill tone={STATUS_TONE[l.status] ?? 'paper'}>{statusWord(l.status)}</StatusPill>
                        <Mono style={styles.tag}>GRADE {l.qualityGrade}</Mono>
                        {l.organic ? <Mono style={[styles.tag, styles.tagSage]}>ORGANIC</Mono> : null}
                        {l.directSaleEnabled ? <Mono style={styles.tag}>HOMES TOO</Mono> : null}
                      </View>
                      <Text style={styles.price}>
                        {money(l.pricePerUnitMin, l.currency)}–{money(l.pricePerUnitMax, l.currency)}
                        <Text style={styles.priceUnit}> /{unit}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* How much of the lot is left, which is what a farmer
                      watches as offers are accepted. */}
                  <View style={styles.stock}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.stockText}>
                        <Text style={styles.stockStrong}>{left.toLocaleString('en-IN')} {unit}</Text>
                        {' '}left of {l.quantity.toLocaleString('en-IN')}
                      </Text>
                      <Mono style={styles.age}>{timeAgo(l.createdAt).toUpperCase()}</Mono>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.trackFill, { width: `${Math.max(leftPct, 2)}%` }, ended && styles.trackEnded]} />
                    </View>
                  </View>

                  <View style={styles.cardFoot}>
                    {isShop ? (
                      <Text style={styles.noOffers}>Sold at your shelf price</Text>
                    ) : bids > 0 ? (
                      <Pressable
                        onPress={() => nav.navigate('Bids')}
                        hitSlop={6}
                        style={({ pressed }) => [styles.offersPill, pressed && { opacity: 0.85 }]}
                      >
                        <IconBell size={13} stroke={colors.ember} />
                        <Text style={styles.offersText}>
                          {bids} {bids === 1 ? 'offer' : 'offers'} · reply
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.noOffers}>No offers yet</Text>
                    )}
                    <View style={styles.editLink}>
                      <Text style={styles.editText}>Edit</Text>
                      <IconArrow size={12} stroke={colors.forest} />
                    </View>
                  </View>
                </Pressable>
                </Appear>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({
  value, label, accent, onPress,
}: { value: number; label: string; accent?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <Text style={[styles.statValue, accent && styles.statAccent]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={styles.stat} hitSlop={6}>{body}</Pressable>
  ) : (
    <View style={styles.stat}>{body}</View>
  );
}

function FilterChip({
  label, count, on, onPress,
}: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      <Text style={[styles.chipCount, on && styles.chipCountOn]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h1: { marginTop: 4, fontFamily: font.sansBold, fontSize: 26, letterSpacing: -0.65, color: design.ink },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.forest,
  },
  newBtnText: { fontFamily: font.sansSemi, fontSize: 13.5, color: '#f4f1ea' },

  stats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.forest, borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 16, marginTop: 16,
  },
  stat: { flex: 1, minWidth: 0 },
  statValue: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.4, color: colors.textInverse },
  statAccent: { color: '#f0a36f' },
  statLabel: { fontFamily: font.sans, fontSize: 11, color: 'rgba(244,241,234,0.7)', marginTop: 1 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(244,241,234,0.14)', marginHorizontal: 12 },

  filters: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { color: colors.textInverse },
  chipCount: { fontFamily: font.monoMed, fontSize: 11, color: design.ink3 },
  chipCountOn: { color: design.leaf },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyCard: {
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 20,
    padding: 24, alignItems: 'center', gap: 8,
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 17, color: design.ink },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink2, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.forest,
  },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18, padding: 14, gap: 12 },
  cardEnded: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: design.paper2 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbEmoji: { fontSize: 30 },
  crop: { flex: 1, fontFamily: font.sansBold, fontSize: 16, letterSpacing: -0.2, color: design.ink },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.paper2,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 9.5, letterSpacing: 0.5, color: design.ink2,
    backgroundColor: design.paper2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden',
  },
  tagSage: { backgroundColor: design.mint, color: colors.forest },
  price: { fontFamily: font.sansBold, fontSize: 17, letterSpacing: -0.3, color: design.ink, marginTop: 8 },
  priceUnit: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3 },

  stock: { gap: 6 },
  stockText: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3 },
  stockStrong: { fontFamily: font.sansSemi, color: design.ink },
  age: { fontSize: 9.5, letterSpacing: 0.5, color: design.ink3 },
  track: { height: 6, borderRadius: 3, backgroundColor: design.paper2, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.sage },
  trackEnded: { backgroundColor: design.ink3 },

  cardFoot: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: design.line,
  },
  offersPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(200,96,43,0.1)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
  },
  offersText: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.ember },
  noOffers: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editText: { fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
});
