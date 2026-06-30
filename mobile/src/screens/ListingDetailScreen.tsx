// Listing detail screen — full crop listing (photos, specs, price) loaded by id,
// with an inline form for buyers to place a bid (placeBid).

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchListing, placeBid } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../api/types';
import type { BrowseStackParamList } from '../navigation/types';
import { Badge, Button, Card } from '../components/ui';
import { money, unitLabel } from '../lib/format';
import { mspForCrop } from '../lib/msp';
import { colors, radius, spacing } from '../theme';

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

  const img = mediaUrl(listing.images?.[0]);
  const isBuyer = user?.role === 'BUYER';
  const isOwner = user?.id === listing.farmer?.user?.id;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {img ? <Image source={{ uri: img }} style={styles.hero} /> : null}

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
          <Spec label="Quantity" value={`${listing.quantity} ${unitLabel(listing.unit)}`} />
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

        {isBuyer && !isOwner ? (
          <BidForm listing={listing} onDone={() => navigation.goBack()} />
        ) : isOwner ? (
          <Text style={styles.note}>This is your listing.</Text>
        ) : (
          <Text style={styles.note}>Only buyers can place bids.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  const [price, setPrice] = useState(String(listing.pricePerUnitMin));
  const [qty, setQty] = useState(String(listing.quantity));
  const [message, setMessage] = useState('');
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
    if (msp != null && listing.currency === 'INR' && priceNum < msp) {
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceHover },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  crop: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text },
  price: { fontSize: 20, fontWeight: '700', color: colors.forest },
  priceUnit: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
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
});
