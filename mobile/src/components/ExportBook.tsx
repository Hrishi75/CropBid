// =============================================================================
// ExportBook — an exporter's dashboard: volume, where it came from, where it is
// =============================================================================
// An exporter thinks in tonnes filling containers, not in rupees spent, so
// this is the part of the dashboard only an EXPORTER buyer gets:
//
//   - the book: tonnes contracted, across every live or finished deal
//   - by crop: what those tonnes are
//   - sourced from: which states they come from, which is what decides the
//     inland freight and which port is nearest
//   - on the way: every unfinished deal by where it actually is
//
// Everything is computed from the buyer's own transactions (GET /transactions,
// which carries the bid's quantity, the lot's unit and state, and the
// shipment), so it cannot disagree with Contracts. A cancelled or refunded
// deal is left out: those tonnes are not coming.
//
// TONNES, whatever the lot was listed in, because "400 qtl + 30 t + 900 kg"
// is not a number anyone can plan a container around.
//
// WHAT IT DOES NOT SAY: "shipment to port". A deal struck on a listing is
// delivered where the deal says, and CropBid books that carrier (CLAUDE.md
// §2a). An export request names a port; a bid on a lot does not.
// =============================================================================

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Mono } from './buyerKit';
import type { Transaction, Unit } from '../api/types';
import { cropEmojiFor } from '../utils/cropImages';
import { money } from '../lib/format';
import { colors, design, font } from '../theme';

const TONNES_PER: Record<Unit, number> = { KG: 0.001, QUINTAL: 0.1, TONNE: 1 };

/** A deal's volume in tonnes, or 0 when the record lacks the bid or the lot. */
export function dealTonnes(t: Transaction): number {
  const q = t.bid?.quantity ?? 0;
  const unit = t.listing?.unit;
  return unit ? q * TONNES_PER[unit] : 0;
}

/** The deals whose goods are still coming or have come. */
const counted = (txs: Transaction[]) =>
  txs.filter((t) => t.paymentStatus !== 'CANCELLED' && t.paymentStatus !== 'REFUNDED' && !t.retailOrder);

type Stage = 'pay' | 'booking' | 'collecting' | 'road' | 'arrived';

/** Where an unfinished deal is, read off its own states. null once confirmed. */
export function dealStage(t: Transaction): Stage | null {
  if (t.deliveryStatus === 'CONFIRMED') return null;
  if (t.paymentStatus === 'AWAITING_PAYMENT') return 'pay';
  if (t.deliveryStatus === 'DELIVERED') return 'arrived';
  const s = t.shipment?.status;
  // No booking on record, but the seller has marked it on the way: believe
  // the deal's own state over the absence of a shipment row.
  if (!s) return t.deliveryStatus === 'IN_TRANSIT' ? 'road' : 'booking';
  if (s === 'PENDING_PICKUP' || s === 'PICKED_UP') return 'collecting';
  if (s === 'DELIVERED') return 'arrived';
  return 'road';
}

const STAGES: Array<{ key: Stage; label: string; hint: string }> = [
  { key: 'pay', label: 'To pay', hint: 'The seller sends it once you pay' },
  { key: 'booking', label: 'Booking transport', hint: 'CropBid is booking the carrier' },
  { key: 'collecting', label: 'Being collected', hint: 'Carrier booked, at the seller' },
  { key: 'road', label: 'On the road', hint: 'Travelling to you' },
  { key: 'arrived', label: 'Arrived', hint: 'Confirm it so the seller is due' },
];

const fmtT = (n: number) =>
  `${n >= 100 ? Math.round(n).toLocaleString('en-IN') : (Math.round(n * 10) / 10).toLocaleString('en-IN')} t`;

