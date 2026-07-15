// Storefront Home — the Home tab for ALL THREE roles (farmer, buyer,
// consumer) AND the signed-out guest landing: an exact mobile mirror of the WEB homepage
// (client/src/pages/LandingPage.tsx): forest price ticker, cream header with
// wordmark + rotating-hint search + category chips, the mandi-photo hero
// banner, promo trio, category tiles, then EVERY listing below in the same
// four rails (Fresh Vegetables / Seasonal Fruits / Grains & Pulses / Spices &
// Oilseeds), a how-it-works strip, and the sell CTA.
//
// Like the web, the market always renders with prices: the shared static
// catalog (lib/catalog.ts) fills every rail, and live listings from the API
// replace the demo card for their crop (consumers see direct-sale lots only).
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconSearch } from '../components/icons';
import { Mono } from '../components/buyerKit';
import { Wordmark } from '../components/marks';
import { FadeInImage, PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { browse } from '../api/endpoints';
import api, { errorMessage, mediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../api/types';
import { money, unitLabel } from '../lib/format';
import {
  CATEGORY_TILES, CHIPS, DEMO_PRODUCTS, RAILS, TICKER,
  railFor, type RailId,
} from '../lib/catalog';

const SEARCH_HINTS = ['tomato', 'fresh mango', 'wheat', 'onion', 'dal', 'turmeric'];

// ---------------------------------------------------------------------------
// Live mandi rates — /rates/board (Govt Agmarknet, public, daily)
// ---------------------------------------------------------------------------

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL';
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

// One card on the storefront — either a live API listing or a static demo lot
// from the shared catalog, normalised to what the card renders.
interface CardVM {
  key: string;
  live: boolean;
  listing?: Listing;
  cat: RailId;
  name: string;
  variety: string | null;
  emoji: string | null;
  image: string | null;
  unit: string;
  price: number;
  anchor: number;
  qty: number;
  location: string;
  state: string;
  grade: string;
  organic: boolean;
  trust: number | null;
  low: boolean;
}

function fromListing(l: Listing): CardVM {
  return {
    key: l.id,
    live: true,
    listing: l,
    cat: railFor(l.cropName),
    name: l.cropName,
    variety: l.cropVariety,
    emoji: null,
    image: l.images?.[0] ?? null,
    unit: l.unit,
    price: l.retailPricePerUnit ?? l.pricePerUnitMin,
    anchor: l.pricePerUnitMax,
    qty: l.remainingQuantity,
    location: l.location,
    state: l.state,
    grade: l.qualityGrade,
    organic: l.organic,
    trust: l.farmer?.user?.trustScore ?? null,
    low: l.quantity > 0 && l.remainingQuantity / l.quantity <= 0.25,
  };
}

function pctOff(vm: CardVM): number {
  if (vm.price >= vm.anchor) return 0;
  return Math.round((1 - vm.price / vm.anchor) * 100);
}

export default function StorefrontHomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<RailId | null>(null);
  const board = useLiveRates();

  const role = user?.role;
  const isFarmer = role === 'FARMER';
  // Card action mirrors what ListingDetail offers each role.
  const actionLabel = role === 'BUYER' ? 'BID' : isFarmer ? 'VIEW' : 'BUY';
  const liveWord = role === 'CONSUMER' ? 'FARM DIRECT' : 'LIVE LOT';

  const load = useCallback(async () => {
    try {
      // Consumers only see lots opened for direct retail; farmers and buyers
      // see the whole open market.
      const data = await browse(role === 'CONSUMER' ? { directSale: true } : {});
      glide();
      setListings(data.listings ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not reach the market — showing reference prices.'));
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Live lots first; the static catalog fills every crop that has no live lot
  // yet, so the market always renders full, with prices — same as the web.
  const items = useMemo<CardVM[]>(() => {
    const live = listings.map(fromListing);
    const liveNames = new Set(live.map((v) => v.name.trim().toLowerCase()));
    const demo = DEMO_PRODUCTS
      .filter((d) => !liveNames.has(d.name.trim().toLowerCase()))
      .map<CardVM>((d) => ({
        key: `demo-${d.slug}`,
        live: false,
        cat: d.cat,
        name: d.name,
        variety: d.variety,
        emoji: d.emoji,
        image: null,
        unit: d.unit,
        price: d.price,
        anchor: d.anchor,
        qty: d.qty,
        location: d.location,
        state: d.state,
        grade: d.grade,
        organic: !!d.organic,
        trust: null,
        low: false,
      }));
    return [...live, ...demo];
  }, [listings]);

  const q = search.trim().toLowerCase();
  const browsing = q === '' && category === null;
  const results = items.filter((v) => {
    if (category && v.cat !== category) return false;
    if (!q) return true;
    return `${v.name} ${v.variety ?? ''} ${v.location} ${v.state}`.toLowerCase().includes(q);
  });

  const openCard = (v: CardVM) => {
    if (v.live && v.listing) {
      nav.navigate('ListingDetail', { id: v.listing.id, preview: v.listing });
    } else {
      Alert.alert(
        'Reference price',
        `${v.name} (${v.variety}) — typical ${v.location} mandi band. A real farmer's lot replaces this card the moment one is listed. Pull down to refresh.`,
      );
    }
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
              <Text style={styles.loginPillText}>Log in</Text>
            </PressScale>
          )}
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
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        {browsing ? (
          <>
            {/* hero banner — the web banner with the mandi photo */}
            <View style={styles.banner}>
              <Image source={require('../../assets/mandi.jpg')} style={styles.bannerImg} resizeMode="cover" />
              <View style={styles.bannerShade} />
              <View style={styles.bannerContent}>
                <View style={styles.bannerChip}>
                  <Pulse style={styles.liveDot} />
                  <Mono style={styles.bannerChipText}>
                    LIVE · {listings.length > 0 ? `${listings.length} FARMER ${listings.length === 1 ? 'LOT' : 'LOTS'}` : 'MANDI PRICES'} · VERIFIED FARMS
                  </Mono>
                </View>
                <Text style={styles.bannerTitle}>
                  Farm-fresh crops,{'\n'}
                  <Text style={styles.bannerItalic}>farmer-fair</Text> prices.
                </Text>
                <View style={styles.bannerTicks}>
                  <Text style={styles.bannerTick}>✓ Every lot inspected</Text>
                  <Text style={styles.bannerTick}>✓ Escrow settlement</Text>
                  <Text style={styles.bannerTick}>✓ Farm to door</Text>
                </View>
              </View>
            </View>

            {/* today's live mandi rates — the shared price anchor, up front */}
            <RatesRail board={board} onSeeAll={() => nav.navigate('Rates')} />

            {/* promo trio — the web's sage/paper/ember cards as a rail */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoPad}>
              <PromoCard tone="sage" emoji="🏛️" title="Sarkari Yojana" desc="PM-Kisan, fasal bima, KCC loans — find every govt scheme you're owed." onPress={() => nav.navigate('Schemes')} />
              <PromoCard tone="paper" emoji="🧺" title="Buy direct, no bidding" desc="Any quantity, at the farmer's listed price." />
              <PromoCard tone="paper" emoji="🚜" title="Straight from the grower" desc="A shorter chain means fairer prices — for the farm and for you." />
              <PromoCard tone="ember" emoji="🚚" title="Verified & delivered" desc="Inspected lots, escrow held until it reaches you." />
            </ScrollView>

            {/* shop by category — web's tile row */}
            <Text style={styles.sectionTitle}>Shop by category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tilesPad}>
              {CATEGORY_TILES.map((c) => (
                <CategoryTile key={c.label} label={c.label} emoji={c.emoji} onPress={() => pickCategory(c.target)} />
              ))}
            </ScrollView>

            {/* the market — every listing, in the web's four rails */}
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
                      <ProductCard key={v.key} vm={v} width={164} action={actionLabel} liveWord={liveWord} onPress={() => openCard(v)} />
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
                ['02', 'You buy at their price', 'Any quantity, no bidding — the price you see is the farmer\'s own.'],
                ['03', 'We verify & deliver', 'Every lot inspected; escrow released on delivery.'],
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
                  <ProductCard key={v.key} vm={v} grid action={actionLabel} liveWord={liveWord} onPress={() => openCard(v)} />
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
      Animated.timing(x, { toValue: -w, duration: Math.max(w * 30, 8000), easing: Easing.linear, useNativeDriver: true }),
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
  if (!board) return null;
  return (
    <View>
      <View style={styles.ratesHead}>
        {board.live ? <Pulse style={styles.liveDot} /> : null}
        <Text style={styles.ratesTitle}>Today's mandi rates</Text>
        <PressScale onPress={onSeeAll} scaleTo={0.94} cardStyle={styles.ratesSeeAll}>
          <Text style={styles.ratesSeeAllText}>see all →</Text>
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

// Web .st-card: photo flush to the card top with the % OFF tag and grade chip
// overlaid, live line, name, meta, stock, price + struck anchor + bordered BUY.
function ProductCard({
  vm, onPress, width, grid, action, liveWord,
}: {
  vm: CardVM;
  onPress: () => void;
  width?: number;
  grid?: boolean;
  action: string;
  liveWord: string;
}) {
  const pct = pctOff(vm);
  const img = vm.image ? mediaUrl(vm.image) : null;
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
            {vm.live ? (vm.trust != null ? `★ ${vm.trust} · ${liveWord}` : liveWord) : 'MANDI PRICE'}
          </Mono>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>
          {vm.name}
          {vm.variety ? ` · ${vm.variety}` : ''}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {vm.location}, {vm.state}
        </Text>
        <Text style={[styles.stock, vm.low && styles.stockLow]} numberOfLines={1}>
          {vm.low
            ? `Only ${vm.qty.toLocaleString('en-IN')} ${unitLabel(vm.unit)} left`
            : `${vm.qty.toLocaleString('en-IN')} ${unitLabel(vm.unit)} available`}
        </Text>
        <View style={styles.priceFoot}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{money(vm.price)}</Text>
              <Text style={styles.perUnit}>/{unitLabel(vm.unit)}</Text>
            </View>
            {pct > 0 ? <Text style={styles.strike}>{money(vm.anchor)}</Text> : null}
          </View>
          <View style={styles.buyBtn}>
            <Text style={styles.buyBtnText}>{action}</Text>
          </View>
        </View>
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
  strike: { fontFamily: font.sans, fontSize: 11, color: design.ink3, textDecorationLine: 'line-through' },
  buyBtn: {
    borderWidth: 1.4,
    borderColor: colors.forest,
    backgroundColor: 'rgba(31,45,24,0.05)',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  buyBtnText: { fontFamily: font.sansBold, fontSize: 11.5, color: colors.forest, letterSpacing: 0.5 },

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
