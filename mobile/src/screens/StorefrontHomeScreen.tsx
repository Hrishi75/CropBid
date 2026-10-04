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
import { Alert } from '../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconChevR, IconClock, IconPin, IconSearch, IconSprout } from '../components/icons';
import { Mono } from '../components/buyerKit';
import { LanguagePill } from '../components/LanguagePicker';
import { WalletPill } from '../components/WalletPill';
import { FreshBanner } from '../components/FreshBanner';
import { ShopCard } from '../components/ShopCard';
import { DeliveryList } from '../components/DeliveryList';
import { DemandTeaser } from '../components/DemandTeaser';
import { NotificationBell } from '../components/NotificationBell';
import { LoginSheet, type LoginSheetItem } from '../components/LoginSheet';
import { cropEmojiFor, cropImageFor, listingImage } from '../utils/cropImages';
import { Wordmark } from '../components/marks';
import { Appear, FadeInImage, PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { browse, retailCities, retailShops, updateLocation } from '../api/endpoints';
import api, { errorMessage, mediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { sellerWords } from '../lib/sellerType';
import { useCart, type CartPack } from '../context/CartContext';
import { CartBar } from '../components/CartBar';
import { QuantityStepper } from '../components/QuantityStepper';
import type { Listing, RetailShop, Unit } from '../api/types';
import { money, unitLabel } from '../lib/format';
import { useRatesTitleKey } from '../lib/ratesDate';
import {
  CATEGORY_TILES, CHIPS, RAILS, TICKER,
  packVariants, railFor, shopPack, type RailId, type ShopPack,
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
    // Rounded here, once. The raw score is a float, and the card printed it
    // whole: "★ 89.0658348402632 · LIVE LOT" over two lines.
    trust: l.farmer?.user?.trustScore != null ? Math.round(l.farmer.user.trustScore) : null,
    low: l.quantity > 0 && l.remainingQuantity / l.quantity <= 0.25,
  };
}

// Collapse every live lot of one crop into a single card: the cheapest lot
// fronts it (photo, price, grade), quantity is the combined stock, and the
// meta line says how many sellers there are and where. Lots of one crop can
// be listed in different units, so "cheapest" compares ₹ per kg.
//
// When the lots disagree on a unit the card needs one of its own: kilograms
// for a household, quintals for anyone trading lots, because "12,400 kg" and
// "₹17/kg" are not how a processor reads a wholesale onion lot.
const KG_PER_UNIT: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

function fromGroup(group: Listing[], mixedUnit: 'KG' | 'QUINTAL' = 'KG'): CardVM {
  const perKg = (l: Listing) =>
    (l.retailPricePerUnit ?? l.pricePerUnitMin) / (KG_PER_UNIT[l.unit] ?? 1);
  const sorted = [...group].sort((a, b) => perKg(a) - perKg(b));
  const base = fromListing(sorted[0]);
  if (sorted.length === 1) return base;
  // Stock and price in the shared unit when all lots agree, else per kg.
  const sameUnit = sorted.every((l) => l.unit === sorted[0].unit);
  // How many of the card's unit one of this lot's units is.
  const toCommon = (l: Listing) => (sameUnit ? 1 : (KG_PER_UNIT[l.unit] ?? 1) / KG_PER_UNIT[mixedUnit]);
  const baseFactor = toCommon(sorted[0]);
  const inStockUnit = (l: Listing, n: number) => n * toCommon(l);
  const qty = Math.round(sorted.reduce((s, l) => s + inStockUnit(l, l.remainingQuantity), 0) * 10) / 10;
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
      ? `${sorted.length} sellers · ${states[0]}`
      : `${sorted.length} sellers · ${states.length} states`,
    unit: sameUnit ? base.unit : mixedUnit,
    price: base.price / baseFactor,
    anchor: base.anchor / baseFactor,
    floor: base.floor / baseFactor,
    retail: base.retail == null ? null : base.retail / baseFactor,
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
  // Pressing the Home tab while already on Home scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
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
  const [citiesLoaded, setCitiesLoaded] = useState(false);
  const [savingCity, setSavingCity] = useState('');
  const [changingCity, setChangingCity] = useState(false);
  // The log-in card: from the header's Log in (no item, straight to the form)
  // or from a guest's ADD or size (the item they tapped). The item outlives
  // `open` so the card keeps its content while it slides away.
  const [askItem, setAskItem] = useState<LoginSheetItem | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  // WHICH HALF OF THE SHELF. Local shops hold stock a few streets away and send
  // it round today; Fresh is the farm side, bought at tomorrow's mandi and
  // delivered next morning. Two genuinely different supply lines, so the
  // shopper picks one rather than discovering which they got per card.
  //
  // Shops first, because that is what a household reaches for on a weekday, and
  // because the shop is the unit this storefront is built around (CLAUDE.md §3).
  const [lane, setLane] = useState<'shops' | 'fresh'>('shops');
  const [shops, setShops] = useState<RetailShop[]>([]);
  const board = useLiveRates();

  const role = user?.role;
  const isFarmer = role === 'FARMER';
  // A local shop sells to households only, so the trade pieces of this screen
  // (buyer demand, the bidding banner, sell-or-hold forecasts, farm schemes)
  // are left out for it.
  const isShop = isFarmer && user?.farmerProfile?.sellerType === 'LOCAL_SHOP';
  // A wholesaler trades lots it did not grow, so the farm wording (farmer
  // lots, farm-fresh, farm schemes, "Grow it?") is swapped for trade wording.
  const isWholesaler = isFarmer && user?.farmerProfile?.sellerType === 'WHOLESALER';
  // A business buyer (or a seller in buying mode) is here to source, so the
  // farm-facing pieces (schemes, the sell pitch) are left out for it too.
  const isBuyer = role === 'BUYER';
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
  // Read off the served-city list rather than stored, so it can only name a
  // state that city is actually listed under. Blank until that list arrives.
  const servedCity = cities.find((c) => c.city.toLowerCase() === city.toLowerCase());
  const cityState = servedCity?.state ?? '';
  // A saved city CropBid no longer delivers to (Pune, from 2026-10-03) sends
  // the shopper back to the picker instead of an empty shelf they cannot order
  // from. Only once the list has arrived with something in it: before then, or
  // when nothing is on sale anywhere, there is no list to judge the city by.
  const cityDropped = city !== '' && citiesLoaded && cities.length > 0 && !servedCity;
  const needsCity = shopping && (city === '' || changingCity || cityDropped);

  // Which cities can be served at all — needed before any produce is fetched
  // for a shopper, and again whenever they want to change city.
  useEffect(() => {
    if (!shopping) return;
    let on = true;
    retailCities()
      .then((rows) => { if (on) { setCities(rows); setCitiesLoaded(true); } })
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

  // The city's shops, for the Local shops lane.
  //
  // Its own call rather than something derived from `listings`, because the
  // server already groups a seller's whole shelf into one row with an item
  // count, a crop list and a cheapest price. Rebuilding that here from a page
  // of listings would get the count wrong the moment the listing feed is
  // paginated, which it is.
  //
  // ONLY SELLERS HOLDING LIVE STOCK come back, so a shop that has just
  // onboarded appears as soon as it lists something and drops off when it sells
  // out. That is the endpoint's behaviour, not a filter kept in step here.
  const loadShops = useCallback(async () => {
    if (!shopping || needsCity) { setShops([]); return; }
    try {
      setShops(await retailShops(city));
    } catch {
      // Silent: the Fresh lane and the rest of the screen still work, and the
      // lane's own empty state covers it.
      setShops([]);
    }
  }, [shopping, city, needsCity]);

  useEffect(() => { void loadShops(); }, [loadShops]);

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
    // Both lanes, whichever is showing. A pull is "make this screen current",
    // and switching tabs afterwards to find stale shops would undo that.
    await Promise.all([load(), loadShops()]);
    setRefreshing(false);
  }, [load, loadShops]);

  /** Only the shops. Farms are the Fresh lane and have their own half. */
  const localShops = useMemo(
    () => shops.filter((sh) => sh.sellerType === 'LOCAL_SHOP'),
    [shops],
  );

  // One card per CROP, not per lot: when several farmers sell the same crop
  // their lots collapse into a grouped card that opens the CropSellers
  // comparison screen. Nothing is added underneath — an empty market renders
  // empty, and says so.
  const items = useMemo<CardVM[]>(() => {
    const byCrop = new Map<string, Listing[]>();
    // FRESH IS THE FARM SIDE. A local shop's stock is reachable through its own
    // shop page in the other lane, so leaving it in the rails as well would put
    // the same tomato on the screen twice under two different framings, one
    // promising today and the other promising tomorrow morning.
    //
    // Only for shoppers: a farmer or a buyer is looking at the whole open
    // market on purpose, and there are no lanes in that view.
    const source = shopping
      ? listings.filter((l) => l.farmer?.sellerType !== 'LOCAL_SHOP')
      : listings;
    for (const l of source) {
      const key = l.cropName.trim().toLowerCase();
      const group = byCrop.get(key);
      if (group) group.push(l);
      else byCrop.set(key, [l]);
    }
    const all = [...byCrop.values()].map((g) => fromGroup(g, shopping ? 'KG' : 'QUINTAL'));
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

  /**
   * Every farm lot a household can actually be delivered, one row per LOT.
   *
   * Not grouped by crop the way the rails are: two farmers selling tomatoes at
   * different prices are two different things to buy here, and collapsing them
   * would hide the cheaper one behind whichever card won. The rails group
   * because they are answering "what does a tomato cost"; this list is the
   * order form.
   *
   * Priced first, because a lot with no retail price is open for bidding rather
   * than for the shelf.
   */
  const deliverable = useMemo(
    () => listings
      .filter((l) =>
        l.farmer?.sellerType !== 'LOCAL_SHOP' &&
        l.directSaleEnabled &&
        l.retailPricePerUnit != null &&
        l.remainingQuantity > 0)
      .map((listing) => ({
        listing,
        variants: packVariants({
          crop: listing.cropName,
          cat: railFor(listing.cropName),
          unit: listing.unit,
          floor: listing.retailPricePerUnit!,
          ceiling: listing.retailPricePerUnit!,
          retail: listing.retailPricePerUnit,
          stockUnits: listing.remainingQuantity,
        }),
      }))
      // A bulk-only crop (cotton, maize) has no household pack, and a lot can
      // be too small for even its smallest one. Dropped HERE rather than inside
      // the row, so the heading's count matches what is underneath it.
      .filter((r) => r.variants.length > 0),
    [listings],
  );

  /** The basket wiring one delivery row gets. Signed-in shoppers only. */
  const deliveryCart = useCallback(
    (l: Listing) => ({
      inCart: quantityOf(l.id),
      add,
      setQuantity,
      remove,
    }),
    [quantityOf, add, setQuantity, remove],
  );

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

  // The ADD a guest gets: the same lots a shopper could add (one seller, open
  // for direct sale), but it opens the log-in card instead of the basket.
  const guestAddFor = (v: CardVM) => {
    const l = v.listing;
    if (user || !shopping || v.sellers > 1 || !l || !l.directSaleEnabled || l.retailPricePerUnit == null) {
      return undefined;
    }
    return () => askToLogIn({
      name: v.name,
      size: v.pack ? v.pack.label : `1 ${unitLabel(l.unit)}`,
      price: money(v.pack ? v.pack.price : l.retailPricePerUnit!, l.currency),
      image: listingImage(l),
    });
  };

  const askToLogIn = (item: LoginSheetItem) => {
    setAskItem(item);
    setAskOpen(true);
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
      {/* The status bar sits on a fixed forest strip, so whatever scrolls
          up beneath it never runs under the clock and the notch. */}
      <View style={{ height: insets.top, backgroundColor: colors.forest, zIndex: 2 }} />

      {/* ONE SCROLL, WITH A STICKY SEARCH. The ticker and the logo row scroll
          away with the page, and the search bar and category chips pin to the
          top (stickyHeaderIndices). They used to be fixed, all four of them,
          and held about a third of the screen while only the rest scrolled. */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: cartCount > 0 ? 96 : 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.topBlock}>
          <TickerStrip board={board} />
          <View style={styles.headerRow}>
            <Wordmark size={19} />
            <View style={styles.headerRight}>
              {/* Renders nothing when signed out: a zero balance on an account
                  that does not exist is not a fact about anything. */}
              <WalletPill />
              <LanguagePill />
              <NotificationBell />
              {user ? (
                <PressScale onPress={() => nav.navigate('You')} cardStyle={styles.avatar}>
                  {user.avatar ? (
                    <FadeInImage uri={mediaUrl(user.avatar)!} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarLetter}>{(user.name?.[0] ?? '·').toUpperCase()}</Text>
                  )}
                </PressScale>
              ) : (
                <PressScale onPress={() => { setAskItem(null); setAskOpen(true); }} cardStyle={styles.loginPill}>
                  <Text style={styles.loginPillText}>{t('Log in')}</Text>
                </PressScale>
              )}
            </View>
          </View>
        </View>

        <View style={styles.stickyBar}>
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
            {/* A buyer is offered only the categories with a lot open in
                them: a chip that leads to an empty rail is a dead end. */}
            {CHIPS.filter((c) => !isBuyer || c.target == null || items.some((v) => v.cat === c.target)).map((c) => (
              <Chip
                key={c.label}
                label={c.label}
                selected={category === c.target}
                onPress={() => pickCategory(c.target)}
              />
            ))}
          </ScrollView>
        </View>

        <View>
        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        {/* Where the basket goes, as one tappable row rather than a sentence
            with a small "change" link at the far edge: the whole bar is the
            target, so changing city is never a hunt. */}
        {shopping && !needsCity ? (
          <PressScale onPress={() => setChangingCity(true)} scaleTo={0.98} style={styles.cityBarWrap} cardStyle={styles.cityBar}>
            <View style={styles.cityBarIcon}>
              <IconPin size={17} stroke={colors.forest} />
            </View>
            <View style={styles.grow}>
              <Mono style={styles.cityBarEyebrow}>DELIVERING TO</Mono>
              <Text style={styles.cityBarText} numberOfLines={1}>
                {city}
                {cityState ? <Text style={styles.cityBarState}>, {cityState}</Text> : null}
              </Text>
            </View>
            <Text style={styles.cityBarChange}>Change</Text>
            <IconChevR size={11} stroke={colors.forest} />
          </PressScale>
        ) : null}

        {/* TWO SUPPLY LINES, PICKED RATHER THAN DISCOVERED. Local shops hold
            stock a few streets away and send it round today; Fresh is bought at
            tomorrow's mandi and delivered next morning. Neither is the better
            one, so they sit side by side rather than one being the default and
            the other buried.

            Shoppers only. A buyer sourcing by the tonne has no lanes, and a
            farmer is looking at the open market. */}
        {shopping && !needsCity ? (
          <View style={styles.laneBar}>
            <LaneTab
              icon="shops"
              label={t('Local shops')}
              sub={t('Today')}
              count={localShops.length}
              on={lane === 'shops'}
              onPress={() => { glide(); setLane('shops'); }}
            />
            <LaneTab
              icon="fresh"
              label={t('Fresh')}
              sub={t('Tomorrow AM')}
              count={items.length}
              on={lane === 'fresh'}
              onPress={() => { glide(); setLane('fresh'); }}
            />
          </View>
        ) : null}

        {/* The cutoff, on the Fresh lane only. It is the deadline that decides
            whether an order makes tomorrow's mandi run, so it belongs with the
            produce it governs rather than over the whole screen. */}
        {shopping && !needsCity && lane === 'fresh' ? <FreshBanner /> : null}

        {needsCity ? (
          /* Asked before any produce is shown. An order that cannot be
             delivered is worse than an empty shop, so the city comes first. */
          <View style={styles.cityGate}>
            <View style={styles.cityGateCard}>
              <View style={styles.cityGateIcon}>
                <IconPin size={22} stroke={colors.forest} />
              </View>
              <Mono style={styles.cityGateEyebrow}>DELIVERY</Mono>
              <Text style={styles.cityGateTitle}>Where should we deliver?</Text>
              {cityDropped ? (
                <Text style={styles.cityGateDropped}>
                  We don't deliver to homes in {city} at the moment. Pick a city
                  we serve to see what can reach you.
                </Text>
              ) : null}
              {/* Shops and farms, not "farms": most of what a household is
                  shown is a local shop's counter, which is not a farm. */}
              <Text style={styles.cityGateBody}>
                Fresh produce travels short distances. Pick your city and we'll
                show you the shops and farms that can actually reach you.
              </Text>
              {cities.length === 0 ? (
                <Text style={styles.cityGateNote}>
                  Nobody is selling for home delivery yet. Check back shortly:
                  shops and farms open their shelves as stock comes in.
                </Text>
              ) : (
                <CityList cities={cities} current={city} saving={savingCity} onPick={chooseCity} />
              )}
            </View>
            {city && !cityDropped ? (
              <PressScale onPress={() => setChangingCity(false)} scaleTo={0.94} style={styles.cityGateCancelWrap}>
                <Text style={styles.cityGateCancel}>Keep {city}</Text>
              </PressScale>
            ) : null}
          </View>
        ) : shopping && lane === 'shops' ? (
          /* ---- Local shops ------------------------------------------------
             The shop is the unit. A card per counter, not per crop, so the
             price difference between two shops selling the same tomato is
             visible rather than averaged away (CLAUDE.md §3). Tapping one opens
             its whole shelf. */
          <View style={styles.shopsPad}>
            {!loaded ? null : localShops.length > 0 ? (
              <>
                <Mono style={styles.shopsLabel}>
                  {localShops.length} {localShops.length === 1 ? t('SHOP') : t('SHOPS')} ·{' '}
                  {city.toUpperCase()}
                </Mono>
                {localShops.map((sh, i) => (
                  <Appear key={sh.id} index={i}>
                    <ShopCard
                      shop={sh}
                      onPress={() => nav.navigate('Shop', { id: sh.id, city })}
                    />
                  </Appear>
                ))}
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🏪</Text>
                <Text style={styles.emptyText}>
                  {t('No shop in')} {city} {t('is selling today.')}
                </Text>
                <Text style={styles.emptySub}>
                  {t('Try Fresh for produce arriving tomorrow morning.')}
                </Text>
              </View>
            )}
          </View>
        ) : browsing ? (
          <>
            {/* What buyers are asking for, first, for a farmer: it is work they
                can win today, and the board was otherwise only reachable from
                the bottom of My Farm. */}
            {isFarmer && !isShop ? <DemandTeaser onOpen={() => nav.navigate('Demand')} /> : null}

            {/* hero banner — the web banner with the mandi photo */}
            {!isShop ? (
              <View style={styles.banner}>
                <Image source={require('../../assets/mandi.jpg')} style={styles.bannerImg} resizeMode="cover" />
                <View style={styles.bannerShade} />
                <View style={styles.bannerContent}>
                  <View style={styles.bannerChip}>
                    <Pulse style={styles.liveDot} />
                    <Mono style={styles.bannerChipText}>
                      {listings.length > 0
                        ? `LIVE · ${listings.length} ${isWholesaler || isBuyer ? '' : 'FARMER '}${listings.length === 1 ? 'LOT' : 'LOTS'}${isBuyer ? ' OPEN' : ''}${city ? ` IN ${city.toUpperCase()}` : ''}`
                        : 'STRAIGHT FROM THE FARM · ESCROW SETTLED'}
                    </Mono>
                  </View>
                  {isBuyer ? (
                    <Text style={styles.bannerTitle}>
                      Source by the lot,{'\n'}
                      <Text style={styles.bannerItalic}>priced</Text> to the mandi.
                    </Text>
                  ) : isWholesaler ? (
                    <Text style={styles.bannerTitle}>
                      Trade by the lot,{'\n'}
                      <Text style={styles.bannerItalic}>priced</Text> to the mandi.
                    </Text>
                  ) : (
                    <Text style={styles.bannerTitle}>
                      Farm-fresh crops,{'\n'}
                      <Text style={styles.bannerItalic}>farmer-fair</Text> prices.
                    </Text>
                  )}
                  <View style={styles.bannerTicks}>
                    <Text style={styles.bannerTick}>✓ {isBuyer ? t('Bid or counter on any lot') : t('Open bidding & auctions')}</Text>
                    <Text style={styles.bannerTick}>✓ {t('Escrow settlement')}</Text>
                    <Text style={styles.bannerTick}>✓ {isWholesaler || isBuyer ? t('Delivery booked for you') : t('Farm to door')}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* today's live mandi rates — the shared price anchor, up front */}
            <RatesRail board={board} onSeeAll={() => nav.navigate('Rates')} />

            {/* promo rail — the web's sage/paper/ember cards */}
            {/* A shop has one card here, so it runs full width rather than
                sitting half-empty in a rail. */}
            {/* A buyer has one card here too, the forecast, worded for buying. */}
            {isBuyer ? (
              <View style={styles.promoSolo}>
                <PromoCard
                  wide
                  tone="paper"
                  emoji="📈"
                  title={t('Where prices go next')}
                  desc={t('7-day outlook for every crop: buy now, or wait?')}
                  onPress={() => nav.navigate('Rates', { tab: 'forecast' })}
                />
              </View>
            ) : isShop ? (
              <View style={styles.promoSolo}>
                <PromoCard
                  wide
                  tone="ember"
                  emoji="🌾"
                  title={t(sellerWords(user).listCta)}
                  desc={t('Put an item on your shelf for households in your city.')}
                  onPress={onSell}
                />
              </View>
            ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoPad}>
              {/* A seller's first card is the thing they came to do. Worded by
                  seller kind (lib/sellerType), so a shop is not told to list a
                  harvest. */}
              {isFarmer ? (
                <PromoCard
                  tone="ember"
                  emoji="🌾"
                  title={t(sellerWords(user).listCta)}
                  desc={t("Put a lot in front of buyers, priced against today's mandi rate.")}
                  onPress={onSell}
                />
              ) : null}
              <PromoCard tone="paper" emoji="📈" title={t('Where prices go next')} desc={t('7-day outlook for every crop — sell now or hold?')} onPress={() => nav.navigate('Rates', { tab: 'forecast' })} />
              {/* Farm schemes (PM-Kisan, fasal bima) are for growers. */}
              {!isWholesaler && !isBuyer ? <PromoCard tone="sage" emoji="🏛️" title={t('Sarkari Yojana')} desc={t("PM-Kisan, fasal bima, KCC loans — find every govt scheme you're owed.")} onPress={() => nav.navigate('Schemes')} /> : null}
              {/* Household packs are a shopper's offer; a farmer or a bulk
                  buyer is not buying by the pack. */}
              {shopping ? (
                <PromoCard tone="paper" emoji="🧺" title={t('Buy direct, no bidding')} desc={t('Household packs at the farmer’s own price.')} />
              ) : null}
            </ScrollView>
            )}

            {/* shop by category — web's tile row */}
            {/* A farmer or a buyer is browsing the market, not shopping. */}
            {/* Not for a buyer: the chips under the search already pick a
                category, and a second row of the same choices is in the way of
                the lots. */}
            {isBuyer ? null : (
              <>
                <Text style={styles.sectionTitle}>{shopping ? t('Shop by category') : t('Browse by category')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tilesPad}>
                  {CATEGORY_TILES.map((c) => (
                    <CategoryTile key={c.label} label={c.label} emoji={c.emoji} onPress={() => pickCategory(c.target)} />
                  ))}
                </ScrollView>
              </>
            )}

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
                      {/* A buyer gets what is open, not "picked this week":
                          nothing checks when a lot was harvested (§2b). */}
                      <Mono style={styles.railEyebrow}>
                        {isBuyer
                          ? `${railItems.length} ${railItems.length === 1 ? 'CROP' : 'CROPS'} · ${railItems.reduce((n, v) => n + v.sellers, 0)} LOTS OPEN`
                          : rail.eyebrow.toUpperCase()}
                      </Mono>
                      <Text style={styles.railTitle}>{rail.title}</Text>
                    </View>
                    <PressScale onPress={() => pickCategory(rail.id)} scaleTo={0.94}>
                      <Text style={styles.seeAll}>see all →</Text>
                    </PressScale>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
                    {railItems.map((v) => (
                      <ProductCard key={v.key} vm={v} width={164} action={actionLabel} liveWord={liveWord} shopping={shopping} cart={cartFor(v)} onGuestAdd={guestAddFor(v)} onPress={() => openCard(v)} />
                    ))}
                  </ScrollView>
                </View>
              );
            })}

            {/* EVERYTHING WE CAN DELIVER, in one column with the sizes on it.
                The rails above answer "what is the going rate for tomatoes";
                this answers "what can I actually get, and how much of it".
                Shoppers only: a farmer or buyer works in lots, not packs. */}
            {shopping && deliverable.length > 0 ? (
              <>
                <View style={styles.railHead}>
                  <View>
                    <Mono style={styles.railEyebrow}>TOMORROW MORNING</Mono>
                    <Text style={styles.railTitle}>Everything we deliver</Text>
                  </View>
                  <Mono style={styles.deliverCount}>
                    {deliverable.length} {deliverable.length === 1 ? 'ITEM' : 'ITEMS'}
                  </Mono>
                </View>
                <DeliveryList
                  rows={deliverable}
                  cart={isConsumer ? deliveryCart : null}
                  onOpen={(l) => nav.navigate('ListingDetail', { id: l.id, preview: l })}
                  onGuestPick={user ? undefined : (l, v) => askToLogIn({
                    name: l.cropName,
                    size: v.label,
                    price: money(v.price, l.currency),
                    image: listingImage(l),
                  })}
                />
              </>
            ) : null}

            {/* how it works — compact strip + sell CTA, like the web footer run.
                Not for a farmer: they already sell here, and the steps are
                written from the buyer's side ("You buy at their price"). */}
            {/* Nor for a buyer: they were approved to trade here, and the
                steps are written for a household buying a pack. */}
            {!isFarmer && !isBuyer ? (
              <>
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
              </>
            ) : null}

            {/* A shop or a wholesaler is already selling here, and "Grow it?"
                is not a question for either; the pitch is for everyone else. */}
            {!isShop && !isWholesaler && !isBuyer ? (
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
                  <Text style={styles.sellBtnText}>{isFarmer ? sellerWords(user).listCta : 'Become a seller'}</Text>
                </PressScale>
              </View>
            ) : null}

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
                  <ProductCard key={v.key} vm={v} grid action={actionLabel} liveWord={liveWord} shopping={shopping} cart={cartFor(v)} onGuestAdd={guestAddFor(v)} onPress={() => openCard(v)} />
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
        {/* THE FOOTER, outside every branch above. This screen is the only
            surface a signed-out visitor ever sees and they have no Profile tab,
            so the policies have to hang off it. Outside the `browsing` branch
            specifically because the city gate renders instead of it, and that
            gate is the FIRST thing a visitor meets: somebody deciding whether
            to hand over a phone number is entitled to read the privacy policy
            before they do. */}
        <View style={styles.footerLinks}>
          <FooterLink label="Help" onPress={() => nav.navigate('Help')} />
          <FooterLink label="About" onPress={() => nav.navigate('About')} />
          <FooterLink label="Privacy" onPress={() => nav.navigate('Policy', { kind: 'privacy' })} />
          <FooterLink label="Terms" onPress={() => nav.navigate('Policy', { kind: 'terms' })} />
        </View>
        <Mono style={styles.footerNote}>CROPBID · INDIA</Mono>
        </View>
      </ScrollView>

      {/* The running basket, riding the bottom of the shelf. This screen is a
          tab, so bottom:0 lands it directly on top of the tab bar with nothing
          to measure — hence overTabBar. It renders nothing for anyone but a
          shopper with something in it. */}
      <CartBar overTabBar />

      <LoginSheet
        item={askItem}
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        onForgot={() => nav.navigate('ForgotPassword')}
        onSignup={() => nav.navigate('Signup')}
      />
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.footerLink}>{label}</Text>
    </Pressable>
  );
}

