// =============================================================================
// ShopScreen — one shop's whole counter
// =============================================================================
// The second half of shop-first: having picked a shop, the shopper sees what is
// on ITS shelf, priced the way that shop prices it. No cross-shop comparison
// and no "cheapest nearby" rail, because both quietly turn the shop back into a
// commodity supplier.
//
// KILOGRAMS, END TO END. Sellers list in KG, QUINTAL or TONNE; a household
// thinks in kilos and grams. Every price and weight here is converted for
// display via lib/units. The conversion back to the seller's denomination
// belongs at checkout and nowhere else, at 6dp, against the LIVE listing unit,
// because a seller can re-denominate a lot while it sits in a basket.
//
// The city travels in the route params rather than being read from storage
// again. The server refuses a shop lookup without one, and the shop the shopper
// tapped was listed under a specific city: re-reading storage here would let a
// city change mid-navigation open a shop under the wrong one.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { retailShop } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Listing, RetailShopDetail } from '../api/types';
import { laneMeta, shopTypeLabel } from '../lib/delivery';
import { formatWeight, money, pricePerKg } from '../lib/units';
import { listingImage } from '../lib/cropImages';
import { Empty, ErrorState, Mono, Pill, SectionLabel, Splash } from '../components/ui';
import { useCart, STEP_KG, stockKg } from '../context/CartContext';
import { QuantityStepper } from '../components/QuantityStepper';
import { CartBar } from '../components/CartBar';
import { IconArrowLeft, IconClock, IconLeaf, IconPlus, IconShield } from '../components/icons';
import { colors, design, font, radius, shadow, spacing } from '../theme';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Shop'>;

export default function ShopScreen({ route, navigation }: Props) {
  const { id, city } = route.params;
  const insets = useSafeAreaInsets();

  // Back has to work however this screen was reached, so it names its
  // destination rather than popping blindly.
  //
  // Popping is the wrong call: reached by deep link, bookmark or cold start,
  // this screen can be the only one on the stack, and a pop then does nothing
  // at all while logging "GO_BACK was not handled by any navigator". The
  // shopper is stuck on one shop with no way out.
  //
  // navigate() is right in both directions. Shops already on the stack pops
  // back to it; Shops absent pushes it. No state strands the shopper, which is
  // why this needs no check on stack depth first.
  const goToShops = useCallback(() => {
    navigation.navigate('Shops');
  }, [navigation]);

  // Room for the floating basket bar, and only when there is one to clear.
  const { count: basketCount } = useCart();
  const listPad = basketCount > 0 ? 96 : spacing.xxl;

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

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Splash />;

  if (error || !data) {
    return (
      <View style={[styles.screen, styles.errorPad, { paddingTop: insets.top + spacing.lg }]}>
        <Back onPress={goToShops} onDark={false} />
        <ErrorState
          message={error ?? 'This shop has nothing on the shelf here today.'}
          onRetry={() => { setLoading(true); void load(); }}
        />
      </View>
    );
  }

  const { shop, listings } = data;
  const lane = laneMeta(shop.sellerType);
  const trust = Math.round(shop.trustScore);
  const buyable = listings.filter((l) => l.retailPricePerUnit != null);

  return (
    <View style={styles.screen}>
      <FlatList
        data={buyable}
        keyExtractor={(l) => l.id}
        // TWO COLUMNS, NOT A LIST OF ROWS. Blinkit and Zepto both put produce in
        // a grid of big pictures, and it is not decoration: a shelf row gives an
        // image about 64px and a shopper buying vegetables is choosing on how
        // the vegetables look. A grid spends the width on the photograph.
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.list, { paddingBottom: listPad }]}
        ListHeaderComponent={
          <View>
            {/* Dark hero, matching the list screen's header, so moving between
                the two does not feel like moving between two apps. */}
            <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
              <Back onPress={goToShops} onDark />

              <Text style={styles.name}>{shop.name}</Text>
              <Text style={styles.meta}>
                {shopTypeLabel(shop.shopType, shop.sellerType)} · {shop.city}
              </Text>

              <View style={styles.badges}>
                {shop.verified ? (
                  <Pill
                    label="VERIFIED"
                    tone={colors.sage2}
                    icon={<IconShield size={11} color={colors.sage2} />}
                  />
                ) : null}
                <Pill label={`TRUST ${trust}`} tone="rgba(244,241,234,0.55)" />
                {shop.organicCertified ? (
                  <Pill
                    label={shop.certificationBody ?? 'ORGANIC'}
                    tone={colors.sage2}
                    icon={<IconLeaf size={11} color={colors.sage2} />}
                  />
                ) : null}
              </View>
            </View>

            {/* The promise in full, once, directly under the name. Repeating it
                on every row turns a commitment into decoration. */}
            <View style={styles.promise}>
              <View style={[styles.promiseIcon, { backgroundColor: lane.color }]}>
                <IconClock size={15} color={colors.forest} />
              </View>
              <Text style={styles.promiseText}>{lane.promise}</Text>
            </View>

            <View style={styles.shelfHead}>
              <SectionLabel>
                ON THE SHELF · {buyable.length} {buyable.length === 1 ? 'ITEM' : 'ITEMS'}
              </SectionLabel>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyPad}>
            <Empty title="Nothing on the shelf" body="This shop has sold out for today." />
          </View>
        }
        renderItem={({ item }) => <ShelfCard listing={item} />}
      />

      {/* Last child, so it floats over the shelf rather than scrolling with it. */}
      <CartBar onOpen={() => navigation.getParent()?.navigate('Cart')} />
    </View>
  );
}

