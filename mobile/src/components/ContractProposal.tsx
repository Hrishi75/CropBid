// =============================================================================
// ContractProposal — an FMCG buyer proposes a supply contract from a lot
// =============================================================================
// Under the bid card on a lot's page, for an FMCG buyer only (the server holds
// the same rule). Folded to one button until opened, because most visits to a
// lot are to bid on it.
//
// One price for the whole contract, a total, a batch size and how often. The
// sum it adds up to, and how many batches, are worked out as the buyer types,
// because "50 t every 14 days of 300 t" is easy to mistype into twelve
// batches. The price may not be under the seller's floor, the same as a bid.
//
// Nothing here touches the lot's stock: a contract runs for months and each
// batch is made when it falls due.
// =============================================================================

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../lib/alert';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { proposeSupplyContract } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Listing } from '../api/types';
import { money, unitLabel } from '../lib/format';
import { colors, design, font } from '../theme';

const EVERY = [7, 14, 30];
const num = (v: string) => v.replace(/[^0-9.]/g, '');

export function ContractProposal({ listing }: { listing: Listing }) {
  const unit = unitLabel(listing.unit);
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState('');
  const [batch, setBatch] = useState('');
  const [every, setEvery] = useState(14);
  const [price, setPrice] = useState(String(listing.pricePerUnitMin));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const t = Number(total);
  const b = Number(batch);
  const p = Number(price);
  const batches = t > 0 && b > 0 && b <= t ? Math.ceil(t / b) : 0;
  const weeks = batches > 0 ? Math.round(((batches - 1) * every) / 7) : 0;

  async function send() {
    if (!(t > 0)) return Alert.alert('Enter the total', `How much ${listing.cropName} in all, in ${unit}?`);
    if (!(b > 0) || b > t) return Alert.alert('Check the batch size', 'Each batch is more than zero and no more than the total.');
    if (!(p >= listing.pricePerUnitMin)) {
      return Alert.alert('Below their floor', `The seller takes no less than ${money(listing.pricePerUnitMin, listing.currency)}/${unit}.`);
    }
    setSending(true);
    try {
      await proposeSupplyContract({ listingId: listing.id, totalQuantity: t, batchQuantity: b, everyDays: every, pricePerUnit: p, message: note.trim() || null });
      setSent(true);
      setOpen(false);
    } catch (e) {
      Alert.alert('Could not send it', errorMessage(e, 'Please try again'));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.card}>
        <Mono style={styles.kicker}>SUPPLY CONTRACT SENT</Mono>
        <Text style={styles.body}>The seller can accept or decline it. Follow it in Contracts.</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.closed, pressed && { opacity: 0.85 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.closedTitle}>Need this every month?</Text>
          <Text style={styles.body}>Propose a supply contract: one price, delivered in batches.</Text>
        </View>
        <Text style={styles.closedArrow}>→</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Mono style={styles.kicker}>PROPOSE A SUPPLY CONTRACT</Mono>
      <View style={styles.row}>
        <Field label={`Total (${unit})`} value={total} onChange={setTotal} placeholder="300" />
        <Field label={`Each batch (${unit})`} value={batch} onChange={setBatch} placeholder="50" />
      </View>
      <Text style={styles.label}>Deliver every</Text>
      <View style={styles.pills}>
        {EVERY.map((d) => (
          <Pressable key={d} onPress={() => setEvery(d)} style={[styles.pill, every === d && styles.pillOn]}>
            <Text style={[styles.pillText, every === d && styles.pillTextOn]}>{d === 7 ? 'Week' : d === 14 ? '2 weeks' : 'Month'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Field label={`Price per ${unit} (₹)`} value={price} onChange={setPrice} placeholder={String(listing.pricePerUnitMin)} />
      </View>
      <Text style={styles.hint}>Their range is {money(listing.pricePerUnitMin, listing.currency)} to {money(listing.pricePerUnitMax, listing.currency)}/{unit}. The price holds for every batch.</Text>
      <TextInput style={[styles.input, { minHeight: 60 }]} value={note} onChangeText={setNote} multiline maxLength={500} placeholder="A note to the seller (optional)" placeholderTextColor={design.ink3} />

      {batches > 0 ? (
        <View style={styles.sum}>
          <Text style={styles.sumBig}>{money(t * p, listing.currency)}</Text>
          <Text style={styles.body}>
            {batches} {batches === 1 ? 'batch' : 'batches'} of up to {b.toLocaleString('en-IN')} {unit}
            {batches > 1 ? `, over about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : ''}. Each batch is a deal you pay before it moves.
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <PressScale onPress={sending ? undefined : () => void send()} style={{ flex: 1 }} cardStyle={[styles.btn, styles.btnPrimary, sending && { opacity: 0.6 }]}>
          <Text style={styles.btnPrimaryText}>{sending ? 'Sending…' : 'Send to the seller'}</Text>
        </PressScale>
        <PressScale onPress={() => setOpen(false)} cardStyle={styles.btn}>
          <Text style={styles.btnText}>Cancel</Text>
        </PressScale>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={(v) => onChange(num(v))} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={design.ink3} />
    </View>
  );
}

const styles = StyleSheet.create({
  closed: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: design.mint, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(77,102,56,0.2)',
  },
  closedTitle: { fontFamily: font.sansSemi, fontSize: 15, color: colors.forest },
  closedArrow: { fontFamily: font.sansBold, fontSize: 18, color: colors.forest },
  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16, gap: 10 },
  kicker: { fontSize: 10, letterSpacing: 0.8, color: colors.sage },
  body: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: design.ink2 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2, marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: font.sans, fontSize: 15, color: design.ink, backgroundColor: design.bg,
  },
  hint: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink3 },
  pills: { flexDirection: 'row', gap: 7 },
  pill: { borderWidth: 1, borderColor: design.line, backgroundColor: design.bg, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 8 },
  pillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  pillTextOn: { color: colors.textInverse },
  sum: { backgroundColor: design.bg, borderRadius: 12, padding: 12, gap: 3 },
  sumBig: { fontFamily: font.sansBold, fontSize: 22, color: colors.forest },
  btn: { borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', backgroundColor: design.paper },
  btnPrimary: { backgroundColor: colors.forest, borderColor: colors.forest },
  btnText: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  btnPrimaryText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.textInverse },
});
