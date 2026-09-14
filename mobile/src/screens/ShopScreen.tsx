// =============================================================================
// ShopScreen — one local shop's whole counter
// =============================================================================
// The second half of shop-first: having picked a shop on Home, the shopper sees
// what is on ITS shelf, priced the way that shop prices it. No cross-shop
// comparison and no "cheapest nearby" rail, because both quietly turn the shop
// back into a commodity supplier (CLAUDE.md §3).
//
// THE PACK MODEL IS THE APP'S EXISTING ONE. Sellers list in KG, QUINTAL or
// TONNE and a household thinks in kilos, so a lot is shelved as a household
// pack (lib/catalog `shopPack`) and the basket counts packs, exactly as the
// crop rails and the listing screen already do. A second kilogram
// implementation is how a 500 g pack off a TONNE lot ends up ordering ten times
// what the shopper tapped.
//
// The city travels in the route params rather than being read back from the
// account. The server refuses a shop lookup without one, and the shop that was
// tapped was listed under a specific city: re-reading it here would let a city
// change mid-navigation open a shop under the wrong one.
//
// BUYING IS CONSUMER-ONLY, and that is a server rule (`POST /bids/direct-
// purchase` is `requireRole('CONSUMER')`), so a farmer or bulk buyer who
// wanders in gets the shelf without the buttons rather than a basket that 403s
// at checkout. See CLAUDE.md §4.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { retailShop } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Listing, RetailShopDetail } from '../api/types';
import { shopTypeLabel } from '../components/ShopCard';
import { Mono } from '../components/buyerKit';
import { Loading } from '../components/ui';
import { PressScale } from '../components/motion';
import { QuantityStepper } from '../components/QuantityStepper';
import { CartBar } from '../components/CartBar';
import { IconArrowLeft, IconClock, IconLeaf, IconShield } from '../components/icons';
import { useCart, type CartPack } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { railFor, shopPack } from '../lib/catalog';
import { money } from '../lib/format';
import { listingImage } from '../utils/cropImages';
import { colors, design, font, radius, spacing } from '../theme';

type ShopRoute = RouteProp<{ Shop: { id: string; city: string } }, 'Shop'>;

export default function ShopScreen() {
  const { id, city } = useRoute<ShopRoute>().params;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { count: cartCount } = useCart();

  const [data, setData] = useState<RetailShopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await retailShop(id, city));
    } catch (e) {
      setError(errorMessage(e, 'Could not open this shop.'));
    } finally {
      setLoading(false);
    }
  }, [id, city]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        <Back onPress={() => nav.goBack()} onDark={false} />
        <Text style={styles.errTitle}>{t('Could not open this shop')}</Text>
        <Text style={styles.errBody}>{error ?? t('It has nothing on the shelf here today.')}</Text>
        <Pressable onPress={() => { setLoading(true); void load(); }}>
          <Text style={styles.retry}>{t('Try again')}</Text>
        </Pressable>
      </View>
    );
  }

  const { shop, listings } = data;
  // Only what a household can actually buy. A lot with no retail price is open
  // for bidding, not for the shelf.
  const buyable = listings.filter((l) => l.retailPricePerUnit != null);

  return (
    <View style={styles.screen}>
      <FlatList
        data={buyable}
        keyExtractor={(l) => l.id}
        // TWO COLUMNS, NOT ROWS. A shopper buying vegetables is choosing on how
        // the vegetables look, and a list row gives an image about 64px. A grid
        // spends the width on the photograph.
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.list, { paddingBottom: cartCount > 0 ? 110 : insets.bottom + spacing.xxl }]}
        ListHeaderComponent={
          <View>
            <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
              <Back onPress={() => nav.goBack()} onDark />
              <Text style={styles.name}>{shop.name}</Text>
              <Text style={styles.meta}>
                {shopTypeLabel(shop.shopType, shop.sellerType)} · {shop.city}
              </Text>
              <View style={styles.badges}>
                {shop.verified ? (
                  <Badge label={t('VERIFIED')} icon={<IconShield size={10} stroke={colors.sage2} />} />
                ) : null}
                <Badge label={`${t('TRUST')} ${Math.round(shop.trustScore)}`} />
                {shop.organicCertified ? (
                  <Badge
                    label={shop.certificationBody ?? t('ORGANIC')}
                    icon={<IconLeaf size={10} stroke={colors.sage2} />}
                  />
                ) : null}
              </View>
            </View>

            {/* The promise in full, once, directly under the name. On every row
                it would be decoration rather than a commitment. */}
            <View style={styles.promise}>
              <View style={styles.promiseIcon}>
                <IconClock size={14} stroke={colors.forest} />
              </View>
              <Text style={styles.promiseText}>{t('Arrives today from a shop near you')}</Text>
            </View>

            <View style={styles.shelfHead}>
              <Mono style={styles.shelfLabel}>
                {t('ON THE SHELF')} · {buyable.length} {buyable.length === 1 ? t('ITEM') : t('ITEMS')}
              </Mono>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyPad}>
            <Text style={styles.errTitle}>{t('Nothing on the shelf')}</Text>
            <Text style={styles.errBody}>{t('This shop has sold out for today.')}</Text>
          </View>
        }
        renderItem={({ item }) => <ShelfCard listing={item} />}
      />

      {/* Last child, so it floats over the shelf rather than scrolling with it. */}
      <CartBar />
    </View>
  );
}

