// Listing detail screen — full crop listing (photos, specs, price) loaded by id,
// with an inline form for buyers to place a bid (placeBid). Guests can view
// everything; the sticky bottom bar becomes the login gate ("Log in to buy") —
// browsing is free, acting needs an account.

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { directPurchase, fetchListing, placeBid } from '../api/endpoints';
import { mintPurchaseKey } from '../lib/idempotency';
import { errorMessage, mediaUrl } from '../api/client';
import { cropImageFor } from '../utils/cropImages';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../api/types';
import type { BrowseStackParamList } from '../navigation/types';
import { Badge, Button, Card } from '../components/ui';
import { FadeInImage, PressScale } from '../components/motion';
import { money, unitLabel } from '../lib/format';
import { orderQuantity, railFor, shopPack, type ShopPack } from '../lib/catalog';
import { mspForCrop } from '../lib/msp';
import { colors, design, font, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<BrowseStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(preview ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListing(id)
      .then(setListing)
      .catch((e) => setError(errorMessage(e, 'Could not load listing')));
  }, [id]);

  if (!listing) {
    return (
      <View style={styles.flex}>
        <Text style={styles.error}>{error ?? 'Loading…'}</Text>
      </View>
    );
  }

  const imgs = (listing.images ?? []).map((i) => mediaUrl(i)).filter((u): u is string => !!u);
  if (imgs.length === 0) {
    const stock = cropImageFor(listing.cropName);
    if (stock) imgs.push(stock);
  }
  const isGuest = !user;
  const isBuyer = user?.role === 'BUYER';
  const isConsumer = user?.role === 'CONSUMER';
  const isOwner = user?.id === listing.farmer?.user?.id;
  const canDirectBuy =
    isConsumer && !isOwner && listing.directSaleEnabled && listing.retailPricePerUnit != null;

  // The household pack the storefront card advertised — same crop, same unit,
  // same maths, so "₹34 · 500 g" on the card is what the buy bar opens at.
  // null for a bulk-only crop (cotton, maize), which stays priced by the unit.
  const pack = canDirectBuy
    ? shopPack({
        crop: listing.cropName,
        cat: railFor(listing.cropName),
        unit: listing.unit,
        floor: listing.pricePerUnitMin,
        ceiling: listing.pricePerUnitMax,
        retail: listing.retailPricePerUnit,
      })
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={[styles.container, (canDirectBuy || isGuest) && { paddingBottom: 130 }]}
        keyboardShouldPersistTaps="handled"
      >
        {imgs.length > 0 ? <ImagePager images={imgs} /> : null}

        <View style={styles.titleRow}>
          <Text style={styles.crop}>
            {listing.cropName}
            {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
          </Text>
          {listing.organic ? <Badge status="ORGANIC" /> : null}
        </View>

        {isConsumer && listing.directSaleEnabled && listing.retailPricePerUnit != null ? (
          <ConsumerPrice listing={listing} pack={pack} />
        ) : (
          <Text style={styles.price}>
            {money(listing.pricePerUnitMin, listing.currency)}–
            {money(listing.pricePerUnitMax, listing.currency)}
            <Text style={styles.priceUnit}> /{unitLabel(listing.unit)}</Text>
          </Text>
        )}

        <Card style={styles.specs}>
          <Spec
            label={listing.directSaleEnabled ? 'In stock' : 'Quantity'}
            value={`${(listing.directSaleEnabled ? listing.remainingQuantity : listing.quantity).toLocaleString('en-IN')} ${unitLabel(listing.unit)}`}
          />
          <Spec label="Quality" value={`Grade ${listing.qualityGrade}`} />
          <Spec label="Location" value={`${listing.location}, ${listing.state}`} />
          <Spec
            label="Farmer"
            value={`${listing.farmer?.user?.name ?? '—'} · trust ${
              listing.farmer?.user?.trustScore ?? '—'
            }`}
          />
        </Card>

        {listing.description ? (
          <Text style={styles.description}>{listing.description}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isGuest ? (
          <Text style={styles.note}>You're browsing as a guest — log in to buy this lot or place a bid.</Text>
        ) : isOwner ? (
          <Text style={styles.note}>This is your listing.</Text>
        ) : isBuyer ? (
          <BidForm listing={listing} onDone={() => navigation.goBack()} />
        ) : isConsumer && !canDirectBuy ? (
          <Text style={styles.note}>This farmer hasn't enabled direct purchase for this crop.</Text>
        ) : !isConsumer ? (
          <Text style={styles.note}>Only buyers can place bids.</Text>
        ) : null}
      </ScrollView>

      {/* Blinkit-style sticky buy bar — quantity stepper + total + Buy now.
          Guests get the login gate here instead: price + "Log in to buy". */}
      {canDirectBuy ? (
        <BuyBar listing={listing} pack={pack} onDone={() => navigation.goBack()} />
      ) : isGuest ? (
        <GuestBar listing={listing} onLogin={() => (navigation as any).navigate('Login')} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// Swipeable photo pager with position dots, grocery-app style. Falls back to a
// single image (no dots) when there's only one photo.
function ImagePager({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const [w, setW] = useState(0);
  return (
    <View style={styles.pagerWrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / w))}
        >
          {images.map((uri) => (
            <FadeInImage key={uri} uri={uri} style={{ width: w, height: 230, backgroundColor: colors.surfaceHover }} />
          ))}
        </ScrollView>
      ) : null}
      {images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Blinkit-style price block for the direct-buy flow: green selling price with
// the wholesale ceiling as a struck-through anchor and a "% OFF" tag when the
// farmer's retail price sits meaningfully below it. Priced by the pack when
// there is one, so the headline matches the card that was tapped.
function ConsumerPrice({ listing, pack }: { listing: Listing; pack: ShopPack | null }) {
  const retail = listing.retailPricePerUnit ?? 0;
  const pct = retail < listing.pricePerUnitMax ? Math.round((1 - retail / listing.pricePerUnitMax) * 100) : 0;
  return (
    <View style={styles.consumerPriceWrap}>
      <View style={styles.consumerPriceRow}>
        <Text style={styles.consumerPrice}>
          {money(pack ? pack.price : retail, listing.currency)}
          <Text style={styles.priceUnit}> /{pack ? pack.suffix : unitLabel(listing.unit)}</Text>
        </Text>
        {pct >= 5 ? (
          <>
            <Text style={styles.mrp}>
              {money(pack ? pack.anchor : listing.pricePerUnitMax, listing.currency)}
            </Text>
            <View style={styles.offTag}>
              <Text style={styles.offTagText}>{pct}% OFF</Text>
            </View>
          </>
        ) : null}
      </View>
      {pack ? (
        <Text style={styles.packNote}>
          {pack.label} pack · {money(pack.perKg, listing.currency)}/{pack.perKgLabel}
        </Text>
      ) : null}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function BidForm({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const { user } = useAuth();
  const [price, setPrice] = useState(String(listing.pricePerUnitMin));
  const [qty, setQty] = useState(String(listing.quantity));
  const [message, setMessage] = useState('');
  // Prefilled from the profile — the farmer sees these on the offer
  const [deliveryAddress, setDeliveryAddress] = useState(user?.location ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const qtyNum = Number(qty);
  const total = priceNum > 0 && qtyNum > 0 ? priceNum * qtyNum : 0;

  function submit() {
    if (!(priceNum > 0) || !(qtyNum > 0)) {
      setError('Enter a valid price and quantity');
      return;
    }
    setError(null);

    // Government MSP guard — warn (but don't block) when the bid is below the
    // official support price. MSP is an India-only price in ₹, so only applies
    // to INR listings.
    const msp = mspForCrop(listing.cropName, listing.unit);
    if (msp != null && listing.currency.toUpperCase() === 'INR' && priceNum < msp) {
      const u = unitLabel(listing.unit);
      Alert.alert(
        'Bid below government MSP',
        `The government MSP for ${listing.cropName} is ${money(msp, listing.currency)}/${u}. ` +
          `Your bid of ${money(priceNum, listing.currency)}/${u} is below it.`,
        [
          { text: 'Raise bid', style: 'cancel' },
          { text: 'Bid anyway', style: 'destructive', onPress: doPlaceBid },
        ],
      );
      return;
    }

    doPlaceBid();
  }

  async function doPlaceBid() {
    setSubmitting(true);
    try {
      await placeBid({
        listingId: listing.id,
        bidPricePerUnit: priceNum,
        quantity: qtyNum,
        message: message.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      Alert.alert('Bid placed', 'The farmer has been notified.', [
        { text: 'OK', onPress: onDone },
      ]);
    } catch (e) {
      setError(errorMessage(e, 'Could not place bid'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={styles.bidCard}>
      <Text style={styles.bidTitle}>Place a bid</Text>

      <Text style={styles.label}>Price per {unitLabel(listing.unit)}</Text>
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Quantity ({unitLabel(listing.unit)})</Text>
      <TextInput
        style={styles.input}
        value={qty}
        onChangeText={setQty}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Deliver to</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={deliveryAddress}
        onChangeText={setDeliveryAddress}
        multiline
        placeholder="Address the farmer should ship to"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Contact phone</Text>
      <TextInput
        style={styles.input}
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholder="Number the farmer can call"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Message (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={message}
        onChangeText={setMessage}
        multiline
        placeholder="Add a note for the farmer"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.total}>Total: {money(total, listing.currency)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label="Submit bid" onPress={submit} loading={submitting} />
    </Card>
  );
}

// Sticky login gate for guests — same silhouette as the buy bar (price on the
// left, forest button on the right) so the transition after login feels like
// the button simply "unlocked". Shows the direct-sale retail price when the
// farmer set one, otherwise the floor of the wholesale band.
function GuestBar({ listing, onLogin }: { listing: Listing; onLogin: () => void }) {
  const insets = useSafeAreaInsets();
  const price = listing.retailPricePerUnit ?? listing.pricePerUnitMin;
  return (
    <View style={[styles.buyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.buyBarRow}>
        <View style={styles.buyTotals}>
          <Text style={styles.buyTotal}>
            {money(price, listing.currency)}
            <Text style={styles.buyTotalSub}> /{unitLabel(listing.unit)}</Text>
          </Text>
          <Text style={styles.buyTotalSub} numberOfLines={1}>
            farmer's price · fully transparent
          </Text>
        </View>
        <PressScale onPress={onLogin} cardStyle={styles.buyBtn}>
          <Text style={styles.buyBtnText}>Log in to buy</Text>
        </PressScale>
      </View>
    </View>
  );
}

// Sticky bottom purchase bar: − / + quantity stepper, live total, and a Buy
// button — the quick-commerce "Add to cart" bar, adapted for loose produce.
// The stepper counts PACKS when the crop has one ("2 × 500 g"), so a shopper
// buys exactly what the storefront card offered; the order still goes to the
// server in the listing's own unit. Crops without a pack step by the unit.
function BuyBar({ listing, pack, onDone }: { listing: Listing; pack: ShopPack | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = pack ? pack.units : 1; // listing units per tap of the stepper
  const n = Number(count);
  const price = listing.retailPricePerUnit ?? 0;
  // Rounded because 3 × 0.05 quintal is 0.15000000000000002 in binary floating
  // point, and that goes on an order. Packs round in kg then convert, so a
  // small pack off a TONNE lot survives the trip.
  const qtyNum = n > 0 ? (pack ? orderQuantity(pack, n) : Number(n.toFixed(3))) : 0;
  const total = qtyNum > 0 ? qtyNum * price : 0;
  const inStock = listing.remainingQuantity;
  const unit = unitLabel(listing.unit);
  const maxCount = Math.floor(inStock / step);
  const valid = n > 0 && qtyNum > 0 && qtyNum <= inStock;
  // Six decimals: a gram of a TONNE lot is 0.000001, and rounding the display
  // to the usual three would show a 500 g pack as "0 t".
  const qtyText = `${qtyNum.toLocaleString('en-IN', { maximumFractionDigits: 6 })} ${unit}`;

  const bump = (d: number) => {
    const next = Math.min(Math.max((Number(count) || 0) + d, 1), Math.max(maxCount, 1));
    setError(null);
    setCount(String(next));
  };

  // The reference for the order this bar is about to place. A failed attempt
  // is indistinguishable from one whose response was lost, so tapping Buy
  // again has to replay the same key rather than order a second time.
  const purchaseKey = useRef(mintPurchaseKey());

  // A different amount is a different order, so it gets its own key —
  // otherwise a retry after changing the quantity would return the order for
  // the old one and look like the change never took.
  useEffect(() => {
    purchaseKey.current = mintPurchaseKey();
  }, [qtyNum]);

  async function submit() {
    if (!(n > 0)) {
      setError(pack ? 'Choose how many packs you want' : 'Enter how much you want to buy');
      return;
    }
    if (qtyNum > inStock) {
      setError(`Only ${inStock.toLocaleString('en-IN')} ${unit} left in stock`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await directPurchase({
        listingId: listing.id,
        quantity: qtyNum,
        idempotencyKey: purchaseKey.current,
      });
      // Spent. Anything bought from this screen afterwards is a new order.
      purchaseKey.current = mintPurchaseKey();
      Alert.alert(
        'Order placed',
        `Pay ${money(total, listing.currency)} from the Orders tab to complete your purchase.`,
        [{ text: 'OK', onPress: onDone }],
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not place order'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.buyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {error ? <Text style={styles.buyBarError}>{error}</Text> : null}
      <View style={styles.buyBarRow}>
        <View style={styles.stepper}>
          <Pressable onPress={() => bump(-1)} hitSlop={8} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.stepInput}
            value={count}
            onChangeText={(t) => { setError(null); setCount(t.replace(/[^0-9]/g, '')); }}
            keyboardType="numeric"
            maxLength={6}
          />
          <Pressable onPress={() => bump(1)} hitSlop={8} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.buyTotals}>
          <Text style={styles.buyTotal}>{money(total, listing.currency)}</Text>
          <Text style={styles.buyTotalSub} numberOfLines={1}>
            {qtyNum <= 0
              ? `${money(pack ? pack.price : price, listing.currency)}/${pack ? pack.suffix : unit}`
              : pack
                ? `${n} × ${pack.label} · ${qtyText}`
                : `${qtyText} · farmer's price`}
          </Text>
        </View>
        {/* Dim but still pressable when the amount doesn't work — a tap then
            says why (out of stock, less than one pack left) instead of the
            button silently doing nothing. */}
        <PressScale
          onPress={submitting ? undefined : submit}
          cardStyle={[styles.buyBtn, (submitting || !valid) && styles.buyBtnDim]}
        >
          <Text style={styles.buyBtnText}>{submitting ? 'Placing…' : 'Buy now'}</Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceHover },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  crop: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text },
  price: { fontSize: 20, fontWeight: '700', color: colors.forest },
  priceUnit: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  consumerPriceWrap: { gap: 2 },
  consumerPriceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  packNote: { fontSize: 13, color: colors.textMuted },
  consumerPrice: { fontSize: 20, fontWeight: '800', color: colors.forest },
  mrp: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'line-through' },
  offTag: { backgroundColor: colors.ember, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  offTagText: { fontSize: 10.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  specs: { gap: spacing.sm },
  specRow: { flexDirection: 'row', justifyContent: 'space-between' },
  specLabel: { color: colors.textMuted, fontSize: 14 },
  specValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  note: { color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm },
  bidCard: { gap: spacing.xs, marginTop: spacing.sm },
  bidTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  total: { fontSize: 16, fontWeight: '700', color: colors.text, marginVertical: spacing.md },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },

  // image pager
  pagerWrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHover },
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#fff', width: 14 },

  // sticky buy bar
  buyBar: {
    backgroundColor: design.paper,
    borderTopWidth: 1,
    borderTopColor: design.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  buyBarError: { color: colors.error, fontFamily: font.sansMed, fontSize: 12.5, marginBottom: 8 },
  buyBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.3,
    borderColor: colors.forest,
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: design.mint },
  stepBtnText: { fontFamily: font.sansBold, fontSize: 16, lineHeight: 18, color: colors.forest },
  stepInput: {
    minWidth: 44,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: font.sansBold,
    fontSize: 15,
    color: design.ink,
  },
  buyTotals: { flex: 1, minWidth: 0 },
  buyTotal: { fontFamily: font.sansBold, fontSize: 17, letterSpacing: -0.3, color: design.ink },
  buyTotalSub: { fontFamily: font.sansMed, fontSize: 11, color: design.ink3, marginTop: 1 },
  buyBtn: {
    backgroundColor: colors.forest,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  buyBtnDim: { opacity: 0.55 },
  buyBtnText: { fontFamily: font.sansBold, fontSize: 14.5, color: colors.textInverse, letterSpacing: 0.2 },
});
