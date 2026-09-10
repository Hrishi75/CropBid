// =============================================================================
// ShopsScreen — the city's shops, which is Daily's whole front page
// =============================================================================
// THE SHOP IS THE UNIT, NOT THE PRODUCT. This is the one decision the app is
// built around, and it is the opposite of what the business app's storefront
// does. There, a card reads "Tomato, 2 farms, from Rs 24/kg" and averages two
// shops into one row. Here a card is a shop, and the same tomato costing Rs 24
// at one and Rs 28 at another is the point rather than noise to average away.
//
// The reason is competitive. Aggregated SKUs are Blinkit and Instamart's model,
// won on capital and dark stores. Shop identity is the one thing that model
// structurally cannot copy, because it works by making the source invisible.
// Swiggy does the same for restaurants: pick the shop, then its shelf.
//
// It also sidesteps a data problem. Listing.cropName is free text, so "Tomato",
// "tomatoes" and "Tamatar" are three products. Merging them means inventing a
// match nobody verified; grouping by seller uses a real foreign key.
//
// CITY FIRST, ALWAYS. A 2 kg order cannot be trucked across a state, so the
// shopper picks a city before they see a single shop. An order they cannot
// receive is worse than an empty screen.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { retailCities, retailShops, serviceability } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { RetailCity, RetailShop } from '../api/types';
import type { LocatedBy, Serviceability } from '../api/endpoints';
import { NotHereYet } from '../components/NotHereYet';
import { loadCity, saveCity } from '../lib/city';
import { isStale, loadPosition, requestPosition, type Position } from '../lib/position';
import { LANES, LANE_ORDER, laneFor, laneMeta, shopTypeLabel } from '../lib/delivery';
import type { DeliveryLane } from '../lib/delivery';
import { money } from '../lib/units';
import {
  Empty,
  ErrorState,
  Mono,
  Pill,
  SectionLabel,
  ShopListSkeleton,
  Splash,
} from '../components/ui';
import { IconChevronDown, IconLeaf, IconPin, IconSearch, IconShield, IconZap } from '../components/icons';
import { FreshWindow } from '../components/FreshWindow';
import { CartBar } from '../components/CartBar';
import { useCart } from '../context/CartContext';
import { colors, design, font, radius, shadow, spacing } from '../theme';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Shops'>;

