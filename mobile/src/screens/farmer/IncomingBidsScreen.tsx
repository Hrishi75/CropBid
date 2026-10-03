// Farmer app · Incoming bids — wired to /bids/incoming. Status filter chips with
// live counts; each pending bid can be Accepted, Countered (inline price), or
// Rejected (PUT /bids/:id/accept|counter|reject). Refetches after each action.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { acceptBid, counterBid, incomingBids, rejectBid } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Bid, BidStatus } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import { cropEmojiFor } from '../../utils/cropImages';
import { Appear } from '../../components/motion';
import { IconCheck, IconClock } from '../../components/icons';

const TABS: { value: '' | BidStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'New' },
  { value: 'COUNTERED', label: 'You replied' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Declined' },
];

const STATUS_TONE: Record<string, 'sage' | 'ember' | 'paper'> = {
  PENDING: 'ember',
  COUNTERED: 'ember',
  ACCEPTED: 'sage',
  REJECTED: 'paper',
  EXPIRED: 'paper',
};

// Plain words for each status — "pending"/"countered"/"rejected" read like
// paperwork to a farmer; these say what actually happened.
const STATUS_WORD: Record<string, string> = {
  PENDING: 'new offer',
  COUNTERED: 'you replied',
  ACCEPTED: 'accepted',
  REJECTED: 'declined',
  EXPIRED: 'expired',
};

// Statuses the API adds later still need readable text, not raw strings like "IN_REVIEW".
function statusWord(status: string) {
  return STATUS_WORD[status] ?? status.toLowerCase().replace(/_/g, ' ');
}

