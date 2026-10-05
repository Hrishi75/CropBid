// =============================================================================
// SupplyContracts — the contracts section, for either side
// =============================================================================
// On the buyer's Contracts tab and the seller's Offers tab. Loads its own list
// on focus and renders nothing for an account with no contracts, so a screen
// can drop it in without knowing whether contracts apply.
//
// Each card: the terms (price, total, batch, how often), progress (batches
// made, batches delivered), when the next batch falls due, and the one or two
// moves open to this side: the seller accepts or declines a proposal, the
// buyer withdraws one, and either ends an active contract.
//
// A batch is an ordinary deal, so paying it and confirming its delivery
// happen on the deal cards below this section, not here.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Alert } from '../lib/alert';
import { Eyebrow, Mono } from './buyerKit';
import { PressScale } from './motion';
import { cancelSupplyContract, mySupplyContracts, respondSupplyContract } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { SupplyContract } from '../api/types';
import { cropEmojiFor } from '../utils/cropImages';
import { money, unitLabel } from '../lib/format';
import { colors, design, font } from '../theme';

const STATUS: Record<SupplyContract['status'], { label: string; color: string }> = {
  PROPOSED: { label: 'PROPOSED', color: colors.ember },
  ACTIVE: { label: 'ACTIVE', color: colors.sage },
  COMPLETED: { label: 'ALL BATCHES MADE', color: colors.sage },
  DECLINED: { label: 'DECLINED', color: design.ink3 },
  CANCELLED: { label: 'ENDED', color: design.ink3 },
};