function tally(rows: Array<[string, number]>) {
  const m = new Map<string, number>();
  for (const [k, v] of rows) m.set(k, (m.get(k) ?? 0) + v);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function ExportBook({
  txs, onOpenContracts,
}: {
  txs: Transaction[];
  onOpenContracts: () => void;
}) {
  const deals = counted(txs);
  if (deals.length === 0) {
    return (
      <View style={styles.wrap}>
        <Eyebrow>Your export book</Eyebrow>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No deals yet. Tonnes you contract show here by crop and by the state they come from.
          </Text>
        </View>
      </View>
    );
  }

  const total = deals.reduce((s, t) => s + dealTonnes(t), 0);
  const value = deals.reduce((s, t) => s + t.totalAmount, 0);
  const done = deals.filter((t) => t.deliveryStatus === 'CONFIRMED');
  const doneT = done.reduce((s, t) => s + dealTonnes(t), 0);
  const byCrop = tally(deals.map((t) => [t.listing?.cropName ?? 'Other', dealTonnes(t)]));
  const byState = tally(deals.map((t) => [t.listing?.state || 'Not stated', dealTonnes(t)]));
  const top = byCrop[0]?.[1] || 1;

  const open = deals.map((t) => ({ t, stage: dealStage(t) })).filter((d) => d.stage);
  const stageCount = (k: Stage) => open.filter((d) => d.stage === k);

  return (
    <View style={styles.wrap}>
      <Eyebrow>Your export book</Eyebrow>

      <View style={styles.card}>
        <View style={styles.bookRow}>
          <View style={{ flex: 1 }}>
            <Mono style={styles.k}>CONTRACTED</Mono>
            <Text style={styles.big}>{fmtT(total)}</Text>
            <Text style={styles.sub}>{deals.length} {deals.length === 1 ? 'deal' : 'deals'} · {money(value)}</Text>
          </View>
          <View style={styles.doneBox}>
            <Mono style={styles.k}>RECEIVED</Mono>
            <Text style={styles.mid}>{fmtT(doneT)}</Text>
            <Text style={styles.sub}>{total > 0 ? Math.round((doneT / total) * 100) : 0}% of the book</Text>
          </View>
        </View>

        <Mono style={[styles.k, { marginTop: 16 }]}>BY CROP</Mono>
        {byCrop.slice(0, 5).map(([crop, t]) => (
          <View key={crop} style={styles.barRow}>
            <Text style={styles.barEmoji}>{cropEmojiFor(crop)}</Text>
            <Text style={styles.barName} numberOfLines={1}>{crop}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max((t / top) * 100, 3)}%` }]} />
            </View>
            <Text style={styles.barVal}>{fmtT(t)}</Text>
          </View>
        ))}

        <Mono style={[styles.k, { marginTop: 14 }]}>SOURCED FROM</Mono>
        <View style={styles.states}>
          {byState.map(([state, t]) => (
            <View key={state} style={styles.state}>
              <Text style={styles.stateName}>{state}</Text>
              <Text style={styles.stateVal}>{fmtT(t)} · {total > 0 ? Math.round((t / total) * 100) : 0}%</Text>
            </View>
          ))}
        </View>
      </View>

      {open.length > 0 ? (
        <Pressable onPress={onOpenContracts} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
          <View style={styles.pipeHead}>
            <Mono style={styles.k}>ON THE WAY · {open.length} {open.length === 1 ? 'DEAL' : 'DEALS'}</Mono>
            <Text style={styles.link}>Contracts →</Text>
          </View>
          {STAGES.map((s) => {
            const rows = stageCount(s.key);
            if (rows.length === 0) return null;
            const t = rows.reduce((n, d) => n + dealTonnes(d.t), 0);
            return (
              <View key={s.key} style={styles.stage}>
                <View style={[styles.dot, s.key === 'pay' || s.key === 'arrived' ? styles.dotHot : null]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stageLabel}>{s.label} · {rows.length}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {rows.map((d) => d.t.listing?.cropName).filter(Boolean).join(', ')} · {s.hint}
                  </Text>
                </View>
                <Text style={styles.barVal}>{fmtT(t)}</Text>
              </View>
            );
          })}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 22, gap: 10 },
  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  empty: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink3 },
  bookRow: { flexDirection: 'row', gap: 12 },
  k: { fontSize: 9.5, letterSpacing: 0.8, color: design.ink3 },
  big: { fontFamily: font.sansBold, fontSize: 30, letterSpacing: -0.8, color: colors.forest, marginTop: 2 },
  mid: { fontFamily: font.sansSemi, fontSize: 20, color: design.ink, marginTop: 2 },
  sub: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 2 },
  doneBox: { backgroundColor: design.bg, borderRadius: 12, padding: 10, minWidth: 120 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  barEmoji: { fontSize: 16, width: 22 },
  barName: { width: 78, fontFamily: font.sansMed, fontSize: 13, color: design.ink },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: design.paper2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.sage },
  barVal: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink, minWidth: 52, textAlign: 'right' },
  states: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  state: { backgroundColor: design.mint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  stateName: { fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
  stateVal: { fontFamily: font.sans, fontSize: 11.5, color: design.ink2, marginTop: 1 },
  pipeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  link: { fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: design.lineLight },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  dotHot: { backgroundColor: colors.ember },
  stageLabel: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
});