function ShelfCard({ listing }: { listing: Listing }) {
  const { add, setQuantity, remove, quantityOf } = useCart();
  const { user } = useAuth();
  const inCart = quantityOf(listing.id);

  // Filtered upstream, so this is a narrowing rather than a real branch.
  if (listing.retailPricePerUnit == null) return null;

  // Shelved as a household pack where the crop has one. A bulk-only crop
  // (cotton, maize) has none and steps by its own unit instead.
  const shelf = shopPack({
    crop: listing.cropName,
    cat: railFor(listing.cropName),
    unit: listing.unit,
    floor: listing.retailPricePerUnit,
    ceiling: listing.retailPricePerUnit,
    retail: listing.retailPricePerUnit,
  });
  const pack: CartPack | null = shelf
    ? { label: shelf.label, kg: shelf.kg, units: shelf.units }
    : null;

  // The opening amount, matching the crop rails and the listing screen: one
  // pack, or one kilo, or the smallest sensible slice of a bigger denomination.
  const first = Math.min(
    pack ? pack.units : listing.unit === 'KG' ? 1 : 0.5,
    listing.remainingQuantity,
  );
  const canBuy = user?.role === 'CONSUMER' && listing.directSaleEnabled && first > 0;
  const perKg = shelf ? shelf.perKg : listing.retailPricePerUnit;
  const perKgLabel = shelf ? shelf.perKgLabel : 'kg';
  const photo = listingImage(listing);

  return (
    <View style={styles.card}>
      <View style={styles.cardImage}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoLetter}>{listing.cropName.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {/* On the photo rather than under it: these qualify what is pictured,
            and below the image they compete with the name for the first read. */}
        <View style={styles.chips}>
          <View style={styles.gradeChip}>
            <Mono style={styles.gradeText}>{listing.qualityGrade}</Mono>
          </View>
          {listing.organic ? (
            <View style={styles.organicChip}>
              <IconLeaf size={10} stroke={colors.surface} />
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.crop} numberOfLines={1}>{listing.cropName}</Text>
      <Text style={styles.variety} numberOfLines={1}>{listing.cropVariety ?? ' '}</Text>

      <View style={styles.cardFoot}>
        <Text style={styles.price}>
          {money(perKg, listing.currency)}
          <Text style={styles.priceUnit}>/{perKgLabel}</Text>
        </Text>
        {pack ? <Mono style={styles.packLabel}>{pack.label}</Mono> : null}
      </View>

      {/* Only a signed-in shopper gets buttons; everyone else reads the shelf. */}
      {canBuy ? (
        inCart > 0 ? (
          <View style={styles.stepper}>
            <QuantityStepper
              value={inCart}
              onChange={(q) => setQuantity(listing.id, q)}
              unit={listing.unit}
              pack={pack}
              max={listing.remainingQuantity}
              size="sm"
              showUnit={false}
              onEmpty={() => remove(listing.id)}
            />
          </View>
        ) : (
          <PressScale onPress={() => add(listing, first)} scaleTo={0.95} cardStyle={styles.addBtn}>
            <Text style={styles.addText}>ADD</Text>
          </PressScale>
        )
      ) : null}
    </View>
  );
}

function Badge({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <View style={styles.badge}>
      {icon}
      <Mono style={styles.badgeText}>{label}</Mono>
    </View>
  );
}

function Back({ onPress, onDark }: { onPress: () => void; onDark: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
      <IconArrowLeft size={18} stroke={onDark ? colors.surface : design.ink} />
      <Text style={[styles.backText, { color: onDark ? colors.surface : design.ink }]}>Shops</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  list: { paddingHorizontal: spacing.lg },
  column: { gap: spacing.md },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs },
  backText: { fontFamily: font.sansMed, fontSize: 14 },

  hero: {
    backgroundColor: colors.forest,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  name: { fontFamily: font.sansBold, fontSize: 26, color: colors.surface, letterSpacing: -0.5, marginTop: spacing.md },
  meta: { fontFamily: font.sans, fontSize: 13, color: colors.sage2, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: 'rgba(244,241,234,0.4)', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 9, letterSpacing: 0.4, color: colors.sage2 },

  promise: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  promiseIcon: {
    width: 28, height: 28, borderRadius: radius.pill, backgroundColor: design.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  promiseText: { fontFamily: font.sansMed, fontSize: 14, color: design.ink },

  shelfHead: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  shelfLabel: { fontSize: 10, letterSpacing: 1.2, color: design.ink3 },
  emptyPad: { paddingTop: spacing.lg },

  card: {
    flex: 1,
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  cardImage: { marginBottom: spacing.sm },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: design.paper2 },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  photoLetter: { fontFamily: font.sansBold, fontSize: 34, color: colors.sage },
  chips: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 },
  gradeChip: { backgroundColor: 'rgba(20,20,15,0.6)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  gradeText: { fontSize: 9, letterSpacing: 0.4, color: colors.surface },
  organicChip: {
    backgroundColor: colors.sage, borderRadius: radius.pill,
    paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center', justifyContent: 'center',
  },

  crop: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  variety: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 1 },
  cardFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5 },
  price: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  priceUnit: { fontFamily: font.sans, fontSize: 11, color: design.ink3 },
  packLabel: { fontSize: 10, color: design.ink3 },

  addBtn: {
    borderWidth: 1, borderColor: colors.forest, borderRadius: radius.md,
    paddingVertical: 7, alignItems: 'center', marginTop: spacing.sm,
    backgroundColor: design.paper,
  },
  addText: { fontFamily: font.sansSemi, fontSize: 12, letterSpacing: 0.5, color: colors.forest },
  stepper: { marginTop: spacing.sm, alignItems: 'center' },

  errTitle: { fontFamily: font.sansSemi, fontSize: 17, color: design.ink, marginTop: spacing.lg },
  errBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3, marginTop: 4 },
  retry: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest, textDecorationLine: 'underline', marginTop: spacing.md },
});