const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function SupplyContracts({ side, onWaiting }: {
  side: 'BUYER' | 'SELLER';
  /** How many proposals wait on this viewer, so the screen's heading can count them. */
  onWaiting?: (n: number) => void;
}) {
  const [list, setList] = useState<SupplyContract[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    mySupplyContracts()
      .then((rows) => {
        setList(rows);
        onWaiting?.(side === 'SELLER' ? rows.filter((c) => c.status === 'PROPOSED').length : 0);
      })
      .catch(() => {});
  }, [onWaiting, side]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (list.length === 0) return null;

  async function act(c: SupplyContract, fn: () => Promise<unknown>, done?: string) {
    setBusy(c.id);
    try {
      await fn();
      if (done) Alert.alert(done.split('|')[0], done.split('|')[1]);
      load();
    } catch (e) {
      Alert.alert('Could not do that', errorMessage(e, 'Please try again'));
    } finally {
      setBusy(null);
    }
  }

  function confirmEnd(c: SupplyContract) {
    const proposal = c.status === 'PROPOSED';
    Alert.alert(
      proposal ? 'Withdraw this proposal?' : 'End this contract?',
      proposal
        ? 'The seller stops seeing it.'
        : 'No more batches will be made. Batches already made stay as deals, to be paid and delivered.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: proposal ? 'Withdraw' : 'End it', style: 'destructive', onPress: () => void act(c, () => cancelSupplyContract(c.id)) },
      ],
    );
  }

  const waiting = list.filter((c) => c.status === 'PROPOSED' && side === 'SELLER').length;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Eyebrow>Supply contracts</Eyebrow>
        {waiting > 0 ? <Mono style={styles.waiting}>● {waiting} TO ANSWER</Mono> : null}
      </View>
      {list.map((c) => {
        const unit = unitLabel(c.unit);
        const batchesTotal = Math.ceil(c.totalQuantity / c.batchQuantity);
        const made = c.batches.length;
        const delivered = c.batches.filter((b) => b.transactions.some((t) => t.deliveryStatus === 'CONFIRMED')).length;
        const toPay = c.batches.filter((b) => b.transactions.some((t) => t.paymentStatus === 'AWAITING_PAYMENT')).length;
        const other = side === 'BUYER'
          ? c.farmer?.farmerProfile?.businessName || c.farmer?.name || 'The seller'
          : c.buyer?.buyerProfile?.companyName || c.buyer?.name || 'The buyer';
        const st = STATUS[c.status];
        const open = c.status === 'PROPOSED' || c.status === 'ACTIVE';
        return (
          <View key={c.id} style={[styles.card, c.status === 'PROPOSED' && side === 'SELLER' && styles.cardHot]}>
            <View style={styles.top}>
              <View style={styles.tile}><Text style={styles.emoji}>{cropEmojiFor(c.cropName)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.crop} numberOfLines={1}>
                  {c.cropName}{c.cropVariety ? ` · ${c.cropVariety}` : ''}
                </Text>
                <Text style={styles.who} numberOfLines={1}>{side === 'BUYER' ? 'From' : 'For'} {other} · Grade {c.qualityGrade}</Text>
              </View>
              <Mono style={[styles.status, { color: st.color }]}>● {st.label}</Mono>
            </View>

            <View style={styles.terms}>
              <Cell label="PRICE" value={`${money(c.pricePerUnit, c.currency)}/${unit}`} />
              <Cell label="TOTAL" value={`${c.totalQuantity.toLocaleString('en-IN')} ${unit}`} sub={money(c.pricePerUnit * c.totalQuantity, c.currency)} />
              <Cell label="BATCHES" value={`${c.batchQuantity.toLocaleString('en-IN')} ${unit}`} sub={`every ${c.everyDays} days`} />
            </View>

            {c.status !== 'PROPOSED' && c.status !== 'DECLINED' ? (
              <View style={{ gap: 6 }}>
                <View style={styles.track}>
                  <View style={[styles.fillMade, { width: `${Math.max((made / batchesTotal) * 100, 2)}%` }]} />
                  <View style={[styles.fillDone, { width: `${(delivered / batchesTotal) * 100}%` }]} />
                </View>
                <Text style={styles.progress}>
                  {made} of {batchesTotal} batches made · {delivered} delivered
                  {toPay > 0 ? ` · ${toPay} to pay` : ''}
                </Text>
              </View>
            ) : null}

            {c.status === 'ACTIVE' && c.nextBatchAt ? (
              <Text style={styles.next}>Next batch on {day(c.nextBatchAt)}. It appears as a deal {side === 'BUYER' ? 'to pay' : 'for the buyer to pay'} below.</Text>
            ) : c.status === 'PROPOSED' ? (
              <Text style={styles.next}>
                {side === 'SELLER'
                  ? `First batch ${new Date(c.startsAt) > new Date() ? `on ${day(c.startsAt)}` : 'as soon as you accept'}. Each batch is a deal paid into escrow before it moves; CropBid books the transport and it is billed to you.`
                  : `Waiting for ${other} to accept. First batch ${new Date(c.startsAt) > new Date() ? `on ${day(c.startsAt)}` : 'as soon as they accept'}.`}
              </Text>
            ) : null}

            {c.message ? <Text style={styles.msg}>“{c.message}”</Text> : null}

            {c.status === 'PROPOSED' && side === 'SELLER' ? (
              <View style={styles.btns}>
                <PressScale
                  onPress={busy ? undefined : () => void act(
                    c,
                    () => respondSupplyContract(c.id, true),
                    new Date(c.startsAt) > new Date()
                      ? `Contract accepted|The first batch becomes a deal on ${day(c.startsAt)}. The buyer pays it before it moves.`
                      : 'Contract accepted|The first batch is a deal now. It moves once the buyer pays; CropBid books the transport.',
                  )}
                  style={{ flex: 1 }}
                  cardStyle={[styles.btn, styles.btnPrimary, busy === c.id && styles.dim]}
                >
                  <Text style={styles.btnPrimaryText}>Accept contract</Text>
                </PressScale>
                <PressScale onPress={busy ? undefined : () => void act(c, () => respondSupplyContract(c.id, false))} style={{ flex: 1 }} cardStyle={[styles.btn, busy === c.id && styles.dim]}>
                  <Text style={styles.btnText}>Decline</Text>
                </PressScale>
              </View>
            ) : open && !(c.status === 'PROPOSED' && side === 'SELLER') ? (
              <PressScale onPress={busy ? undefined : () => confirmEnd(c)} cardStyle={styles.endBtn}>
                <Text style={styles.endText}>{c.status === 'PROPOSED' ? 'Withdraw proposal' : 'End contract'}</Text>
              </PressScale>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Mono style={styles.cellLabel}>{label}</Mono>
      <Text style={styles.cellVal} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.cellSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  waiting: { fontSize: 10.5, color: colors.ember },
  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 14, gap: 12 },
  cardHot: { borderColor: 'rgba(200,96,43,0.45)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  tile: { width: 40, height: 40, borderRadius: 11, backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  crop: { fontFamily: font.sansSemi, fontSize: 15.5, color: design.ink },
  who: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 1 },
  status: { fontSize: 9.5, letterSpacing: 0.6 },
  terms: { flexDirection: 'row', gap: 10, backgroundColor: design.bg, borderRadius: 12, padding: 11 },
  cellLabel: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  cellVal: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 3 },
  cellSub: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 1 },
  track: { height: 7, borderRadius: 4, backgroundColor: design.paper2, overflow: 'hidden' },
  fillMade: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(107,142,78,0.35)', borderRadius: 4 },
  fillDone: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.sage, borderRadius: 4 },
  progress: { fontFamily: font.sans, fontSize: 12, color: design.ink2 },
  next: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3 },
  msg: { fontFamily: font.sans, fontSize: 13, color: design.ink2, fontStyle: 'italic' },
  btns: { flexDirection: 'row', gap: 9 },
  btn: { borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: design.paper },
  btnPrimary: { backgroundColor: colors.forest, borderColor: colors.forest },
  btnText: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  btnPrimaryText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.textInverse },
  dim: { opacity: 0.6 },
  endBtn: { alignSelf: 'flex-start' },
  endText: { fontFamily: font.sansSemi, fontSize: 13, color: colors.ember },
});
