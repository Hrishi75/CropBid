// Storefront Home — the Home tab for ALL THREE roles (farmer, buyer,
// consumer) AND the signed-out guest landing: an exact mobile mirror of the WEB
// homepage (client/src/pages/LandingPage.tsx): forest price ticker, cream
// header with wordmark + rotating-hint search + category chips, the mandi-photo
// hero banner, promo trio, category tiles, then EVERY live listing below in the
// same rails, a how-it-works strip, and the sell CTA.
//
// EVERY CARD HERE IS A REAL LOT. It did not used to be: the shared static
// catalog filled each rail with invented lots so the market "always rendered
// with prices", and a live listing merely replaced the demo card for its crop.
// The demo cards carried a village, a grade and a quantity in the same card
// shape as a real listing, and shoppers read them as farmers' listings —
// because that is exactly what they looked like. They are gone. What the rails
// hold now is what the API returned, and nothing else.
//
// AND THE SHELF IS LOCAL FOR SHOPPERS. A household pack cannot be trucked
// across a state, so a consumer or guest sees direct-sale lots in ONE city and
// picks that city first — same rule as the web shelf. Farmers and buyers deal
// in lots that move by the tonne, so their market stays national.
//
// Each crop gets ONE card: when several farmers sell the same crop, their lots
// collapse into a grouped card ("N FARMERS", cheapest price first) that opens
// the CropSellers comparison screen — farmer names, trust, grade, and price
// side by side.
// Home is market-only — tapping a live lot opens ListingDetail, whose action
// is role-gated there (consumer buy bar / buyer bid form / farmer read-only);
// bidding never happens on this page. Selling is farmer-only: farmers get a
// "List your harvest" CTA, everyone else is told to register as a farmer.
// Guests (no session) browse everything freely — the avatar becomes a "Log in"
// pill and the sell CTA routes them to Signup; the actual buy/bid gate lives
// on ListingDetail.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconSearch } from '../components/icons';
import { Mono } from '../components/buyerKit';
import { LanguagePill } from '../components/LanguagePicker';
import { Wordmark } from '../components/marks';
import { FadeInImage, PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { browse, retailCities, updateLocation } from '../api/endpoints';
import api, { errorMessage, mediaUrl } from '../api/client';
import { cropImageFor } from '../utils/cropImages';
import { useAuth } from '../context/AuthContext';
import { useCart, type CartPack } from '../context/CartContext';
import { CartBar } from '../components/CartBar';
import { QuantityStepper } from '../components/QuantityStepper';
import type { Listing, Unit } from '../api/types';
import { money, unitLabel } from '../lib/format';
import {
  CATEGORY_TILES, CHIPS, RAILS, TICKER,
  railFor, shopPack, type RailId, type ShopPack,
} from '../lib/catalog';

const SEARCH_HINTS = ['tomato', 'fresh mango', 'wheat', 'onion', 'dal', 'turmeric'];

// ---------------------------------------------------------------------------
// Live mandi rates — /rates/board (Govt Agmarknet, public, daily)
// ---------------------------------------------------------------------------

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  modal: number;       // ₹ per unit — today's clearing price
  min: number;
  max: number;
  usual: number;       // the crop's usual reference price
  changePct: number;   // today vs usual, % — the price signal
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface RatesBoardData { date: string; live: boolean; rates: LiveRate[]; }

function useLiveRates(): RatesBoardData | null {
  const [board, setBoard] = useState<RatesBoardData | null>(null);
  useEffect(() => {
    let on = true;
    api.get('/rates/board')
      .then(({ data }) => { if (on && data?.rates?.length) setBoard(data); })
      .catch(() => { /* ticker & rail fall back to static reference prices */ });
    return () => { on = false; };
  }, []);
  return board;
}

// One card on the storefront — a live API listing, a whole crop when several
// farmers sell it (one card, "N FARMERS", cheapest price), or a static demo
// lot from the shared catalog, normalised to what the card renders.
// What a household pack is priced from. Held separately from the card's own
// headline numbers because the two can come from different lots: the bulk lane
// quotes the cheapest lot of all, the pack quotes the cheapest buyable one.
interface ShopBasis {
  unit: string;
  floor: number;
  ceiling: number;
  retail: number | null;
}

interface CardVM {
  key: string;
  listing?: Listing;
  // All live lots for this crop, cheapest first, when more than one farmer
  // sells it — the card then opens CropSellers instead of ListingDetail.
  group?: Listing[];
  sellers: number;
  sellersMeta?: string; // meta line override for grouped cards ("3 farms · 2 states")
  cat: RailId;
  name: string;
  variety: string | null;
  emoji: string | null;
  image: string | null;
  unit: string;
  price: number;
  anchor: number;
  floor: number;          // ₹/unit farmgate floor — the bulk lane's headline
  retail: number | null;  // ₹/unit the farmer set for direct sale, if they did
  // The lot the household pack is priced off — the cheapest one a shopper can
  // actually buy, which on a grouped card need not be the cheapest lot overall.
  // null when nothing here is open for direct sale, so the card keeps its
  // wholesale framing instead of offering an ADD that dead-ends on the next
  // screen.
  shop: ShopBasis | null;
  pack: ShopPack | null;  // household pack — set only when the viewer is shopping
  qty: number;
  location: string;
  state: string;
  grade: string;
  organic: boolean;
  trust: number | null;
  low: boolean;
}

// A lot is on the shelf only if the farmer opened it for direct sale AND put a
// price on it; anything else is a bidding lot.
const shopBasis = (l: Listing): ShopBasis | null =>
  l.directSaleEnabled && l.retailPricePerUnit != null
    ? { unit: l.unit, floor: l.pricePerUnitMin, ceiling: l.pricePerUnitMax, retail: l.retailPricePerUnit }
    : null;

function fromListing(l: Listing): CardVM {
  return {
    key: l.id,
    listing: l,
    sellers: 1,
    cat: railFor(l.cropName),
    name: l.cropName,
    variety: l.cropVariety,
    emoji: null,
    image: l.images?.[0] ?? cropImageFor(l.cropName),
    unit: l.unit,
    price: l.retailPricePerUnit ?? l.pricePerUnitMin,
    anchor: l.pricePerUnitMax,
    floor: l.pricePerUnitMin,
    retail: l.retailPricePerUnit ?? null,
    shop: shopBasis(l),
    pack: null,
    qty: l.remainingQuantity,
    location: l.location,
    state: l.state,
    grade: l.qualityGrade,
    organic: l.organic,
    trust: l.farmer?.user?.trustScore ?? null,
    low: l.quantity > 0 && l.remainingQuantity / l.quantity <= 0.25,
  };
}

// Collapse every live lot of one crop into a single card: the cheapest lot
// fronts it (photo, price, grade), quantity is the combined stock, and the
// meta line says how many farms are selling and where. Lots of one crop can
// be listed in different units, so "cheapest" compares ₹ per kg.
const KG_PER_UNIT: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

function fromGroup(group: Listing[]): CardVM {
  const perKg = (l: Listing) =>
    (l.retailPricePerUnit ?? l.pricePerUnitMin) / (KG_PER_UNIT[l.unit] ?? 1);
  const sorted = [...group].sort((a, b) => perKg(a) - perKg(b));
  const base = fromListing(sorted[0]);
  if (sorted.length === 1) return base;
  // Stock and price in the shared unit when all lots agree, else per kg.
  const sameUnit = sorted.every((l) => l.unit === sorted[0].unit);
  const kgFactor = KG_PER_UNIT[sorted[0].unit] ?? 1;
  const inStockUnit = (l: Listing, n: number) => (sameUnit ? n : n * (KG_PER_UNIT[l.unit] ?? 1));
  const qty = Math.round(sorted.reduce((s, l) => s + inStockUnit(l, l.remainingQuantity), 0));
  const total = sorted.reduce((s, l) => s + inStockUnit(l, l.quantity), 0);
  const states = [...new Set(sorted.map((l) => l.state))];
  // The cheapest lot need not be the cheapest one on the shelf — a farmer can
  // undercut the group and still keep their lot for bidders only. The card
  // opens CropSellers, where the shopper picks a seller, so price the pack off
  // the cheapest lot that is genuinely for sale rather than hiding the whole
  // group behind BID. `sorted` is already cheapest-first.
  const shop = sorted.map(shopBasis).find((b) => b != null) ?? null;
  return {
    ...base,
    key: `crop-${base.name.trim().toLowerCase()}`,
    group: sorted,
    shop,
    sellers: sorted.length,
    sellersMeta: states.length === 1
      ? `${sorted.length} farms · ${states[0]}`
      : `${sorted.length} farms · ${states.length} states`,
    unit: sameUnit ? base.unit : 'KG',
    price: sameUnit ? base.price : base.price / kgFactor,
    anchor: sameUnit ? base.anchor : base.anchor / kgFactor,
    floor: sameUnit ? base.floor : base.floor / kgFactor,
    retail: base.retail == null ? null : sameUnit ? base.retail : base.retail / kgFactor,
    qty,
    low: total > 0 && qty / total <= 0.25,
  };
}

function pctOff(price: number, anchor: number): number {
  if (price >= anchor) return 0;
  return Math.round((1 - price / anchor) * 100);
}

export default function StorefrontHomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, applyUser } = useAuth();
  const { add, quantityOf, setQuantity, remove, count: cartCount } = useCart();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<RailId | null>(null);
  const [cities, setCities] = useState<Array<{ city: string; state: string }>>([]);
  // A guest has no account to hold a city on, so theirs lives here for the
  // session. A signed-in shopper's comes off User.location, which the checkout
  // reads as the delivery default.
  const [guestCity, setGuestCity] = useState('');
  const [savingCity, setSavingCity] = useState('');
  const [changingCity, setChangingCity] = useState(false);
  const board = useLiveRates();

  const role = user?.role;
  const isFarmer = role === 'FARMER';
  const isConsumer = role === 'CONSUMER';
  // Consumers and guests shop by the pack; buyers and farmers work in lots, so
  // they keep the wholesale ₹/quintal framing.
  const shopping = role !== 'BUYER' && !isFarmer && role !== 'ADMIN';
  // Card action mirrors what ListingDetail offers each role.
  const actionLabel = role === 'BUYER' ? 'BID' : isFarmer ? 'VIEW' : 'ADD';
  const liveWord = role === 'CONSUMER' ? 'FARM DIRECT' : 'LIVE LOT';
  // Whoever is being sold a pack is also being promised a delivery, so the
  // shelf they see has to be one they can actually be delivered from.
  const city = shopping ? (user ? (user.location?.trim() ?? '') : guestCity) : '';
  const needsCity = shopping && (city === '' || changingCity);

  // Which cities can be served at all — needed before any produce is fetched
  // for a shopper, and again whenever they want to change city.
  useEffect(() => {
    if (!shopping) return;
    let on = true;
    retailCities()
      .then((rows) => { if (on) setCities(rows); })
      .catch(() => { if (on) setCities([]); });
    return () => { on = false; };
  }, [shopping]);

  const load = useCallback(async () => {
    // No city means no shelf to fetch — the picker is showing instead.
    if (needsCity) { setLoaded(true); return; }
    try {
      // Shoppers only see lots opened for direct retail, in their own city;
      // farmers and buyers see the whole open market, nationwide.
      const data = await browse(shopping ? { directSale: true, location: city } : {});
      glide();
      setListings(data.listings ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not reach the market. Pull down to try again.'));
      setListings([]);
    } finally {
      setLoaded(true);
    }
  }, [shopping, city, needsCity]);

  useEffect(() => {
    load();
  }, [load]);

  const chooseCity = useCallback(async (next: string) => {
    setChangingCity(false);
    if (!user) { setGuestCity(next); return; }
    setSavingCity(next);
    try {
      applyUser(await updateLocation(next));
    } catch (e) {
      Alert.alert('Could not save your city', errorMessage(e, 'Please try again.'));
    } finally {
      setSavingCity('');
    }
  }, [user, applyUser]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // One card per CROP, not per lot: when several farmers sell the same crop
  // their lots collapse into a grouped card that opens the CropSellers
  // comparison screen. Nothing is added underneath — an empty market renders
  // empty, and says so.
  const items = useMemo<CardVM[]>(() => {
    const byCrop = new Map<string, Listing[]>();
    for (const l of listings) {
      const key = l.cropName.trim().toLowerCase();
      const group = byCrop.get(key);
      if (group) group.push(l);
      else byCrop.set(key, [l]);
    }
    const all = [...byCrop.values()].map(fromGroup);
    if (!shopping) return all;
    // Price the household pack off whichever number the lot actually carries —
    // the farmer's own retail price, or the floor plus the shelf margin. A lot
    // that isn't open for direct sale gets no pack: ListingDetail would only
    // offer it by the quintal, so the card says so too.
    return all.map((vm) => ({
      ...vm,
      pack: vm.shop ? shopPack({ crop: vm.name, cat: vm.cat, ...vm.shop }) : null,
    }));
  }, [listings, shopping]);

  const q = search.trim().toLowerCase();
  const browsing = q === '' && category === null;
  const results = items.filter((v) => {
    if (category && v.cat !== category) return false;
    if (!q) return true;
    return `${v.name} ${v.variety ?? ''} ${v.location} ${v.state}`.toLowerCase().includes(q);
  });

  const openCard = (v: CardVM) => {
    if (v.sellers > 1 && v.group) {
      // Several farmers sell this crop — open the comparison screen instead
      // of jumping into one farmer's lot.
      // `retailIn` carries this shelf's scope across, so the comparison screen
      // re-fetches the same shelf rather than the whole country. Empty for a
      // farmer or a buyer, who are looking at the open market on purpose.
      nav.navigate('CropSellers', { crop: v.name, preview: v.group, retailIn: shopping ? city : undefined });
    } else if (v.listing) {
      nav.navigate('ListingDetail', { id: v.listing.id, preview: v.listing });
    }
  };

  // The basket wiring one card gets — null for anyone who is not a signed-in
  // shopper, and for a card that fronts several farmers. A grouped card cannot
  // add anything: which farmer's lot would it be? Those keep their arrow into
  // the comparison screen, where a seller is picked first.
  const cartFor = (v: CardVM) => {
    const l = v.listing;
    if (!isConsumer || v.sellers > 1 || !l || !l.directSaleEnabled || l.retailPricePerUnit == null) {
      return undefined;
    }
    const pack: CartPack | null = v.pack
      ? { label: v.pack.label, kg: v.pack.kg, units: v.pack.units }
      : null;
    // The opening amount, matching the listing screen: one pack, or — for a
    // bulk-only crop — one kilo, or the smallest sensible slice of a bigger
    // denomination.
    const first = Math.min(pack ? pack.units : l.unit === 'KG' ? 1 : 0.5, l.remainingQuantity);
    return {
      inCart: quantityOf(l.id),
      pack,
      unit: l.unit,
      max: l.remainingQuantity,
      canAdd: first > 0,
      onAdd: () => add(l, first),
      onChange: (q: number) => setQuantity(l.id, q),
      onRemove: () => remove(l.id),
    };
  };

  const pickCategory = (target: RailId | null) => {
    glide();
    setCategory(target);
  };

  const onSell = () => {
    if (isFarmer) {
      nav.navigate('CreateListing');
    } else if (!user) {
      Alert.alert(
        'Sell on CropBid',
        'Create a free farmer account to list your harvest — it goes live to buyers and homes across the country.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Create account', onPress: () => nav.navigate('Signup') },
        ],
      );
    } else {
      Alert.alert(
        'Sell on CropBid',
        'Only registered farmers can list crops. Create a farmer account from the sign-up screen — your harvest then goes live to buyers and homes across the country.',
      );
    }
  };

  return (
    <View style={styles.flex}>
      {/* fixed top block — ticker + wordmark + search + chips, like the web's
          sticky header */}
      <View style={{ paddingTop: insets.top, backgroundColor: colors.forest }}>
        <TickerStrip board={board} />
      </View>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Wordmark size={19} />
          <View style={styles.headerRight}>
            <LanguagePill />
            {user ? (
              <PressScale onPress={() => nav.navigate('You')} cardStyle={styles.avatar}>
                {user.avatar ? (
                  <FadeInImage uri={mediaUrl(user.avatar)!} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarLetter}>{(user.name?.[0] ?? '·').toUpperCase()}</Text>
                )}
              </PressScale>
            ) : (
              <PressScale onPress={() => nav.navigate('Login')} cardStyle={styles.loginPill}>
                <Text style={styles.loginPillText}>{t('Log in')}</Text>
              </PressScale>
            )}
          </View>
        </View>

        <View style={styles.searchBar}>
          <IconSearch size={17} stroke={design.ink3} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={(t) => { glide(); setSearch(t); }}
            placeholder=""
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search === '' ? <RotatingHint /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsPad}>
          {CHIPS.map((c) => (
            <Chip
              key={c.label}
              label={c.label}
              selected={category === c.target}
              onPress={() => pickCategory(c.target)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartCount > 0 ? 96 : 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        {shopping && !needsCity ? (
          <View style={styles.cityBar}>
            <Text style={styles.cityBarText}>Delivering to {city}</Text>
            <PressScale onPress={() => setChangingCity(true)} scaleTo={0.94}>
              <Text style={styles.cityBarChange}>change</Text>
            </PressScale>
          </View>
        ) : null}

        {needsCity ? (
          /* Asked before any produce is shown. An order that cannot be
             delivered is worse than an empty shop, so the city comes first. */
          <View style={styles.cityGate}>
            <Mono style={styles.cityGateEyebrow}>DELIVERY</Mono>
            <Text style={styles.cityGateTitle}>Where should we deliver?</Text>
            <Text style={styles.cityGateBody}>
              Fresh produce travels short distances. Pick your city and we'll show
              you the farms that can actually reach you.
            </Text>
            {cities.length === 0 ? (
              <Text style={styles.cityGateNote}>
                No farm is selling direct anywhere yet. Check back shortly — growers
                open lots for retail as they harvest.
              </Text>
            ) : (
              <CityRow cities={cities} current={city} saving={savingCity} onPick={chooseCity} />
            )}
            {city ? (
              <PressScale onPress={() => setChangingCity(false)} scaleTo={0.94}>
                <Text style={styles.cityGateCancel}>Cancel</Text>
              </PressScale>
            ) : null}
          </View>
        ) : browsing ? (
          <>
            {/* hero banner — the web banner with the mandi photo */}
            <View style={styles.banner}>
              <Image source={require('../../assets/mandi.jpg')} style={styles.bannerImg} resizeMode="cover" />
              <View style={styles.bannerShade} />
              <View style={styles.bannerContent}>
                <View style={styles.bannerChip}>
                  <Pulse style={styles.liveDot} />
                  <Mono style={styles.bannerChipText}>
                    {listings.length > 0
                      ? `LIVE · ${listings.length} FARMER ${listings.length === 1 ? 'LOT' : 'LOTS'}${city ? ` IN ${city.toUpperCase()}` : ''}`
                      : 'STRAIGHT FROM THE FARM · ESCROW SETTLED'}
                  </Mono>
                </View>
                <Text style={styles.bannerTitle}>
                  Farm-fresh crops,{'\n'}
                  <Text style={styles.bannerItalic}>farmer-fair</Text> prices.
                </Text>
                <View style={styles.bannerTicks}>
                  <Text style={styles.bannerTick}>✓ {t('Open bidding & auctions')}</Text>
                  <Text style={styles.bannerTick}>✓ {t('Escrow settlement')}</Text>
                  <Text style={styles.bannerTick}>✓ {t('Farm to door')}</Text>
                </View>
              </View>
            </View>

            {/* today's live mandi rates — the shared price anchor, up front */}
            <RatesRail board={board} onSeeAll={() => nav.navigate('Rates')} />

            {/* promo rail — the web's sage/paper/ember cards */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoPad}>
              <PromoCard tone="paper" emoji="📈" title={t('Where prices go next')} desc={t('7-day outlook for every crop — sell now or hold?')} onPress={() => nav.navigate('Rates', { tab: 'forecast' })} />
              <PromoCard tone="sage" emoji="🏛️" title={t('Sarkari Yojana')} desc={t("PM-Kisan, fasal bima, KCC loans — find every govt scheme you're owed.")} onPress={() => nav.navigate('Schemes')} />
              <PromoCard tone="paper" emoji="🚜" title={t('Machines & equipment')} desc={t('Tractors, pumps and pipes — buy outright or hire by the day.')} onPress={() => nav.navigate('Equipment')} />
              <PromoCard tone="paper" emoji="🧺" title={t('Buy direct, no bidding')} desc={t('Household packs at the farmer’s own price.')} />
              <PromoCard tone="paper" emoji="🚜" title={t('Straight from the grower')} desc={t('A shorter chain means fairer prices — for the farm and for you.')} />
              <PromoCard tone="ember" emoji="🛡️" title={t('Escrow protected')} desc={t('Money stays held on-platform until the crop reaches you.')} />
            </ScrollView>

            {/* shop by category — web's tile row */}
            <Text style={styles.sectionTitle}>{t('Shop by category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tilesPad}>
              {CATEGORY_TILES.map((c) => (
                <CategoryTile key={c.label} label={c.label} emoji={c.emoji} onPress={() => pickCategory(c.target)} />
              ))}
            </ScrollView>

            {/* the market — every LIVE listing, in the web's rails. Nothing
                backfills an empty rail, so when there is no stock the whole
                block is one plain line saying so. */}
            {loaded && items.length === 0 ? (
              <View style={styles.emptyMarket}>
                <Text style={styles.emptyEmoji}>🌾</Text>
                <Text style={styles.emptyMarketTitle}>
                  {shopping
                    ? `No farm near ${city} is selling direct yet.`
                    : 'No lots are open right now.'}
                </Text>
                <Text style={styles.emptyMarketBody}>
                  {shopping
                    ? 'We only show produce that can actually reach you. Pull down to refresh, or pick another city.'
                    : 'Pull down to refresh — new lots appear here the moment a farmer lists one.'}
                </Text>
                {shopping && cities.length > 0 ? (
                  <CityRow
                    cities={cities}
                    current={city}
                    saving={savingCity}
                    onPick={chooseCity}
                  />
                ) : null}
              </View>
            ) : null}

            {RAILS.map((rail) => {
              const railItems = items.filter((v) => v.cat === rail.id);
              if (railItems.length === 0) return null;
              return (
                <View key={rail.id}>
                  <View style={styles.railHead}>
                    <View>
                      <Mono style={styles.railEyebrow}>{rail.eyebrow.toUpperCase()}</Mono>
                      <Text style={styles.railTitle}>{rail.title}</Text>
                    </View>
                    <PressScale onPress={() => pickCategory(rail.id)} scaleTo={0.94}>
                      <Text style={styles.seeAll}>see all →</Text>
                    </PressScale>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
                    {railItems.map((v) => (
                      <ProductCard key={v.key} vm={v} width={164} action={actionLabel} liveWord={liveWord} shopping={shopping} cart={cartFor(v)} onPress={() => openCard(v)} />
                    ))}
                  </ScrollView>
                </View>
              );
            })}

            {/* how it works — compact strip + sell CTA, like the web footer run */}
            <Text style={styles.sectionTitle}>How CropBid works</Text>
            <View style={styles.howWrap}>
              {[
                ['01', 'Farmers list from the field', 'Crop, grade, quantity, price — without leaving the farm.'],
                ['02', 'You buy at their price', 'A pack for the week or a whole lot — the price you see is the farmer\'s own.'],
                ['03', 'Escrow keeps it safe', 'Money held on-platform; released when you confirm delivery.'],
              ].map(([n, t, d]) => (
                <View key={n} style={styles.howStep}>
                  <Mono style={styles.howN}>{n}</Mono>
                  <Text style={styles.howT}>{t}</Text>
                  <Text style={styles.howD}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sellCta}>
              <Text style={styles.sellTitle}>
                Grow it? <Text style={styles.sellItalic}>Sell it here.</Text>
              </Text>
              <Text style={styles.sellDesc}>
                {isFarmer
                  ? 'List your harvest in two minutes and keep the margin — no mandi trips, priced to today\'s live rates.'
                  : 'Registered farmers list in two minutes and keep the margin — no mandi trips, priced to today\'s live rates.'}
              </Text>
              <PressScale onPress={onSell} cardStyle={styles.sellBtn}>
                <Text style={styles.sellBtnText}>{isFarmer ? 'List your harvest' : 'Become a seller'}</Text>
              </PressScale>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {results.length} {results.length === 1 ? 'result' : 'results'}
              {q ? ` for “${search.trim()}”` : ''}
            </Text>
            {results.length > 0 ? (
              <View style={styles.grid}>
                {results.map((v) => (
                  <ProductCard key={v.key} vm={v} grid action={actionLabel} liveWord={liveWord} shopping={shopping} cart={cartFor(v)} onPress={() => openCard(v)} />
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🌾</Text>
                <Text style={styles.emptyText}>Nothing matches — try another crop.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* The running basket, riding the bottom of the shelf. This screen is a
          tab, so bottom:0 lands it directly on top of the tab bar with nothing
          to measure — hence overTabBar. It renders nothing for anyone but a
          shopper with something in it. */}
      <CartBar overTabBar />
    </View>
  );
}

// Forest marquee of mandi prices — the web storefront's top ticker, from the
// same static list. Two copies of the row scroll left in a seamless loop.
function TickerStrip({ board }: { board: RatesBoardData | null }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (w <= 0) return;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, { toValue: -w, duration: Math.max(w * 50, 13000), easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [w, x]);

  // Live govt rates when the API answered; static reference prices otherwise.
  // Reference entries carry a "ref" marker so a mixed board never passes a
  // fallback number off as a live one.
  const ticks = board
    ? board.rates.map((r) => ({ name: r.label, price: r.modal, unit: r.unit, delta: r.changePct, ref: r.source === 'reference' }))
    : TICKER.map((t) => ({ ...t, ref: true }));

  return (
    <View style={styles.ticker}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
        {[0, 1].map((copy) => (
          <View
            key={copy}
            style={styles.tickerRow}
            onLayout={copy === 0 ? (e) => setW(e.nativeEvent.layout.width) : undefined}
          >
            {ticks.map((t) => (
              <View key={`${copy}-${t.name}`} style={styles.tick}>
                <Mono style={styles.tickName}>{t.name.toUpperCase()}</Mono>
                <Mono style={styles.tickPrice}>{money(t.price)}/{unitLabel(t.unit)}</Mono>
                {t.ref ? (
                  <Mono style={[styles.tickDelta, { color: 'rgba(244,241,234,0.5)' }]}>ref</Mono>
                ) : Math.abs(t.delta) >= 0.1 ? (
                  <Mono style={[styles.tickDelta, { color: t.delta >= 0 ? design.leaf : colors.ember2 }]}>
                    {t.delta >= 0 ? '▲' : '▼'} {Math.abs(t.delta).toFixed(1)}%
                  </Mono>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// Today's mandi rates — the shared price anchor, as a horizontal rail right
// under the hero. Live govt numbers with a "vs usual" signal per crop; the
// "see all" opens the dedicated Rates screen with the market-wise breakdown.
function RatesRail({ board, onSeeAll }: { board: RatesBoardData | null; onSeeAll: () => void }) {
  const { t } = useTranslation();
  if (!board) return null;
  return (
    <View>
      <View style={styles.ratesHead}>
        {board.live ? <Pulse style={styles.liveDot} /> : null}
        <Text style={styles.ratesTitle}>{t("Today's mandi rates")}</Text>
        <PressScale onPress={onSeeAll} scaleTo={0.94} cardStyle={styles.ratesSeeAll}>
          <Text style={styles.ratesSeeAllText}>{t('see all →')}</Text>
        </PressScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratesPad}>
        {board.rates.map((r) => (
          <View key={r.commodity} style={styles.rateCard}>
            <View style={styles.rateTop}>
              <Text style={styles.rateEmoji}>{r.emoji}</Text>
              {Math.abs(r.changePct) >= 0.1 ? (
                <Mono style={[styles.rateDelta, { color: r.changePct >= 0 ? colors.forest : colors.ember2 }]}>
                  {r.changePct >= 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                </Mono>
              ) : (
                <Mono style={styles.rateSteady}>{r.source === 'reference' ? 'ref' : 'steady'}</Mono>
              )}
            </View>
            <Text style={styles.rateName}>{r.label}</Text>
            <Text style={styles.rateValue}>
              {money(r.modal)}
              <Text style={styles.rateUnit}>/{unitLabel(r.unit)}</Text>
            </Text>
            <Mono style={styles.rateBand}>{money(r.min)}–{money(r.max)}</Mono>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Blinkit-style rotating search hint: Search "tomato" → "fresh mango" → …
function RotatingHint() {
  const [idx, setIdx] = useState(0);
  const a = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(a, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % SEARCH_HINTS.length);
        Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 2600);
    return () => clearInterval(t);
  }, [a]);

  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [9, 0] });
  return (
    <View pointerEvents="none" style={styles.hintWrap}>
      <Text style={styles.hint}>Search “</Text>
      <Animated.Text style={[styles.hint, { opacity: a, transform: [{ translateY }] }]}>
        {SEARCH_HINTS[idx]}
      </Animated.Text>
      <Text style={styles.hint}>”</Text>
    </View>
  );
}

// Pill chip — the web's .st-chip: paper pill, forest fill when active.
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.94} cardStyle={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </PressScale>
  );
}

// The cities that actually have direct-sale stock, as pills. Not a free-text
// field: a typo would silently return an empty shelf, and only these cities
// can be served at all.
function CityRow({
  cities, current, saving, onPick,
}: {
  cities: Array<{ city: string; state: string }>;
  current: string;
  saving: string;
  onPick: (city: string) => void;
}) {
  return (
    <View style={styles.cityWrap}>
      {cities.map((c) => {
        const on = current.toLowerCase() === c.city.toLowerCase();
        return (
          <PressScale
            key={`${c.city}-${c.state}`}
            onPress={() => onPick(c.city)}
            scaleTo={0.94}
            cardStyle={[styles.cityPill, on && styles.cityPillOn]}
          >
            <Text style={[styles.cityPillText, on && styles.cityPillTextOn]}>
              {saving === c.city ? 'Saving…' : c.city}
            </Text>
            <Mono style={[styles.cityPillState, on && styles.cityPillTextOn]}>{c.state}</Mono>
          </PressScale>
        );
      })}
    </View>
  );
}

function PromoCard({
  tone, emoji, title, desc, onPress,
}: {
  tone: 'sage' | 'paper' | 'ember';
  emoji: string;
  title: string;
  desc: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.promo, styles[`promo_${tone}`]]}>
      <Text style={styles.promoEmoji}>{emoji}</Text>
      <Text style={styles.promoTitle}>{title}</Text>
      <Text style={styles.promoDesc}>{desc}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} scaleTo={0.96}>
      {body}
    </PressScale>
  );
}

// Square emoji tile — the web's .st-cat category tiles.
function CategoryTile({ label, emoji, onPress }: { label: string; emoji: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.94} cardStyle={styles.tile}>
      <View style={styles.tileImg}>
        <Text style={styles.tileEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
    </PressScale>
  );
}

// The basket wiring a card gets when the viewer can actually fill one. Built by
// cartFor() in the screen above; undefined means the card keeps its plain
// ADD / BID / VIEW label and just opens the lot.
interface CardCart {
  /** How much of this lot is already in the basket, in listing units. */
  inCart: number;
  pack: CartPack | null;
  unit: Unit;
  max: number;
  canAdd: boolean;
  onAdd: () => void;
  onChange: (q: number) => void;
  onRemove: () => void;
}

// Web .st-card: photo flush to the card top with the % OFF tag and grade chip
// overlaid, live line, name, meta, stock, price + struck anchor + the ADD
// control (or, once the lot is in the basket, the stepper that replaces it).
function ProductCard({
  vm, onPress, width, grid, action, liveWord, shopping, cart,
}: {
  vm: CardVM;
  onPress: () => void;
  width?: number;
  grid?: boolean;
  action: string;
  liveWord: string;
  shopping: boolean;
  cart?: CardCart;
}) {
  const pack = vm.pack;
  // Off the same pair of numbers the card prints below — a grouped card can
  // price its pack off one farmer's lot and its bulk line off another's, and a
  // badge computed from the other lot would advertise a discount nobody gets.
  const pct = pack ? pctOff(pack.price, pack.anchor) : pctOff(vm.price, vm.anchor);
  const img = vm.image ? mediaUrl(vm.image) : null;
  // Whatever the next screen will actually offer: the pack goes in the basket,
  // a direct-sale lot with no household pack (cotton, maize) is bought whole by
  // the quintal, and everything else is a bidding lot. Farmers and buyers keep
  // their own verb — they never see packs.
  const label = !shopping || pack ? action : vm.shop ? 'BUY' : 'BID';
  return (
    <PressScale
      onPress={onPress}
      style={grid ? styles.gridSlot : { width }}
      cardStyle={styles.card}
    >
      <View>
        {img ? (
          <FadeInImage uri={img} style={styles.cardPhoto} />
        ) : (
          <View style={[styles.cardPhoto, styles.photoEmpty]}>
            <Text style={styles.photoEmoji}>{vm.emoji ?? vm.name[0]}</Text>
          </View>
        )}
        {pct > 0 ? (
          <View style={styles.offTag}>
            <Text style={styles.offTagText}>{pct}% OFF</Text>
          </View>
        ) : null}
        <View style={styles.gradeChip}>
          <Mono style={styles.gradeChipText}>{vm.organic ? 'ORGANIC' : `GRADE ${vm.grade}`}</Mono>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.liveRow}>
          <Pulse style={styles.liveDotSm} />
          <Mono style={styles.liveText}>
            {vm.sellers > 1
              ? `${vm.sellers} FARMERS · ${liveWord}`
              : vm.trust != null
                ? `★ ${vm.trust} · ${liveWord}`
                : liveWord}
          </Mono>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>
          {vm.name}
          {vm.sellers === 1 && vm.variety ? ` · ${vm.variety}` : ''}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {vm.sellersMeta ?? `${vm.location}, ${vm.state}`}
        </Text>
        {/* running low beats pack framing — urgency is the more useful line */}
        <Text style={[styles.stock, vm.low && styles.stockLow]} numberOfLines={1}>
          {vm.low
            ? `Only ${vm.qty.toLocaleString('en-IN')} ${unitLabel(vm.unit)} left`
            : pack
              ? `${pack.label} pack · ${money(pack.perKg)}/${pack.perKgLabel}`
              : `${vm.qty.toLocaleString('en-IN')} ${unitLabel(vm.unit)} available`}
        </Text>
        <View style={styles.priceFoot}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.priceRow}>
              {vm.sellers > 1 ? <Text style={styles.fromWord}>from</Text> : null}
              <Text style={styles.price}>{money(pack ? pack.price : vm.price)}</Text>
              <Text style={styles.perUnit}>/{pack ? pack.suffix : unitLabel(vm.unit)}</Text>
            </View>
            {pct > 0 ? <Text style={styles.strike}>{money(pack ? pack.anchor : vm.anchor)}</Text> : null}
          </View>
          {/* ADDING HAPPENS ON THE CARD. The shelf is where a basket gets
              filled, so ADD puts the lot straight in and then turns into the
              quantity control — the shopper never leaves the row they are
              reading to change their mind about how much. Everyone else (a
              guest, a farmer, a buyer, a grouped card) keeps a plain label
              that opens the lot. */}
          {cart && cart.inCart > 0 ? (
            <QuantityStepper
              value={cart.inCart}
              onChange={cart.onChange}
              unit={cart.unit}
              pack={cart.pack}
              max={cart.max}
              size="sm"
              showUnit={false}
              onEmpty={cart.onRemove}
            />
          ) : cart ? (
            <Pressable
              onPress={cart.canAdd ? cart.onAdd : undefined}
              hitSlop={6}
              accessibilityLabel={`Add ${vm.name} to cart`}
              style={[styles.buyBtn, !cart.canAdd && styles.buyBtnOff]}
            >
              <Text style={styles.buyBtnText}>ADD</Text>
            </Pressable>
          ) : (
            <View style={styles.buyBtn}>
              <Text style={styles.buyBtnText}>{label}</Text>
            </View>
          )}
        </View>
        {/* the bulk lane — same lot, wholesale terms, for buyers who bid by the quintal */}
        {pack ? (
          <View style={styles.bulkRow}>
            <Mono style={styles.bulkTag}>BULK</Mono>
            <Text style={styles.bulkText} numberOfLines={1}>
              {money(vm.floor)}/{unitLabel(vm.unit)} · {vm.qty.toLocaleString('en-IN')} {unitLabel(vm.unit)}
            </Text>
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  // ticker — forest marquee strip
  ticker: { backgroundColor: colors.forest, paddingVertical: 6, overflow: 'hidden' },
  tickerRow: { flexDirection: 'row' },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14 },
  tickName: { fontSize: 10, letterSpacing: 0.6, color: 'rgba(244,241,234,0.75)' },
  tickPrice: { fontSize: 10, color: colors.textInverse },
  tickDelta: { fontSize: 9 },

  // header — cream, like the web's sticky header
  header: {
    backgroundColor: design.bg,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: design.paper2,
    borderWidth: 1,
    borderColor: design.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarLetter: { fontFamily: font.sansBold, fontSize: 14, color: colors.forest },
  loginPill: {
    backgroundColor: colors.forest,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  loginPillText: { fontFamily: font.sansBold, fontSize: 12.5, color: colors.textInverse },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: font.sans, fontSize: 14.5, color: design.ink },
  hintWrap: { position: 'absolute', left: 37, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center' },
  hint: { fontFamily: font.sans, fontSize: 14.5, color: design.ink3 },

  chipsPad: { paddingHorizontal: 16, gap: 8, marginTop: 10 },
  chip: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { fontFamily: font.sansSemi, color: colors.textInverse },

  errorLine: {
    fontFamily: font.sansMed,
    fontSize: 11.5,
    color: colors.ember,
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  // --- delivery city ---
  cityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cityBarText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  cityBarChange: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.forest },
  cityGate: { paddingHorizontal: 16, paddingTop: 24, gap: 8 },
  cityGateEyebrow: { fontSize: 10, letterSpacing: 1, color: design.ink3 },
  cityGateTitle: { fontFamily: font.sansSemi, fontSize: 21, letterSpacing: -0.3, color: design.ink },
  cityGateBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink2 },
  cityGateNote: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, marginTop: 6 },
  cityGateCancel: { fontFamily: font.sansSemi, fontSize: 13, color: design.ink3, marginTop: 14 },
  cityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cityPillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  cityPillText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  cityPillState: { fontSize: 10, color: design.ink3 },
  cityPillTextOn: { color: colors.textInverse },

  // --- empty market ---
  emptyMarket: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, gap: 8 },
  emptyMarketTitle: {
    fontFamily: font.sansSemi,
    fontSize: 16,
    letterSpacing: -0.2,
    color: design.ink,
    textAlign: 'center',
  },
  emptyMarketBody: {
    fontFamily: font.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: design.ink3,
    textAlign: 'center',
  },

  sectionTitle: {
    fontFamily: font.sansSemi,
    fontSize: 17,
    letterSpacing: -0.3,
    color: design.ink,
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },

  // hero banner — the web banner with the mandi photo under a forest shade
  banner: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 190,
  },
  bannerImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined },
  bannerShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,31,16,0.72)' },
  bannerContent: { padding: 20 },
  bannerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22,31,16,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  bannerChipText: { fontSize: 8.5, letterSpacing: 0.8, color: design.mint },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: design.leaf },
  bannerTitle: {
    fontFamily: font.sansMed,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.textInverse,
    marginTop: 12,
  },
  bannerItalic: { fontFamily: font.serifItalic, fontSize: 27, color: '#b6d493' },
  bannerTicks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  bannerTick: { fontFamily: font.sansMed, fontSize: 11, color: 'rgba(244,241,234,0.85)' },

  // promo trio — web .st-promo washes
  // live mandi rates rail
  ratesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
  ratesTitle: { fontFamily: font.sansSemi, fontSize: 17, letterSpacing: -0.3, color: design.ink },
  ratesSeeAll: { marginLeft: 'auto' },
  ratesSeeAllText: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.sage },
  ratesPad: { paddingHorizontal: 16, gap: 10 },
  rateCard: {
    width: 128,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 12,
    backgroundColor: design.paper,
  },
  rateTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  rateEmoji: { fontSize: 18 },
  rateDelta: { fontSize: 9.5 },
  rateSteady: { fontSize: 9.5, color: design.ink3 },
  rateName: { fontFamily: font.sansSemi, fontSize: 13, color: design.ink, marginTop: 6 },
  rateValue: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink, marginTop: 2 },
  rateUnit: { fontFamily: font.sans, fontSize: 10, color: design.ink3 },
  rateBand: { fontSize: 10, color: design.ink3, marginTop: 3 },

  promoPad: { paddingHorizontal: 16, gap: 10, marginTop: 12 },
  promo: { width: 200, borderRadius: 16, borderWidth: 1, borderColor: design.line, padding: 14 },
  promo_sage: { backgroundColor: 'rgba(107,142,78,0.14)' },
  promo_paper: { backgroundColor: design.paper },
  promo_ember: { backgroundColor: 'rgba(200,96,43,0.10)' },
  promoEmoji: { fontSize: 20 },
  promoTitle: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 6 },
  promoDesc: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 15, color: design.ink2, marginTop: 3 },

  // category tiles — web .st-cat
  tilesPad: { paddingHorizontal: 16, gap: 12 },
  tile: { alignItems: 'center', width: 74 },
  tileImg: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: design.paper2,
    borderWidth: 1,
    borderColor: design.lineLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 30 },
  tileLabel: { fontFamily: font.sansMed, fontSize: 10.5, color: design.ink, marginTop: 6, maxWidth: 74, textAlign: 'center' },

  // rails
  railHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  railEyebrow: { fontSize: 9, letterSpacing: 0.8, color: design.ink3 },
  railTitle: { fontFamily: font.sansSemi, fontSize: 18, letterSpacing: -0.35, color: design.ink, marginTop: 3 },
  seeAll: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.forest },
  railPad: { paddingHorizontal: 16, gap: 10 },

  // cards — web .st-card
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardPhoto: { width: '100%', height: 108, backgroundColor: design.paper2 },
  photoEmpty: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  photoEmoji: { fontSize: 40 },
  offTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.ember,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offTagText: { fontFamily: font.sansBold, fontSize: 9.5, color: '#fff', letterSpacing: 0.3 },
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
  cardBody: { padding: 10 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDotSm: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.sage },
  liveText: { fontSize: 8.5, letterSpacing: 0.6, color: '#4d6638' },
  cardName: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 4 },
  cardMeta: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 2 },
  stock: { fontFamily: font.sansMed, fontSize: 10.5, color: design.ink3, marginTop: 3 },
  stockLow: { color: colors.ember },
  priceFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { fontFamily: font.sansBold, fontSize: 14, color: design.ink },
  perUnit: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3 },
  fromWord: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3 },
  strike: { fontFamily: font.sans, fontSize: 11, color: design.ink3, textDecorationLine: 'line-through' },
  buyBtn: {
    borderWidth: 1.4,
    borderColor: colors.forest,
    backgroundColor: 'rgba(31,45,24,0.05)',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  buyBtnOff: { opacity: 0.45 },
  buyBtnText: { fontFamily: font.sansBold, fontSize: 11.5, color: colors.forest, letterSpacing: 0.5 },
  bulkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, paddingTop: 7,
    borderTopWidth: 1, borderTopColor: design.line, borderStyle: 'dashed',
  },
  bulkTag: {
    fontSize: 8.5, letterSpacing: 0.7, color: design.ink3,
    backgroundColor: design.paper2,
    borderWidth: 1, borderColor: design.line, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  bulkText: { flex: 1, fontFamily: font.sans, fontSize: 10, color: design.ink3 },

  // results grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  gridSlot: { width: '48%' },

  // how it works + sell CTA
  howWrap: { paddingHorizontal: 16, gap: 10 },
  howStep: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 14,
  },
  howN: { fontSize: 10, letterSpacing: 1, color: colors.ember },
  howT: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 4 },
  howD: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: design.ink2, marginTop: 2 },
  sellCta: {
    marginHorizontal: 16,
    marginTop: 22,
    backgroundColor: colors.forest,
    borderRadius: 20,
    padding: 20,
  },
  sellTitle: { fontFamily: font.sansMed, fontSize: 23, letterSpacing: -0.5, color: colors.textInverse },
  sellItalic: { fontFamily: font.serifItalic, fontSize: 24, color: '#b6d493' },
  sellDesc: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: 'rgba(244,241,234,0.78)', marginTop: 8 },
  sellBtn: {
    alignSelf: 'flex-start',
    backgroundColor: design.bg,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 14,
  },
  sellBtnText: { fontFamily: font.sansBold, fontSize: 13.5, color: colors.forest },

  empty: { alignItems: 'center', marginTop: 36, paddingHorizontal: 24, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center' },
});
