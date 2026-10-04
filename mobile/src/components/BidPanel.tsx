// =============================================================================
// BidPanel — a buyer bidding on a lot, or following up a bid already made
// =============================================================================
// Two states on one card, decided by whether this buyer already has an open
// bid on the lot:
//
//   NO BID     the form: price with one-tap amounts off the seller's own range,
//              quantity with a "whole lot" chip, the total, and the delivery
//              details folded away (they are prefilled from the profile).
//   OPEN BID   where it stands. A seller's counter shows their price beside
//              yours with "Meet ₹X", plus change and withdraw. These existed on
//              the server and the website; the app had no way to answer a
//              counter at all, so a countered bid was a dead end.
//
// MEETING THE PRICE IS NOT A DEAL YET. The server has no "accept counter" for
// a buyer: meeting it re-bids at the seller's price and the seller accepts.
// The copy says so rather than calling it done.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../lib/alert';
import { Mono } from './buyerKit';
import { PressScale, glide } from './motion';
import { IconCheck, IconChevR, IconClock } from './icons';
import { useAuth } from '../context/AuthContext';
import { myBids, placeBid, updateBid, withdrawBid } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Bid, Listing } from '../api/types';
import { money, timeAgo, unitLabel } from '../lib/format';
import { mspForCrop } from '../lib/msp';
import { colors, design, font } from '../theme';

export function BidPanel({ listing }: { listing: Listing }) {
  const [bid, setBid] = useState<Bid | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const all = await myBids();
      setBid(
        (Array.isArray(all) ? all : []).find(
          (b) => b.listingId === listing.id && (b.status === 'PENDING' || b.status === 'COUNTERED'),
        ) ?? null,
      );
    } catch {
      setBid(null);
    }
  }, [listing.id]);

  useEffect(() => { void load(); }, [load]);

  if (bid === undefined) {
    return <View style={styles.card}><ActivityIndicator color={colors.forest} /></View>;
  }
  return bid
    ? <OpenBid bid={bid} listing={listing} onChanged={load} />
    : <NewBid listing={listing} onPlaced={load} />;
}

// ---- no bid yet: the form ---------------------------------------------------

