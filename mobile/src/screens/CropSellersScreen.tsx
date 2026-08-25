// Crop sellers — the "product page" for one crop: every farmer currently
// selling it, side by side, so a shopper compares farms on name, trust score,
// quality grade, and price before opening a lot. Pushed from the storefront
// when a crop card has more than one live seller (params carry the already-
// fetched lots as a preview; a fresh /browse keeps the list current).
// Cheapest lot leads with a BEST PRICE tag. Tapping a farmer opens
// ListingDetail, where the buy/bid action stays role-gated as everywhere else.
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { browse } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';
import { cropImageFor } from '../utils/cropImages';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../api/types';
import type { GuestStackParamList } from '../navigation/types';
import { Mono } from '../components/buyerKit';
import { FadeInImage, PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { money, timeAgo, unitLabel } from '../lib/format';

type Props = NativeStackScreenProps<GuestStackParamList, 'CropSellers'>;

// What a shopper actually pays per unit — retail price when the farmer opened
// the lot for direct sale, else the floor of the bid band (same rule as the
// storefront cards).
function effectivePrice(l: Listing): number {
  return l.retailPricePerUnit ?? l.pricePerUnitMin;
}

// Farmers may list the same crop in different units, so "cheapest" compares
// ₹ per kg, not ₹ per listed unit.
const KG_PER_UNIT: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

function pricePerKg(l: Listing): number {
  return effectivePrice(l) / (KG_PER_UNIT[l.unit] ?? 1);
}

function sortCheapestFirst(lots: Listing[]): Listing[] {
  return [...lots].sort((a, b) => pricePerKg(a) - pricePerKg(b));
}

export default function CropSellersScreen({ route, navigation }: Props) {
  const { crop, preview, retailIn } = route.params;
  const { t } = useTranslation();
  const { user } = useAuth();
  const [lots, setLots] = useState<Listing[]>(() => sortCheapestFirst(preview ?? []));
  const [loading, setLoading] = useState(!preview?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = user?.role;
  const action = role === 'BUYER' ? 'BID' : role === 'FARMER' ? 'VIEW' : 'BUY';

  useLayoutEffect(() => {
    navigation.setOptions({ title: crop });
  }, [navigation, crop]);

  const load = useCallback(async () => {
    try {
      // Exact crop match server-side, under the SAME gate the shelf was built
      // with. `retailIn` is set whenever Home was shopping, which covers guests
      // as well as signed-in consumers — keying off role alone let a guest
      // through, and dropping the city let everyone see lots that cannot be
      // delivered to them. The preview shown a moment earlier was city-scoped;
      // this refresh has to agree with it or the list silently grows.
      const res = await browse({
        crop,
        ...(retailIn ? { directSale: true, location: retailIn } : {}),
      });
      glide();
      setLots(sortCheapestFirst(res.listings ?? []));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not refresh the sellers'));
    } finally {
      setLoading(false);
    }
  }, [crop, retailIn]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const cheapest = lots.length > 0 ? effectivePrice(lots[0]) : null;
  const heroImg = lots.find((l) => l.images?.length)?.images?.[0] ?? null;
  const heroUri = heroImg ? mediaUrl(heroImg) : cropImageFor(crop);

  return (
    <View style={styles.flex}>
      <FlatList
        data={lots}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
        ListHeaderComponent={
          <View>
            {/* crop hero — photo, name, seller count, entry price */}
            <View style={styles.hero}>
              {heroUri ? (
                <FadeInImage uri={heroUri} style={styles.heroImg} />
              ) : (
                <View style={[styles.heroImg, styles.heroImgEmpty]}>
                  <Text style={styles.heroLetter}>{crop[0]}</Text>
                </View>
              )}
              <View style={styles.heroBody}>
                <Mono style={styles.heroEyebrow}>FARM DIRECT · COMPARE & PICK</Mono>
                <Text style={styles.heroName}>{crop}</Text>
                <Text style={styles.heroLine}>
                  {t(lots.length === 1 ? '{{n}} farmer selling today' : '{{n}} farmers selling today', { n: lots.length })}
                  {cheapest != null ? ` · ${t('from')} ${money(cheapest)}/${unitLabel(lots[0].unit)}` : ''}
                </Text>
              </View>
            </View>

            {error ? <Text style={styles.errorLine}>{error}</Text> : null}

            {lots.length > 0 ? (
              <Text style={styles.sectionTitle}>{t('Choose your farmer')}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skelWrap}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skelCard}>
                  <Pulse style={styles.skelAvatar} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Pulse style={styles.skelLine} />
                    <Pulse style={[styles.skelLine, { width: '55%' }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌾</Text>
              <Text style={styles.emptyText}>
                {t('No live lots for this crop right now — pull down to check again.')}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <SellerCard
            lot={item}
            best={index === 0 && lots.length > 1}
            action={action}
            onPress={() => navigation.navigate('ListingDetail', { id: item.id, preview: item })}
          />
        )}
      />
    </View>
  );
}

// One farmer's lot: who they are (name, trust), what the crop is like (grade /
// organic / variety), what's left, and what it costs.
function SellerCard({
  lot, best, action, onPress,
}: {
  lot: Listing;
  best: boolean;
  action: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const farmer = lot.farmer?.user;
  const avatar = farmer?.avatar ? mediaUrl(farmer.avatar) : null;
  const price = effectivePrice(lot);
  const anchor = lot.pricePerUnitMax;
  const low = lot.quantity > 0 && lot.remainingQuantity / lot.quantity <= 0.25;

  return (
    <PressScale onPress={onPress} style={styles.cardSlot} cardStyle={styles.card}>
      <View style={styles.cardTop}>
        {avatar ? (
          <FadeInImage uri={avatar} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={styles.avatarLetter}>{(farmer?.name?.[0] ?? '·').toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.farmerName} numberOfLines={1}>{farmer?.name ?? t('CropBid farmer')}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {lot.location}, {lot.state} · {timeAgo(lot.createdAt)}
          </Text>
        </View>
        {farmer?.trustScore != null ? (
          <Mono style={styles.trust}>★ {farmer.trustScore}</Mono>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        {best ? (
          <View style={[styles.chip, styles.chipBest]}>
            <Mono style={styles.chipBestText}>BEST PRICE</Mono>
          </View>
        ) : null}
        <View style={styles.chip}>
          <Mono style={styles.chipText}>{lot.organic ? 'ORGANIC' : `GRADE ${lot.qualityGrade}`}</Mono>
        </View>
        {lot.cropVariety ? (
          <View style={styles.chip}>
            <Mono style={styles.chipText}>{lot.cropVariety.toUpperCase()}</Mono>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFoot}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{money(price, lot.currency)}</Text>
            <Text style={styles.perUnit}>/{unitLabel(lot.unit)}</Text>
            {anchor > price ? <Text style={styles.strike}>{money(anchor, lot.currency)}</Text> : null}
          </View>
          <Text style={[styles.stock, low && styles.stockLow]} numberOfLines={1}>
            {t(low ? 'Only {{qty}} {{unit}} left' : '{{qty}} {{unit}} available', {
              qty: lot.remainingQuantity.toLocaleString('en-IN'),
              unit: unitLabel(lot.unit),
            })}
          </Text>
        </View>
        <View style={styles.actionBtn}>
          <Text style={styles.actionText}>{action}</Text>
        </View>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  heroImg: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: design.paper2,
    borderWidth: 1,
    borderColor: design.line,
  },
  heroImgEmpty: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  heroLetter: { fontFamily: font.sansBold, fontSize: 28, color: colors.forest },
  heroBody: { flex: 1, minWidth: 0 },
  heroEyebrow: { fontSize: 8.5, letterSpacing: 0.8, color: design.ink3 },
  heroName: { fontFamily: font.sansMed, fontSize: 24, letterSpacing: -0.55, color: design.ink, marginTop: 3 },
  heroLine: { fontFamily: font.sansMed, fontSize: 12, color: design.ink2, marginTop: 3 },

  errorLine: {
    fontFamily: font.sansMed,
    fontSize: 11.5,
    color: colors.ember,
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  sectionTitle: {
    fontFamily: font.sansSemi,
    fontSize: 17,
    letterSpacing: -0.3,
    color: design.ink,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },

  cardSlot: { paddingHorizontal: 16, marginBottom: 10 },
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: design.paper2,
    borderWidth: 1,
    borderColor: design.line,
  },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: font.sansBold, fontSize: 16, color: colors.forest },
  farmerName: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  meta: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 2 },
  trust: { fontSize: 11, color: '#4d6638' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: design.paper2,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: { fontSize: 8.5, letterSpacing: 0.5, color: design.ink2 },
  chipBest: { backgroundColor: colors.ember, borderColor: colors.ember },
  chipBestText: { fontSize: 8.5, letterSpacing: 0.5, color: '#fff' },

  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { fontFamily: font.sansBold, fontSize: 16, color: design.ink },
  perUnit: { fontFamily: font.sans, fontSize: 11, color: design.ink3 },
  strike: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, textDecorationLine: 'line-through', marginLeft: 4 },
  stock: { fontFamily: font.sansMed, fontSize: 10.5, color: design.ink3, marginTop: 3 },
  stockLow: { color: colors.ember },
  actionBtn: {
    borderWidth: 1.4,
    borderColor: colors.forest,
    backgroundColor: 'rgba(31,45,24,0.05)',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionText: { fontFamily: font.sansBold, fontSize: 11.5, color: colors.forest, letterSpacing: 0.5 },

  // skeleton rows while the first fetch runs with no preview
  skelWrap: { paddingHorizontal: 16, gap: 10 },
  skelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.lineLight,
    borderRadius: 14,
    padding: 12,
  },
  skelAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: design.paper2 },
  skelLine: { width: '80%', height: 11, borderRadius: 6, backgroundColor: design.paper2 },

  empty: { alignItems: 'center', marginTop: 36, paddingHorizontal: 24, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center' },
});