/**
 * One of the two supply lines, as a tab.
 *
 * Carries its own count, so an empty lane announces itself before it is opened
 * rather than after. A tab that says nothing about its contents makes the
 * shopper tap it just to find out there is nothing there.
 */
function LaneTab({
  icon, label, sub, count, on, onPress,
}: {
  icon: 'shops' | 'fresh';
  label: string;
  sub: string;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  const tint = on ? colors.surface : colors.forest;
  return (
    // flex:1 on the Pressable as well as the card. PressScale puts cardStyle on
    // the inner animated view, so with flex on the card alone the Pressable
    // hugged its content and the label (itself flex:1) collapsed to nothing:
    // "Local shops" rendered as a bare cursor-thin line beside its count.
    <PressScale onPress={onPress} scaleTo={0.97} style={styles.grow} cardStyle={[styles.laneTab, on && styles.laneTabOn]}>
      <View style={[styles.laneTabIcon, on && styles.laneTabIconOn]}>
        {icon === 'shops' ? <IconClock size={16} stroke={tint} /> : <IconSprout size={16} stroke={tint} />}
      </View>
      <View style={styles.grow}>
        <View style={styles.laneTabTop}>
          <Text style={[styles.laneTabLabel, on && styles.laneTabLabelOn]} numberOfLines={1}>
            {label}
          </Text>
          {/* A badge, not a loose digit: a pill reads as a count at any label
              length and cannot collide with the word. */}
          <View style={[styles.laneTabBadge, on && styles.laneTabBadgeOn]}>
            <Mono style={[styles.laneTabCount, on && styles.laneTabCountOn]}>{String(count)}</Mono>
          </View>
        </View>
        <Mono style={[styles.laneTabSub, on && styles.laneTabSubOn]}>
          {sub.toUpperCase()}
        </Mono>
      </View>
    </PressScale>
  );
}

// The city gate's picker: one full-width row per served city. Bigger targets
// than the pills, and room to say which city is the current one.
function CityList({
  cities, current, saving, onPick,
}: {
  cities: Array<{ city: string; state: string }>;
  current: string;
  saving: string;
  onPick: (city: string) => void;
}) {
  return (
    <View style={styles.cityList}>
      {cities.map((c) => {
        const on = current.toLowerCase() === c.city.toLowerCase();
        return (
          <PressScale
            key={`${c.city}-${c.state}`}
            onPress={() => onPick(c.city)}
            scaleTo={0.98}
            cardStyle={[styles.cityRow, on && styles.cityRowOn]}
          >
            <View style={[styles.cityRowIcon, on && styles.cityRowIconOn]}>
              <IconPin size={16} stroke={on ? colors.surface : colors.forest} />
            </View>
            <View style={styles.grow}>
              <Text style={[styles.cityRowName, on && styles.cityRowNameOn]}>
                {saving === c.city ? 'Saving…' : c.city}
              </Text>
              <Mono style={[styles.cityRowState, on && styles.cityRowStateOn]}>
                {on ? `${c.state.toUpperCase()} · CURRENT` : c.state.toUpperCase()}
              </Mono>
            </View>
            <IconChevR size={12} stroke={on ? colors.surface : design.ink3} />
          </PressScale>
        );
      })}
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
  const title = useRatesTitleKey(board);
  if (!board) return null;
  return (
    <View>
      <View style={styles.ratesHead}>
        {board.live ? <Pulse style={styles.liveDot} /> : null}
        <Text style={styles.ratesTitle}>{t(title)}</Text>
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
  tone, emoji, title, desc, onPress, wide,
}: {
  tone: 'sage' | 'paper' | 'ember';
  emoji: string;
  title: string;
  desc: string;
  onPress?: () => void;
  /** Full width, for when it is the only card and a rail would leave a gap. */
  wide?: boolean;
}) {
  const body = (
    <View style={[styles.promo, styles[`promo_${tone}`], wide && styles.promoWide]}>
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
  vm, onPress, width, grid, action, liveWord, shopping, cart, onGuestAdd,
}: {
  vm: CardVM;
  onPress: () => void;
  width?: number;
  grid?: boolean;
  action: string;
  liveWord: string;
  shopping: boolean;
  cart?: CardCart;
  /** A signed-out visitor pressing ADD: asks them to log in. Guests only. */
  onGuestAdd?: () => void;
}) {
  const pack = vm.pack;
  // Off the same pair of numbers the card prints below — a grouped card can
  // price its pack off one farmer's lot and its bulk line off another's, and a
  // badge computed from the other lot would advertise a discount nobody gets.
  //
  // Nothing for anyone trading lots: on a bidding lot the two numbers are the
  // seller's floor and ceiling, so "6% OFF ₹47,000" would call their opening
  // range a discount.
  const pct = !shopping ? 0 : pack ? pctOff(pack.price, pack.anchor) : pctOff(vm.price, vm.anchor);
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
            <Text style={styles.photoEmoji}>{vm.emoji ?? cropEmojiFor(vm.name)}</Text>
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
              ? `${vm.sellers} SELLERS · ${liveWord}`
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
          ) : onGuestAdd ? (
            // A guest's ADD is a real button that asks them to log in, rather
            // than a label that falls through to opening the lot: they pressed
            // ADD, so the answer is about adding.
            <Pressable
              onPress={onGuestAdd}
              hitSlop={6}
              accessibilityLabel={`Add ${vm.name} to cart`}
              style={styles.buyBtn}
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
  grow: { flex: 1 },

  // ticker — forest marquee strip
  ticker: { backgroundColor: colors.forest, paddingVertical: 6, overflow: 'hidden' },
  tickerRow: { flexDirection: 'row' },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14 },
  tickName: { fontSize: 10, letterSpacing: 0.6, color: 'rgba(244,241,234,0.75)' },
  tickPrice: { fontSize: 10, color: colors.textInverse },
  tickDelta: { fontSize: 9 },

  // header — cream, like the web's sticky header
  topBlock: { backgroundColor: design.bg },
  stickyBar: {
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

  // One segmented control, not two loose cards: the two lanes are a choice
  // between alternatives, and a shared track says so.
  laneBar: {
    flexDirection: 'row', gap: 4,
    marginHorizontal: 16, marginTop: 10, padding: 4,
    backgroundColor: design.paper2, borderRadius: 16,
  },
  laneTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10,
  },
  laneTabOn: {
    backgroundColor: colors.forest,
    shadowColor: colors.forest, shadowOpacity: 0.18, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  laneTabIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.mint,
  },
  laneTabIconOn: { backgroundColor: 'rgba(244,241,234,0.14)' },
  laneTabTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // flexShrink, not flex:1, so the count sits right after the word instead of
  // being pushed to the far edge of a half-width segment.
  laneTabLabel: { flexShrink: 1, fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  laneTabLabelOn: { color: colors.surface },
  laneTabBadge: {
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999, backgroundColor: design.paper, alignItems: 'center',
  },
  laneTabBadgeOn: { backgroundColor: 'rgba(244,241,234,0.18)' },
  laneTabCount: { fontSize: 10.5, color: design.ink2 },
  laneTabCountOn: { color: colors.surface },
  laneTabSub: { fontSize: 9, letterSpacing: 0.6, color: design.ink3, marginTop: 3 },
  laneTabSubOn: { color: colors.sage2 },

  shopsPad: { paddingHorizontal: 16, paddingTop: 14 },
  shopsLabel: { fontSize: 10, letterSpacing: 1.2, color: design.ink3, marginBottom: 12 },
  emptySub: { fontFamily: font.sans, fontSize: 13, color: design.ink3, marginTop: 6, textAlign: 'center' },
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
  cityBarWrap: { marginHorizontal: 16, marginTop: 12 },
  cityBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  cityBarIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  cityBarEyebrow: { fontSize: 9, letterSpacing: 0.9, color: design.ink3 },
  cityBarText: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink, marginTop: 1 },
  cityBarState: { fontFamily: font.sans, color: design.ink3 },
  cityBarChange: { fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
  cityGate: { paddingHorizontal: 16, paddingTop: 18 },
  cityGateCard: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: 20,
    padding: 18, gap: 8,
  },
  cityGateIcon: {
    width: 44, height: 44, borderRadius: 22, marginBottom: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  cityGateEyebrow: { fontSize: 10, letterSpacing: 1, color: design.ink3 },
  cityGateTitle: { fontFamily: font.sansSemi, fontSize: 22, letterSpacing: -0.3, color: design.ink },
  cityGateBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink2 },
  cityGateDropped: {
    fontFamily: font.sansMed, fontSize: 13.5, lineHeight: 19, color: colors.ember,
    backgroundColor: 'rgba(200,96,43,0.08)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  cityGateNote: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, marginTop: 6 },
  cityGateCancelWrap: { alignSelf: 'center', marginTop: 14, paddingVertical: 6, paddingHorizontal: 12 },
  cityGateCancel: { fontFamily: font.sansSemi, fontSize: 13, color: design.ink3 },
  cityList: { gap: 8, marginTop: 10 },
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: design.bg,
    borderWidth: 1, borderColor: design.line, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  cityRowOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  cityRowIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  cityRowIconOn: { backgroundColor: 'rgba(244,241,234,0.14)' },
  cityRowName: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  cityRowNameOn: { color: colors.surface },
  cityRowState: { fontSize: 9.5, letterSpacing: 0.7, color: design.ink3, marginTop: 2 },
  cityRowStateOn: { color: colors.sage2 },
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
  promoWide: { width: undefined },
  promoSolo: { paddingHorizontal: 16, marginTop: 12 },
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
  deliverCount: { fontSize: 10, letterSpacing: 1, color: design.ink3 },
  railEyebrow: { fontSize: 9, letterSpacing: 0.8, color: design.ink3 },
  railTitle: { fontFamily: font.sansSemi, fontSize: 18, letterSpacing: -0.35, color: design.ink, marginTop: 3 },
  seeAll: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.forest, marginBottom: 3 },
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
  // Wraps, so "₹44,000 /tonne" drops its unit to the next line instead of
  // running under the button.
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4 },
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

  footerLinks: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 18, paddingHorizontal: 16, paddingTop: 26,
  },
  footerLink: { fontFamily: font.sansMed, fontSize: 13, color: design.ink3, textDecorationLine: 'underline' },
  footerNote: { fontSize: 9, letterSpacing: 1, color: design.ink3, textAlign: 'center', paddingTop: 12 },

  empty: { alignItems: 'center', marginTop: 36, paddingHorizontal: 24, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center' },
});