function NewBid({ listing, onPlaced }: { listing: Listing; onPlaced: () => void }) {
  const { user } = useAuth();
  const unit = unitLabel(listing.unit);
  const lo = listing.pricePerUnitMin;
  const hi = listing.pricePerUnitMax;
  const mid = Math.round((lo + hi) / 2);
  const available = listing.remainingQuantity ?? listing.quantity;

  const [price, setPrice] = useState(String(lo));
  const [qty, setQty] = useState(String(available));
  const [message, setMessage] = useState('');
  const [address, setAddress] = useState(user?.location ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = Number(price);
  const q = Number(qty);
  const total = p > 0 && q > 0 ? p * q : 0;
  const below = p > 0 && p < lo;

  function submit() {
    if (!(p > 0) || !(q > 0)) return setError('Enter a price and a quantity.');
    if (q > available) return setError(`Only ${available.toLocaleString('en-IN')} ${unit} are available.`);
    setError(null);
    // Below the government support price: warn, do not block.
    const msp = mspForCrop(listing.cropName, listing.unit);
    if (msp != null && listing.currency.toUpperCase() === 'INR' && p < msp) {
      Alert.alert(
        'Below the government MSP',
        `The MSP for ${listing.cropName} is ${money(msp, listing.currency)}/${unit}. Your bid of ${money(p, listing.currency)}/${unit} is below it.`,
        [{ text: 'Raise it', style: 'cancel' }, { text: 'Bid anyway', style: 'destructive', onPress: send }],
      );
      return;
    }
    void send();
  }

  async function send() {
    setSaving(true);
    try {
      await placeBid({
        listingId: listing.id,
        bidPricePerUnit: p,
        quantity: q,
        message: message.trim() || undefined,
        deliveryAddress: address.trim() || undefined,
        contactPhone: phone.trim() || undefined,
      });
      glide();
      onPlaced();
    } catch (e) {
      setError(errorMessage(e, 'Could not place the bid'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Make an offer</Text>
      <Text style={styles.sub}>
        The seller hopes for {money(lo, listing.currency)}–{money(hi, listing.currency)} per {unit}.
      </Text>

      <Mono style={styles.label}>YOUR PRICE PER {unit.toUpperCase()}</Mono>
      <View style={[styles.field, below && styles.fieldWarn]}>
        <Text style={styles.prefix}>₹</Text>
        <TextInput
          style={styles.bigInput}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={design.ink3}
        />
      </View>
      <View style={styles.chips}>
        {[
          [lo, 'Their lowest'],
          [mid, 'Middle'],
          [hi, 'Their ask'],
        ].map(([v, label]) => (
          <Pressable
            key={String(label)}
            onPress={() => setPrice(String(v))}
            style={[styles.chip, Number(price) === v && styles.chipOn]}
          >
            <Text style={[styles.chipVal, Number(price) === v && styles.chipTextOn]}>{money(Number(v), listing.currency)}</Text>
            <Text style={[styles.chipLabel, Number(price) === v && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {below ? (
        <Text style={styles.warn}>Below the seller's lowest price. They will probably counter or decline.</Text>
      ) : null}

      <Mono style={styles.label}>QUANTITY</Mono>
      <View style={styles.qtyRow}>
        <View style={[styles.field, { flex: 1 }]}>
          <TextInput
            style={styles.bigInput}
            value={qty}
            onChangeText={setQty}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={design.ink3}
          />
          <Text style={styles.suffix}>{unit}</Text>
        </View>
        <Pressable onPress={() => setQty(String(available))} style={[styles.chip, styles.wholeLot, q === available && styles.chipOn]}>
          <Text style={[styles.chipVal, q === available && styles.chipTextOn]}>Whole lot</Text>
          <Text style={[styles.chipLabel, q === available && styles.chipTextOn]}>{available.toLocaleString('en-IN')} {unit}</Text>
        </Pressable>
      </View>

      {/* Delivery details are prefilled; folded so the price stays the focus. */}
      <Pressable onPress={() => { glide(); setMore((m) => !m); }} style={styles.moreRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.moreTitle}>Delivery and a note</Text>
          <Text style={styles.moreSub} numberOfLines={1}>
            {address ? `To ${address}` : 'Add where it goes'}{phone ? ` · ${phone}` : ''}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: more ? '90deg' : '0deg' }] }}>
          <IconChevR size={12} stroke={design.ink3} />
        </View>
      </Pressable>
      {more ? (
        <View style={{ gap: 8 }}>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Deliver to (city or address)" placeholderTextColor={design.ink3} />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone the seller can call" placeholderTextColor={design.ink3} />
          <TextInput style={[styles.input, styles.multi]} value={message} onChangeText={setMessage} multiline placeholder="A note for the seller (optional)" placeholderTextColor={design.ink3} />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PressScale onPress={saving ? undefined : submit} scaleTo={0.98} cardStyle={[styles.primary, saving && { opacity: 0.6 }]}>
        {saving ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Text style={styles.primaryText}>Send offer</Text>
            <Text style={styles.primaryTotal}>{money(total, listing.currency)}</Text>
          </>
        )}
      </PressScale>
    </View>
  );
}

// ---- an open bid: where it stands ------------------------------------------

function OpenBid({ bid, listing, onChanged }: { bid: Bid; listing: Listing; onChanged: () => void }) {
  const unit = unitLabel(listing.unit);
  const countered = bid.status === 'COUNTERED' && bid.counterPrice != null;
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(bid.bidPricePerUnit));
  const [busy, setBusy] = useState<string | null>(null);

  async function reprice(to: number, kind: string) {
    setBusy(kind);
    try {
      await updateBid(bid.id, to);
      glide();
      setEditing(false);
      onChanged();
    } catch (e) {
      Alert.alert('Could not change the bid', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function withdraw() {
    Alert.alert('Withdraw your bid?', 'The seller will no longer see it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setBusy('withdraw');
          try {
            await withdrawBid(bid.id);
            glide();
            onChanged();
          } catch (e) {
            Alert.alert('Could not withdraw', errorMessage(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.card, countered && styles.cardHot]}>
      <View style={styles.statusRow}>
        <Mono style={[styles.status, countered && styles.statusHot]}>
          ● {countered ? 'THE SELLER COUNTERED' : 'YOUR OFFER IS WITH THE SELLER'}
        </Mono>
        <Mono style={styles.ago}>{timeAgo(bid.createdAt).toUpperCase()}</Mono>
      </View>

      <View style={styles.compare}>
        <View style={styles.cmpCell}>
          <Mono style={styles.label}>YOU OFFERED</Mono>
          <Text style={[styles.cmpVal, countered && styles.cmpOld]}>{money(bid.bidPricePerUnit, bid.currency)}</Text>
          <Text style={styles.cmpUnit}>per {unit}</Text>
        </View>
        {countered ? (
          <View style={[styles.cmpCell, styles.cmpRight]}>
            <Mono style={styles.label}>THEY ASK</Mono>
            <Text style={[styles.cmpVal, styles.cmpNew]}>{money(bid.counterPrice!, bid.currency)}</Text>
            <Text style={styles.cmpUnit}>per {unit}</Text>
          </View>
        ) : (
          <View style={[styles.cmpCell, styles.cmpRight]}>
            <Mono style={styles.label}>QUANTITY</Mono>
            <Text style={styles.cmpVal}>{bid.quantity.toLocaleString('en-IN')}</Text>
            <Text style={styles.cmpUnit}>{unit} · {money(bid.totalAmount, bid.currency)}</Text>
          </View>
        )}
      </View>

      {countered ? (
        <>
          <PressScale
            onPress={busy ? undefined : () => reprice(bid.counterPrice!, 'meet')}
            scaleTo={0.98}
            cardStyle={[styles.primary, busy === 'meet' && { opacity: 0.6 }]}
          >
            {busy === 'meet' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <>
                <IconCheck size={16} stroke={colors.textInverse} />
                <Text style={styles.primaryText}>
                  Meet {money(bid.counterPrice!, bid.currency)} · {money(bid.counterPrice! * bid.quantity, bid.currency)}
                </Text>
              </>
            )}
          </PressScale>
          <Text style={styles.hint}>
            This sends your offer again at their price; the deal is made when the seller accepts it.
          </Text>
        </>
      ) : (
        <View style={styles.waiting}>
          <IconClock size={14} stroke={design.ink3} />
          <Text style={styles.waitingText}>Waiting for the seller to accept, counter or decline.</Text>
        </View>
      )}

      {editing ? (
        <View style={styles.qtyRow}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.prefix}>₹</Text>
            <TextInput style={styles.bigInput} value={price} onChangeText={setPrice} keyboardType="numeric" autoFocus />
          </View>
          <PressScale
            onPress={busy || !(Number(price) > 0) ? undefined : () => reprice(Number(price), 'edit')}
            scaleTo={0.96}
            cardStyle={styles.smallBtn}
          >
            {busy === 'edit' ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryText}>Send</Text>}
          </PressScale>
        </View>
      ) : null}

      <View style={styles.secondaryRow}>
        <Pressable onPress={() => { glide(); setEditing((v) => !v); }} style={styles.secondary}>
          <Text style={styles.secondaryText}>{editing ? 'Cancel' : countered ? 'Offer another price' : 'Change price'}</Text>
        </Pressable>
        <Pressable onPress={busy ? undefined : withdraw} style={[styles.secondary, styles.danger]}>
          {busy === 'withdraw' ? <ActivityIndicator color={colors.ember} /> : <Text style={styles.dangerText}>Withdraw</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 20, padding: 16, gap: 10,
  },
  cardHot: { borderColor: 'rgba(200,96,43,0.4)' },
  title: { fontFamily: font.sansBold, fontSize: 19, letterSpacing: -0.3, color: design.ink },
  sub: { fontFamily: font.sans, fontSize: 13, color: design.ink3, marginTop: -4 },
  label: { fontSize: 9, letterSpacing: 0.7, color: design.ink3, marginTop: 4 },
  field: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: design.line, borderRadius: 14, backgroundColor: design.bg, paddingHorizontal: 14,
  },
  fieldWarn: { borderColor: 'rgba(200,96,43,0.5)' },
  prefix: { fontFamily: font.sansSemi, fontSize: 20, color: design.ink3, marginRight: 4 },
  suffix: { fontFamily: font.sansMed, fontSize: 14, color: design.ink3 },
  bigInput: { flex: 1, paddingVertical: 12, fontFamily: font.sansBold, fontSize: 22, color: design.ink },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, alignItems: 'center', backgroundColor: design.bg,
    borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipVal: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink },
  chipLabel: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3, marginTop: 1 },
  chipTextOn: { color: colors.textInverse },
  warn: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.ember },
  qtyRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  wholeLot: { flex: 0, paddingHorizontal: 12, justifyContent: 'center' },
  moreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: design.line,
  },
  moreTitle: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  moreSub: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 1 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 12, backgroundColor: design.bg,
    paddingHorizontal: 14, paddingVertical: 11, fontFamily: font.sans, fontSize: 15, color: design.ink,
  },
  multi: { minHeight: 64, textAlignVertical: 'top' },
  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.ember },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.forest, borderRadius: 14, paddingVertical: 15, marginTop: 4,
  },
  primaryText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.textInverse },
  primaryTotal: { fontFamily: font.sansBold, fontSize: 15, color: design.leaf },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { fontSize: 9.5, letterSpacing: 0.7, color: colors.forest },
  statusHot: { color: colors.ember },
  ago: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },
  compare: { flexDirection: 'row', backgroundColor: design.bg, borderRadius: 14, padding: 14 },
  cmpCell: { flex: 1 },
  cmpRight: { borderLeftWidth: 1, borderLeftColor: design.line, paddingLeft: 14 },
  cmpVal: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.5, color: design.ink, marginTop: 2 },
  cmpOld: { color: design.ink3, textDecorationLine: 'line-through' },
  cmpNew: { color: colors.ember },
  cmpUnit: { fontFamily: font.sans, fontSize: 12, color: design.ink3 },
  hint: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink3 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: design.paper2, borderRadius: 12, padding: 11 },
  waitingText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, color: design.ink2 },
  smallBtn: { backgroundColor: colors.forest, borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center', minWidth: 80, alignItems: 'center' },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondary: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    borderRadius: 13, borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
  },
  secondaryText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest },
  danger: { borderColor: 'rgba(200,96,43,0.3)' },
  dangerText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.ember },
});