export default function ShopsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState<string | null>(null);
  const [cityKnown, setCityKnown] = useState(false); // the storage read has finished
  const [cities, setCities] = useState<RetailCity[]>([]);
  const [shops, setShops] = useState<RetailShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  // Where the shopper is, and whether the list was actually narrowed by it.
  const [position, setPosition] = useState<Position | null>(null);
  const [locatedBy, setLocatedBy] = useState<LocatedBy>('city');
  const [locating, setLocating] = useState(false);
  // Set only when a location check came back with neither lane reachable. The
  // gate then shows NotHereYet instead of a city list they cannot use.
  const [outOfArea, setOutOfArea] = useState<Serviceability | null>(null);
  const [query, setQuery] = useState('');
  // Which supply line the shopper is browsing. QUICK first because same-day is
  // what a household reaches for on a weekday; the tab makes the other one a
  // visible choice rather than something discovered per card.
  const [lane, setLane] = useState<DeliveryLane>('QUICK');
  // Room for the floating basket bar, and only when there is one to clear.
  const { count: basketCount } = useCart();
  const listPad = basketCount > 0 ? 96 : spacing.xxl;

  // Restore the remembered city before anything is fetched, so a returning
  // shopper never sees the picker flash up and vanish.
  useEffect(() => {
    loadCity()
      .then(setCity)
      .finally(() => setCityKnown(true));
  }, []);

  // A remembered position, so the permission prompt is a once-per-install event
  // rather than a launch ritual. Refreshed silently when it has gone stale;
  // never prompts on its own, because a dialog nobody asked for on first launch
  // is how a permission gets denied for good.
  useEffect(() => {
    loadPosition().then((p) => {
      if (!p) return;
      setPosition(p);
      if (isStale(p)) void requestPosition().then((r) => r.ok && setPosition(r.position));
    });
  }, []);

  // Can we reach them at all? Checked whenever the position changes, including
  // one restored from storage on launch, not only one they just asked for.
  // Somebody who saved a position in Pune and has since moved to Mumbai has to
  // be told, and they will never tap the button again to find out.
  useEffect(() => {
    if (!position) {
      setOutOfArea(null);
      return;
    }
    let cancelled = false;
    serviceability(position.latitude, position.longitude)
      .then((reach) => {
        if (cancelled) return;
        // Only NEITHER lane is out of area. No shop in range but a morning van
        // that reaches them is a perfectly good answer, and the shelf says so.
        setOutOfArea(!reach.quick && !reach.fresh ? reach : null);
      })
      .catch(() => {
        // An extra, not a gate: a failed check must not lock a shopper out of a
        // storefront they can perfectly well use.
        if (!cancelled) setOutOfArea(null);
      });
    return () => { cancelled = true; };
  }, [position]);

  // The serviceable cities. Needed even when one is already chosen, because
  // "change" reopens the same list.
  useEffect(() => {
    retailCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const load = useCallback(async () => {
    if (!city) return;
    setError(null);
    try {
      const result = await retailShops(city, position);
      setShops(result.shops);
      setLocatedBy(result.locatedBy);
    } catch (e) {
      // An error, not an empty list. "No shops in Pune" and "we could not reach
      // the server" are different facts and a shopper acts differently on each.
      setError(errorMessage(e, 'Could not reach the shops right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, position]);

  useEffect(() => {
    if (city) {
      setLoading(true);
      void load();
    }
  }, [city, load]);

  // Search covers the shop's NAME and what is on its shelf, because a shopper
  // looking for coriander does not know which shop stocks it. Matching only
  // names would answer a question nobody asked.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shops.filter((s) => {
      if (laneFor(s.sellerType) !== lane) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.shopType ?? '').toLowerCase().includes(q) ||
        s.crops.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [shops, query, lane]);

  // Counted across ALL shops, not the filtered set, so each tab can show what
  // it holds before it is opened. A tab that says nothing about its contents
  // makes the shopper tap it just to find out it is empty.
  const laneCounts = useMemo(() => {
    const counts: Record<DeliveryLane, number> = { QUICK: 0, FRESH: 0 };
    for (const s of shops) counts[laneFor(s.sellerType)] += 1;
    return counts;
  }, [shops]);

  async function useMyLocation() {
    setLocating(true);
    const fix = await requestPosition();

    if (!fix.ok) {
      setLocating(false);
      Alert.alert(
        fix.reason === 'denied' ? 'Location is off' : 'Could not find you',
        fix.reason === 'denied'
          ? "You can still shop: we'll show every shop in your city instead. Turn location on in Settings to see only the ones that deliver to you."
          : "We could not get a fix just now. We'll show every shop in your city instead.",
      );
      return;
    }

    setPosition(fix.position);

    // Whether we can reach them AT ALL is a different question from which shops
    // are near, and it has three answers rather than two. Somebody in Hingna
    // has no shop in range but the morning van does get to them, so only
    // neither-lane counts as out of area.
    try {
      const reach = await serviceability(fix.position.latitude, fix.position.longitude);
      // Covered, so drop them into the city that actually holds the stock
      // rather than making them guess from a list. Only on an explicit tap:
      // silently moving a shopper's city on launch would be startling.
      if ((reach.quick || reach.fresh) && reach.nearestCity && reach.nearestCity !== city) {
        setCity(reach.nearestCity);
        await saveCity(reach.nearestCity);
      }
    } catch {
      // The reach check is an extra, not a gate. If it fails, the shopper still
      // has their position and the city list, which is where they started.
    } finally {
      setLocating(false);
    }
  }

  const pick = async (next: string) => {
    setChanging(false);
    setQuery('');
    setCity(next);
    await saveCity(next);
  };

  if (!cityKnown) return <Splash />;

  // ---- Out of area ---------------------------------------------------------
  // Ahead of the city gate: offering a list of cities to somebody we cannot
  // reach is asking them to pick a delivery address in another state.
  if (outOfArea && position) {
    return (
      <View style={styles.screen}>
        <View style={[styles.gateTop, { paddingTop: insets.top + spacing.xxl }]}>
          <Text style={styles.wordmark}>
            CropBid <Text style={styles.wordmarkAccent}>Daily</Text>
          </Text>
        </View>
        <NotHereYet
          position={position}
          result={outOfArea}
          onBrowseAnyway={() => {
            // Looking around is allowed. What is not allowed is a basket they
            // cannot receive, and the city rule at checkout still holds.
            setOutOfArea(null);
            setPosition(null);
            if (outOfArea.nearestCity) void pick(outOfArea.nearestCity);
          }}
        />
      </View>
    );
  }

  // ---- City gate -----------------------------------------------------------
  if (!city || changing) {
    return (
      <View style={styles.screen}>
        <View style={[styles.gateTop, { paddingTop: insets.top + spacing.xxl }]}>
          <Text style={styles.wordmark}>
            CropBid <Text style={styles.wordmarkAccent}>Daily</Text>
          </Text>
        </View>

        <View style={styles.gateBody}>
          <View style={styles.gateIcon}>
            <IconPin size={26} color={colors.sage} />
          </View>
          <Text style={styles.gateTitle}>Where should we deliver?</Text>
          <Text style={styles.gateCopy}>
            Groceries travel short distances. Pick your city and we'll show you the shops that can
            actually reach you.
          </Text>

          <Pressable
            onPress={useMyLocation}
            disabled={locating}
            style={({ pressed }) => [styles.detectBtn, pressed && styles.pressed]}
          >
            <IconPin size={16} color={colors.surface} />
            <Text style={styles.detectText}>
              {locating ? 'Finding you…' : 'Use my current location'}
            </Text>
          </Pressable>

          <Mono style={styles.gateOr}>OR PICK A CITY</Mono>

          <View style={styles.cityRow}>
            {cities.length === 0 ? (
              <Text style={styles.gateCopy}>No city is being served yet.</Text>
            ) : (
              cities.map((c) => (
                <Pressable
                  key={c.city}
                  onPress={() => pick(c.city)}
                  style={({ pressed }) => [
                    styles.cityPill,
                    c.city === city && styles.cityPillOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <IconPin size={17} color={colors.forest} />
                  <View>
                    <Text style={styles.cityName}>{c.city}</Text>
                    <Mono style={styles.cityState}>{c.state}</Mono>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </View>
    );
  }

  // ---- Shop list -----------------------------------------------------------
  return (
    <View style={styles.screen}>
      {/* Header on the brand's dark green. It anchors the app and, more
          practically, lets the search field read as a field: on the cream
          ground a light input is invisible. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Text style={styles.wordmarkOnDark}>
            CropBid <Text style={styles.wordmarkAccent}>Daily</Text>
          </Text>
          <Pressable
            onPress={() => setChanging(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.cityChip, pressed && styles.pressed]}
          >
            <IconPin size={13} color={colors.surface} />
            <Text style={styles.cityChipText}>{city}</Text>
            <IconChevronDown size={13} color={colors.surface} />
          </Pressable>
        </View>

        <View style={styles.search}>
          <IconSearch size={17} color={design.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search shops or produce"
            placeholderTextColor={design.ink3}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Mono style={styles.clear}>CLEAR</Mono>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.laneBar}>
        {LANE_ORDER.map((key) => {
          const meta = LANES[key];
          const on = key === lane;
          const Icon = key === 'QUICK' ? IconZap : IconLeaf;
          return (
            <Pressable
              key={key}
              onPress={() => setLane(key)}
              style={({ pressed }) => [
                styles.laneTab,
                on && { backgroundColor: colors.forest, borderColor: colors.forest },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.laneTabTop}>
                <Icon size={15} color={on ? meta.color : design.ink3} />
                <Text style={[styles.laneTabTitle, on && { color: colors.surface }]}>
                  {meta.title}
                </Text>
                {/* The count, so an empty lane announces itself before it is
                    opened rather than after. */}
                <Mono style={[styles.laneTabCount, on && { color: colors.sage2 }]}>
                  {laneCounts[key]}
                </Mono>
              </View>
              <Mono style={[styles.laneTabBadge, on && { color: colors.sage2 }]}>
                {meta.badge}
              </Mono>
            </Pressable>
          );
        })}
      </View>

      {/* Fresh is a batch with a real cutoff, so the deadline leads. Quick has
          no deadline to state: a shop holding stock can send it whenever. */}
      {lane === 'FRESH' ? <FreshWindow /> : null}

      {/* WHAT THIS LIST IS, said plainly. Narrowed to shops that can reach the
          shopper, or the whole city because we do not know where they are.
          Only on Quick: Fresh is a van route out of the mandi and a shop-sized
          radius does not apply to it. */}
      {lane === 'QUICK' ? (
        locatedBy === 'coordinates' ? (
          <View style={styles.locBar}>
            <IconPin size={13} color={colors.sage} />
            <Text style={styles.locOn}>Showing shops that deliver to you</Text>
          </View>
        ) : (
          <Pressable
            onPress={useMyLocation}
            disabled={locating}
            style={({ pressed }) => [styles.locBar, styles.locBarOff, pressed && styles.pressed]}
          >
            <IconPin size={13} color={colors.forest} />
            <Text style={styles.locOff}>
              {locating ? 'Finding you…' : `Showing all of ${city}. Use my location`}
            </Text>
          </Pressable>
        )
      ) : null}

      {/* Said once, under the tabs. On every card it would be decoration. */}
      <Text style={styles.laneWhy}>{LANES[lane].rationale}</Text>

      {loading ? (
        <View style={styles.list}>
          <ShopListSkeleton />
        </View>
      ) : error ? (
        <View style={styles.list}>
          <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: listPad }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={colors.sage}
            />
          }
          ListHeaderComponent={
            visible.length > 0 ? (
              <View style={styles.listHead}>
                <SectionLabel>
                  {query
                    ? `${visible.length} MATCHING`
                    : `${visible.length} ${visible.length === 1 ? 'SHOP' : 'SHOPS'} · ${LANES[lane].badge.toUpperCase()}`}
                </SectionLabel>
              </View>
            ) : null
          }
          ListEmptyComponent={
            query ? (
              <Empty
                title={`Nothing matches "${query}"`}
                body="Try a shop name, a kind of shop, or a vegetable."
              />
            ) : (
              <Empty
                title={
                  lane !== 'QUICK'
                    ? `No farms delivering to ${city} yet`
                    : locatedBy === 'coordinates'
                      ? 'No shop reaches you yet'
                      : `No same-day shops in ${city} yet`
                }
                body={
                  lane !== 'QUICK'
                    ? 'No farm is sending in overnight here yet. Try Quick for what is in stock today.'
                    : locatedBy === 'coordinates'
                      // The distinction that matters: there ARE shops in this
                      // city, just none close enough to deliver. Telling this
                      // shopper "no shops in Nagpur" would be false.
                      ? `There are shops in ${city}, but none close enough to deliver to you. Fresh reaches you tomorrow morning.`
                      : 'No neighbourhood shop here is holding stock today. Try Fresh for tomorrow morning.'
                }
              />
            )
          }
          renderItem={({ item }) => (
            <ShopCard shop={item} onPress={() => navigation.navigate('Shop', { id: item.id, city })} />
          )}
        />
      )}

      {/* Last child, so it floats over the list rather than scrolling with it. */}
      <CartBar onOpen={() => navigation.getParent()?.navigate('Cart')} />
    </View>
  );
}

function ShopCard({ shop, onPress }: { shop: RetailShop; onPress: () => void }) {
  const lane = laneMeta(shop.sellerType);
  // Rounded. The business app interpolates trustScore raw and renders
  // "84.2601595017465" on a card.
  const trust = Math.round(shop.trustScore);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        {/* Same rule as a shelf row: a stand-in that looks deliberate beats a
            blank tile, which reads as an image that failed to load. */}
        {shop.image ? (
          <Image source={{ uri: shop.image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbLetter}>{shop.name.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {/* On the image, because the lane is the single most decisive fact on
            the card: everything else is a reason to choose between shops that
            can both actually deliver. */}
        <View style={[styles.laneTag, { backgroundColor: lane.color }]}>
          <Mono style={styles.laneTagText}>{lane.badge}</Mono>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.shopName} numberOfLines={1}>
            {shop.name}
          </Text>
          {shop.verified ? <IconShield size={15} color={colors.sage} /> : null}
        </View>

        <Text style={styles.shopMeta} numberOfLines={1}>
          {shopTypeLabel(shop.shopType, shop.sellerType)} · {shop.itemCount}{' '}
          {shop.itemCount === 1 ? 'item' : 'items'}
          {/* Under 100 m reads better as "nearby" than as "0 km", which looks
              like a missing value rather than a very short walk. */}
          {shop.distanceKm != null
            ? ` · ${shop.distanceKm < 0.1 ? 'nearby' : `${shop.distanceKm} km`}`
            : ''}
        </Text>

        {/* What is actually on the shelf, so the card answers "worth opening?"
            without a tap. */}
        <Text style={styles.crops} numberOfLines={1}>
          {shop.crops.slice(0, 3).join(' · ')}
          {shop.crops.length > 3 ? `  +${shop.crops.length - 3}` : ''}
        </Text>

        <View style={styles.cardFoot}>
          <View style={styles.pills}>
            {/* Trust is a 0-100 platform score, so it is labelled rather than
                starred: a bare "63" next to a shop name reads as 63 reviews,
                and a star would imply a 5-point scale nobody computed. */}
            <Pill label={`TRUST ${trust}`} tone={design.ink3} />
            {/* The COUNT, not a bare "ORGANIC" flag. Most shops here carry at
                least one organic line, so the flag marked all four cards
                identically and differentiated nothing; "2 ORGANIC" is a fact a
                shopper can actually choose on. */}
            {shop.organicCount > 0 ? (
              <Pill label={`${shop.organicCount} ORGANIC`} tone={colors.sage} />
            ) : null}
          </View>
          {/* Two deliberate lines, right-aligned, rather than one that wraps.
              "from" has to be there (this is the cheapest thing on the shelf,
              not the price of anything in particular) but it must not compete
              with the number. */}
          <View style={styles.priceBlock}>
            <Mono style={styles.priceFrom}>from</Mono>
            <Text style={styles.priceStrong}>
              {money(shop.fromPricePerKg, shop.currency)}
              <Text style={styles.priceUnit}>/kg</Text>
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pressed: { opacity: 0.7 },

  wordmark: { fontFamily: font.sansBold, fontSize: 19, color: design.ink, letterSpacing: -0.3 },
  wordmarkOnDark: { fontFamily: font.sansBold, fontSize: 19, color: colors.surface, letterSpacing: -0.3 },
  wordmarkAccent: { color: colors.sage2 },

  // ---- city gate ----
  gateTop: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  gateBody: { paddingHorizontal: spacing.lg },
  gateIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: design.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  gateTitle: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, letterSpacing: -0.5 },
  gateCopy: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: design.ink2, marginTop: spacing.sm },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
    ...shadow.card,
  },
  detectText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  gateOr: { fontSize: 9, letterSpacing: 1, color: design.ink3, textAlign: 'center', marginTop: spacing.lg },

  cityRow: { gap: spacing.sm, marginTop: spacing.md },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: design.line,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  cityPillOn: { borderColor: colors.forest },
  cityName: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  cityState: { fontSize: 11, color: design.ink3, marginTop: 1 },

  // ---- header ----
  header: {
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    ...shadow.header,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(244,241,234,0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cityChipText: { fontFamily: font.sansMed, fontSize: 13, color: colors.surface },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: design.paper,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 14,
    color: design.ink,
    // Web renders a focus ring on the wrapper otherwise, which the rounded
    // container already communicates.
    outlineStyle: 'none',
  } as object,
  clear: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },

  // ---- location strip ----
  locBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: design.mint,
  },
  locBarOff: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  locOn: { flex: 1, fontFamily: font.sansMed, fontSize: 12, color: colors.forest },
  locOff: { flex: 1, fontFamily: font.sansMed, fontSize: 12, color: colors.forest },

  // ---- lane picker ----
  laneBar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  laneTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: design.line,
    backgroundColor: design.paper,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  laneTabTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  laneTabTitle: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  laneTabCount: { fontSize: 11, color: design.ink3, marginLeft: 'auto' },
  laneTabBadge: { fontSize: 9, letterSpacing: 0.5, color: design.ink3, marginTop: 2 },
  laneWhy: {
    fontFamily: font.sans,
    fontSize: 12,
    lineHeight: 18,
    color: design.ink3,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },

  // ---- list ----
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  listHead: { marginBottom: spacing.md },

  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  thumb: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: design.paper2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbLetter: { fontFamily: font.sansBold, fontSize: 32, color: colors.sage },
  laneTag: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  laneTagText: { fontSize: 9, letterSpacing: 0.3, color: colors.forest, fontFamily: font.monoSemi },

  cardBody: { flex: 1, justifyContent: 'space-between', paddingVertical: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shopName: { flexShrink: 1, fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  shopMeta: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 2 },
  crops: { fontFamily: font.sans, fontSize: 12, color: design.ink2, marginTop: 5 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  pills: { flexDirection: 'row', gap: 5, flexShrink: 1 },
  priceBlock: { alignItems: 'flex-end', paddingLeft: spacing.sm },
  priceFrom: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },
  priceStrong: { fontFamily: font.monoSemi, fontSize: 15, color: design.ink, marginTop: -1 },
  priceUnit: { fontFamily: font.mono, fontSize: 10, color: design.ink3 },
});