export default function IncomingBidsScreen() {
  const insets = useSafeAreaInsets();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'' | BidStatus>('');

  const load = useCallback(async () => {
    try {
      const data = await incomingBids();
      setBids(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load bids'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bids) c[b.status] = (c[b.status] || 0) + 1;
    return c;
  }, [bids]);

  const visible = filter ? bids.filter((b) => b.status === filter) : bids;
  const pending = counts.PENDING || 0;
  // The escrow explainer under every pending card gets noisy — show it once, on the first.
  const firstPendingId = visible.find((b) => b.status === 'PENDING')?.id;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <Eyebrow>Offers from buyers</Eyebrow>
          <Text style={styles.h1}>
            {pending === 0
              ? <>You're <Text style={styles.h1Serif}>all caught up.</Text></>
              : <>{pending} {pending === 1 ? 'offer waits' : 'offers wait'} <Text style={styles.h1Serif}>for your reply.</Text></>}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TABS.map((t) => {
            const active = t.value === filter;
            const n = t.value ? counts[t.value] ?? 0 : bids.length;
            return (
              <Pressable key={t.label} onPress={() => setFilter(t.value)} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                <Text style={[styles.chipText, { color: active ? '#f4f1ea' : design.ink2 }]}>
                  {t.label}{n ? `  ${n}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : visible.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {filter ? 'Nothing here right now.' : 'No offers yet. When a buyer makes an offer on your crops, it will show here.'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {visible.map((b, i) => (
              <Appear key={b.id} index={i}>
                <BidRow bid={b} showExplainer={b.id === firstPendingId} onChanged={load} />
              </Appear>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BidRow({ bid, showExplainer, onChanged }: { bid: Bid; showExplainer: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showCounter, setShowCounter] = useState(false);
  const [counter, setCounter] = useState('');
  const currency = bid.currency || bid.listing?.currency || 'INR';
  const unit = unitLabel(bid.listing?.unit ?? '');

  async function act(kind: 'accept' | 'reject' | 'counter') {
    if (kind === 'counter') {
      const price = Number(counter);
      if (!(price > 0)) return;
      setBusy(kind);
      try {
        await counterBid(bid.id, price);
        setShowCounter(false);
        await onChanged();
      } catch (e) {
        setBusy(null);
        Alert.alert('Could not send counter', errorMessage(e));
      }
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'accept') await acceptBid(bid.id);
      else await rejectBid(bid.id);
      await onChanged();
    } catch (e) {
      setBusy(null);
      Alert.alert(kind === 'accept' ? 'Could not accept bid' : 'Could not reject bid', errorMessage(e));
    }
  }

  const isPending = bid.status === 'PENDING';
  const l = bid.listing;
  // Where their price sits against the seller's own range: the one comparison
  // a farmer makes before deciding, done for them.
  const verdict = l
    ? bid.bidPricePerUnit >= l.pricePerUnitMax
      ? { text: '✓ Your hoped price or more', tone: 'good' as const }
      : bid.bidPricePerUnit >= l.pricePerUnitMin
        ? { text: 'In your price range', tone: 'ok' as const }
        : { text: `Below your ${money(l.pricePerUnitMin, currency)} floor`, tone: 'low' as const }
    : null;
  const phone = bid.contactPhone || bid.buyer?.phone;

  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={styles.cardHead}>
        <View style={styles.cropTile}>
          <Text style={styles.cropEmoji}>{cropEmojiFor(l?.cropName)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardCrop} numberOfLines={1}>
            {l?.cropName ?? 'Listing'}{l?.cropVariety ? ` · ${l.cropVariety}` : ''}
          </Text>
          <Text style={styles.buyer} numberOfLines={1}>
            {bid.buyer?.name ?? 'Buyer'}
            {bid.isAgentBid ? ' · agent' : ''}
            {bid.buyer?.trustScore != null ? ` · trust ${Math.round(bid.buyer.trustScore)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusPill tone={STATUS_TONE[bid.status] ?? 'paper'}>{statusWord(bid.status)}</StatusPill>
          <Mono style={styles.ago}>{timeAgo(bid.createdAt).toUpperCase()}</Mono>
        </View>
      </View>

      {/* The offer itself: their price large, what it comes to beside it. */}
      <View style={styles.offerBox}>
        <View style={styles.offerMain}>
          <Mono style={styles.figLabel}>THEY OFFER</Mono>
          <Text style={styles.offerPrice}>
            {money(bid.bidPricePerUnit, currency)}
            <Text style={styles.offerUnit}> /{unit}</Text>
          </Text>
          {verdict ? (
            <View style={[styles.verdict, styles[`verdict_${verdict.tone}`]]}>
              <Text style={[styles.verdictText, styles[`verdictText_${verdict.tone}`]]} numberOfLines={1}>
                {verdict.text}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.offerSide}>
          <Fig label="QUANTITY" value={`${bid.quantity.toLocaleString('en-IN')} ${unit}`} />
          <Fig label="TOTAL" value={money(bid.totalAmount, currency)} />
        </View>
      </View>

      {bid.counterPrice != null ? (
        <View style={styles.youAsked}>
          <Mono style={styles.figLabel}>YOU ASKED</Mono>
          <Text style={styles.youAskedVal}>{money(bid.counterPrice, currency)}/{unit}</Text>
        </View>
      ) : null}

      {bid.message ? <Text style={styles.message}>“{bid.message}”</Text> : null}

      {(bid.deliveryAddress || phone) ? (
        <View style={styles.orderInfo}>
          {bid.deliveryAddress ? (
            <Text style={styles.orderInfoLine}>
              <Text style={styles.orderInfoLabel}>DELIVER TO  </Text>
              {bid.deliveryAddress}
            </Text>
          ) : null}
          {phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={styles.callBtn}>
              <Text style={styles.callText}>☎ Call buyer · {phone}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isPending ? (
        <>
          <Pressable
            style={({ pressed }) => [styles.btnAccept, pressed && { opacity: 0.9 }]}
            onPress={() => act('accept')}
            disabled={!!busy}
          >
            {busy === 'accept' ? (
              <ActivityIndicator size="small" color="#f4f1ea" />
            ) : (
              <>
                <IconCheck size={16} stroke="#f4f1ea" />
                <Text style={styles.btnAcceptText}>
                  Accept {money(bid.bidPricePerUnit, currency)}/{unit}
                </Text>
              </>
            )}
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btnGhost, showCounter && styles.btnGhostOn, pressed && { opacity: 0.85 }]}
              onPress={() => setShowCounter((v) => !v)}
              disabled={!!busy}
            >
              <Text style={styles.btnGhostText}>Ask my price</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnGhost, styles.btnDecline, pressed && { opacity: 0.85 }]}
              onPress={() => act('reject')}
              disabled={!!busy}
            >
              {busy === 'reject' ? (
                <ActivityIndicator size="small" color={colors.ember} />
              ) : (
                <Text style={styles.btnDeclineText}>Decline</Text>
              )}
            </Pressable>
          </View>

          {showCounter ? (
            <View style={styles.counterBox}>
              {/* One tap to ask for the price they already said they hoped
                  for, which is what most counters are. */}
              {l && l.pricePerUnitMax > bid.bidPricePerUnit ? (
                <Pressable onPress={() => setCounter(String(l.pricePerUnitMax))} style={styles.suggest}>
                  <Text style={styles.suggestText}>
                    Use your hoped price · {money(l.pricePerUnitMax, currency)}
                  </Text>
                </Pressable>
              ) : null}
              <View style={styles.counterRow}>
                <View style={styles.counterField}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    style={styles.counterInput}
                    value={counter}
                    onChangeText={setCounter}
                    keyboardType="numeric"
                    placeholder={`Your price per ${unit}`}
                    placeholderTextColor={design.ink3}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.btnSend, (pressed || !(Number(counter) > 0)) && { opacity: 0.5 }]}
                  onPress={() => act('counter')}
                  disabled={!(Number(counter) > 0) || !!busy}
                >
                  {busy === 'counter' ? <ActivityIndicator size="small" color="#f4f1ea" /> : <Text style={styles.btnSendText}>Send</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}

          {showExplainer ? (
            <Text style={styles.explain}>
              If you accept, the deal is fixed. The buyer pays first, CropBid holds the money,
              and it comes to you after the crop is delivered.
            </Text>
          ) : null}
        </>
      ) : bid.status === 'COUNTERED' ? (
        <View style={styles.waiting}>
          <IconClock size={14} stroke={design.ink3} />
          <Text style={styles.waitingText}>Waiting for the buyer to answer your price.</Text>
        </View>
      ) : null}
    </View>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Mono style={styles.figLabel}>{label}</Mono>
      <Text style={styles.figVal} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingVertical: 6 },
  h1: { marginTop: 6, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 29, color: colors.forest },

  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  chipActive: { backgroundColor: colors.forest },
  chipIdle: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  chipText: { fontFamily: font.sansMed, fontSize: 13 },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 18 },
  emptyText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18, padding: 16, gap: 12 },
  cardPending: { borderColor: 'rgba(200,96,43,0.35)' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropTile: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  cropEmoji: { fontSize: 22 },
  cardCrop: { fontFamily: font.sansBold, fontSize: 16, letterSpacing: -0.2, color: design.ink },
  buyer: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 2 },
  ago: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },

  offerBox: {
    flexDirection: 'row', gap: 12,
    backgroundColor: design.bg, borderRadius: 14, padding: 14,
  },
  offerMain: { flex: 1.4, minWidth: 0 },
  offerSide: { flex: 1, minWidth: 0, gap: 10, borderLeftWidth: 1, borderLeftColor: design.line, paddingLeft: 12 },
  offerPrice: { fontFamily: font.sansBold, fontSize: 24, letterSpacing: -0.6, color: design.ink, marginTop: 2 },
  offerUnit: { fontFamily: font.sans, fontSize: 13, color: design.ink3 },
  verdict: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8, maxWidth: '100%' },
  verdict_good: { backgroundColor: design.mint },
  verdict_ok: { backgroundColor: design.paper2 },
  verdict_low: { backgroundColor: 'rgba(200,96,43,0.12)' },
  verdictText: { fontFamily: font.sansSemi, fontSize: 11 },
  verdictText_good: { color: colors.forest },
  verdictText_ok: { color: design.ink2 },
  verdictText_low: { color: colors.ember },
  figLabel: { fontSize: 9, letterSpacing: 0.6, color: design.ink3 },
  figVal: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink, marginTop: 2 },

  youAsked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  youAskedVal: { fontFamily: font.sansBold, fontSize: 15, color: colors.ember },

  message: { fontFamily: font.sans, fontStyle: 'italic', fontSize: 13, lineHeight: 19, color: design.ink2, borderLeftWidth: 2, borderLeftColor: design.mint, paddingLeft: 10 },
  orderInfo: { padding: 12, backgroundColor: design.paper2, borderRadius: 12, gap: 8 },
  orderInfoLine: { fontFamily: font.sans, fontSize: 13, color: design.ink },
  orderInfoLabel: { fontFamily: font.mono, fontSize: 10, color: design.ink3, letterSpacing: 0.4 },
  callBtn: { alignSelf: 'flex-start', backgroundColor: design.mint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
  explain: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink3 },

  btnAccept: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, backgroundColor: colors.forest,
  },
  btnAcceptText: { fontFamily: font.sansSemi, fontSize: 15, color: '#f4f1ea' },
  actions: { flexDirection: 'row', gap: 10, marginTop: -2 },
  btnGhost: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
  },
  btnGhostOn: { borderColor: colors.forest, backgroundColor: design.mint },
  btnGhostText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest },
  btnDecline: { borderColor: 'rgba(200,96,43,0.3)' },
  btnDeclineText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.ember },

  counterBox: { gap: 8 },
  suggest: { alignSelf: 'flex-start', backgroundColor: design.paper2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  suggestText: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.forest },
  counterRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  counterField: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: design.line, borderRadius: 12, backgroundColor: design.bg, paddingLeft: 12,
  },
  rupee: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink3 },
  counterInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontFamily: font.sans, fontSize: 15, color: design.ink },
  btnSend: { paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.forest },
  btnSendText: { fontFamily: font.sansSemi, fontSize: 14, color: '#f4f1ea' },

  waiting: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: design.paper2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  waitingText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, color: design.ink2 },
});
