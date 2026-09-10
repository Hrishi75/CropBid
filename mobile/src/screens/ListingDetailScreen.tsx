// Listing detail screen — one crop lot (photos, specs, price) loaded by id,
// with an inline form for approved buyers to place a bid. Guests see
// everything; the sticky bottom bar becomes the sign-in gate, because browsing
// is free and acting needs an account.
//
// This screen used to carry a second, retail half: a household price, a pack
// stepper, and a bar that put the lot in a basket. That belonged to a shopper,
// and shoppers have their own app now (cropbid-daily/). A lot here is priced
// per the seller's own unit and the only action is a bid.

import React, { useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchListing, placeBid } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';
import { cropImageFor } from '../utils/cropImages';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../api/types';
import type { BrowseStackParamList } from '../navigation/types';
import { Badge, Button, Card } from '../components/ui';
import { FadeInImage, PressScale } from '../components/motion';
import { money, unitLabel } from '../lib/format';
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
  const isOwner = user?.id === listing.farmer?.user?.id;


  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={[styles.container, isGuest && { paddingBottom: 130 }]}
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

        <Text style={styles.price}>
          {money(listing.pricePerUnitMin, listing.currency)}–
          {money(listing.pricePerUnitMax, listing.currency)}
          <Text style={styles.priceUnit}> /{unitLabel(listing.unit)}</Text>
        </Text>

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
          <Text style={styles.note}>You're browsing as a guest. Log in to place a bid on this lot.</Text>
        ) : isOwner ? (
          <Text style={styles.note}>This is your listing.</Text>
        ) : isBuyer ? (
          <BidForm listing={listing} onDone={() => navigation.goBack()} />
        ) : (
          <Text style={styles.note}>Only approved buyers can place bids.</Text>
        )}
      </ScrollView>

      {/* A guest gets the price and a way in. Everyone else is already served
          by the bid form above. */}
      {isGuest ? (
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
  cartStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: design.mint,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 10,
  },
  cartStripText: { fontFamily: font.sansMed, fontSize: 12, color: colors.forest },
  cartStripLink: { fontFamily: font.sansBold, fontSize: 12, color: colors.forest },
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