function ShelfCard({ listing }: { listing: Listing }) {
  const { add, setQuantity, remove, quantityOf } = useCart();
  const inBasket = quantityOf(listing.id);
  // The whole lot, in kilograms. The stepper will not go past it.
  const available = stockKg(listing);

  // Filtered upstream, so this is a type narrowing rather than a real branch.
  if (listing.retailPricePerUnit == null) return null;

  const perKg = pricePerKg(listing.retailPricePerUnit, listing.unit);
  // The shop's own photo when it has one, else the crop's stock photo. Some
  // crops have neither (coriander, today), which is what CropThumb handles.
  const photo = listingImage(listing);

  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        <CropThumb uri={photo} cropName={listing.cropName} />

        {/* Chips ON the photo rather than under it. They qualify what is
            pictured, and below the image they compete with the name for the
            first read. */}
        <View style={styles.cardChips}>
          <View style={styles.gradeChip}>
            <Mono style={styles.gradeChipText}>{listing.qualityGrade}</Mono>
          </View>
          {listing.organic ? (
            <View style={styles.organicChip}>
              <IconLeaf size={11} color={colors.surface} />
            </View>
          ) : null}
        </View>

        {/* Overlapping the photo's bottom edge, which is where both Blinkit and
            Zepto put it: the shopper's thumb is already there after looking at
            the picture.

            Once there is something in the basket the button becomes the
            stepper, so a second kilo never costs a trip to the cart. */}
        {inBasket > 0 ? (
          <View style={styles.stepperFloat}>
            <QuantityStepper
              kg={inBasket}
              maxKg={available}
              onChange={(kg) => setQuantity(listing.id, kg)}
              onRemove={() => remove(listing.id)}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => add(listing, Math.min(1, available))}
            disabled={available < STEP_KG}
            style={({ pressed }) => [
              styles.addBtn,
              available < STEP_KG && styles.addBtnOff,
              pressed && { opacity: 0.8 },
            ]}
          >
            <IconPlus size={16} color={colors.surface} />
          </Pressable>
        )}
      </View>

      <Text style={styles.crop} numberOfLines={1}>
        {listing.cropName}
      </Text>
      <Text style={styles.variety} numberOfLines={1}>
        {listing.cropVariety ?? shopVarietyFallback}
      </Text>

      <View style={styles.cardFoot}>
        <Text style={styles.cardPrice}>
          {money(perKg, listing.currency)}
          <Text style={styles.cardPriceUnit}>/kg</Text>
        </Text>
        <Mono style={styles.stock}>{formatWeight(available)} left</Mono>
      </View>
    </View>
  );
}

// Keeps every card the same height when a lot has no variety recorded. An
// empty string would collapse the line and stagger the grid.
const shopVarietyFallback = ' ';

/**
 * A shelf row's picture, or a stand-in that still looks deliberate.
 *
 * An empty grey tile reads as an image that failed to load. A monogram on the
 * brand's mint reads as a shop that has not photographed this line yet, which
 * is the truth. It also keeps the row's left edge aligned with its neighbours,
 * which a collapsed or differently-sized fallback would not.
 */
function CropThumb({ uri, cropName }: { uri: string | null; cropName: string }) {
  if (uri) return <Image source={{ uri }} style={styles.photo} resizeMode="cover" />;
  return (
    <View style={[styles.photo, styles.photoFallback]}>
      <Text style={styles.photoLetter}>{cropName.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function Back({ onPress, onDark }: { onPress: () => void; onDark: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
    >
      <IconArrowLeft size={18} color={onDark ? colors.surface : design.ink} />
      <Text style={[styles.backText, { color: onDark ? colors.surface : design.ink }]}>Shops</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  errorPad: { paddingHorizontal: spacing.lg },
  list: { paddingBottom: spacing.xxl },
  emptyPad: { paddingHorizontal: spacing.lg },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  backText: { fontFamily: font.sansMed, fontSize: 14 },

  hero: {
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  name: {
    fontFamily: font.sansBold,
    fontSize: 26,
    color: colors.surface,
    letterSpacing: -0.5,
    marginTop: spacing.md,
  },
  meta: { fontFamily: font.sans, fontSize: 13, color: colors.sage2, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.lg },

  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: design.paper,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  promiseIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseText: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },

  shelfHead: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },

  column: { gap: spacing.md, paddingHorizontal: spacing.lg },

  card: {
    flex: 1,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  // Square. Produce photographs are shot square, and a fixed aspect keeps every
  // card in a row the same height without measuring anything.
  cardImageWrap: { aspectRatio: 1, marginBottom: spacing.sm },
  photo: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: design.paper2 },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  photoLetter: { fontFamily: font.sansBold, fontSize: 34, color: colors.sage },

  cardChips: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 },
  gradeChip: {
    backgroundColor: 'rgba(31,45,24,0.82)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gradeChipText: { fontSize: 9, letterSpacing: 0.5, color: colors.surface, fontFamily: font.monoSemi },
  organicChip: {
    backgroundColor: colors.sage,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: 'center',
  },

  addBtn: {
    position: 'absolute',
    right: 6,
    bottom: -10,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  addBtnOff: { opacity: 0.35 },
  stepperFloat: { position: 'absolute', right: 4, bottom: -12 },

  crop: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 2 },
  variety: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 1 },
  cardFoot: { marginTop: spacing.sm },
  cardPrice: { fontFamily: font.monoSemi, fontSize: 16, color: design.ink },
  cardPriceUnit: { fontFamily: font.mono, fontSize: 10, color: design.ink3 },
  stock: { fontSize: 10, color: design.ink3, marginTop: 2 },
});
