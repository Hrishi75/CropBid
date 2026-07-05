// Farmer app · Incoming bids — wired to /bids/incoming. Status filter chips with
// live counts; each pending bid can be Accepted, Countered (inline price), or
// Rejected (PUT /bids/:id/accept|counter|reject). Refetches after each action.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { acceptBid, counterBid, incomingBids, rejectBid } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Bid, BidStatus } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';

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
            {pending} {pending === 1 ? 'offer waits' : 'offers wait'} <Text style={styles.h1Serif}>for your reply.</Text>
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
            {visible.map((b) => (
              <BidRow key={b.id} bid={b} showExplainer={b.id === firstPendingId} onChanged={load} />
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

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.buyer} numberOfLines={1}>
            {bid.buyer?.name ?? 'Buyer'}
            {bid.isAgentBid ? <Text style={styles.agentTag}>  · agent</Text> : null}
          </Text>
          <Text style={styles.cardCrop} numberOfLines={1}>
            {bid.listing?.cropName ?? 'Listing'}{bid.listing?.cropVariety ? ` · ${bid.listing.cropVariety}` : ''}
          </Text>
        </View>
        <StatusPill tone={STATUS_TONE[bid.status] ?? 'paper'}>{statusWord(bid.status)}</StatusPill>
      </View>

      <Text style={styles.sub}>
        {bid.buyer?.trustScore != null ? `Trust ${Math.round(bid.buyer.trustScore)} · ` : ''}
        {bid.quantity.toLocaleString('en-IN')} {unit} · {timeAgo(bid.createdAt)}
      </Text>

      <View style={styles.figs}>
        <Fig label="THEIR PRICE" value={`${money(bid.bidPricePerUnit, currency)}/${unit}`} />
        {bid.counterPrice != null ? <Fig label="YOUR PRICE" value={`${money(bid.counterPrice, currency)}/${unit}`} hot /> : null}
        <Fig label="TOTAL MONEY" value={money(bid.totalAmount, currency)} />
      </View>

      {bid.message ? <Text style={styles.message}>“{bid.message}”</Text> : null}

      {isPending ? (
        <>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btnAccept, pressed && { opacity: 0.9 }]}
              onPress={() => act('accept')}
              disabled={!!busy}
            >
              {busy === 'accept' ? (
                <ActivityIndicator size="small" color="#f4f1ea" />
              ) : (
                <Text style={styles.btnAcceptText}>Accept {money(bid.bidPricePerUnit, currency)}</Text>
              )}
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => setShowCounter((s) => !s)} disabled={!!busy}>
              <Text style={styles.btnGhostText}>Ask my price</Text>
            </Pressable>
            <Pressable style={styles.btnLink} onPress={() => act('reject')} disabled={!!busy}>
              {busy === 'reject' ? (
                <ActivityIndicator size="small" color={colors.ember} />
              ) : (
                <Text style={styles.btnLinkText}>Decline</Text>
              )}
            </Pressable>
          </View>
          {showExplainer ? (
            <Text style={styles.explain}>
              If you accept, the deal is fixed. The buyer pays first — the money is kept safe and
              comes to you after the crop is delivered.
            </Text>
          ) : null}

          {showCounter ? (
            <View style={styles.counterRow}>
              <TextInput
                style={styles.counterInput}
                value={counter}
                onChangeText={setCounter}
                keyboardType="numeric"
                placeholder={`Your price per ${unit}`}
                placeholderTextColor={design.ink3}
              />
              <Pressable
                style={({ pressed }) => [styles.btnSend, (pressed || !(Number(counter) > 0)) && { opacity: 0.5 }]}
                onPress={() => act('counter')}
                disabled={!(Number(counter) > 0) || !!busy}
              >
                {busy === 'counter' ? <ActivityIndicator size="small" color="#f4f1ea" /> : <Text style={styles.btnSendText}>Send</Text>}
              </Pressable>
            </View>
          ) : null}
        </>
      ) : bid.status === 'COUNTERED' ? (
        <Mono style={styles.waiting}>
          You asked for {bid.counterPrice != null ? `${money(bid.counterPrice, currency)}/${unit}` : 'a different price'} — waiting for the buyer's reply.
        </Mono>
      ) : null}
    </View>
  );
}

function Fig({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Mono style={styles.figLabel}>{label}</Mono>
      <Mono style={[styles.figVal, hot && { color: colors.ember }]}>{value}</Mono>
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
  chipIdle: { backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line },
  chipText: { fontFamily: font.sansMed, fontSize: 13 },

  errorText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 18 },
  emptyText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  buyer: { fontFamily: font.sansMed, fontSize: 15.5, color: design.ink },
  agentTag: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3 },
  cardCrop: { fontFamily: font.sans, fontSize: 13, color: design.ink3, marginTop: 1 },
  sub: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 8 },

  figs: { flexDirection: 'row', gap: 12, marginTop: 12 },
  figLabel: { fontSize: 10, letterSpacing: 0.5, color: design.ink3 },
  figVal: { fontFamily: font.monoSemi, fontSize: 15, color: design.ink, marginTop: 2 },

  message: { fontFamily: font.sans, fontStyle: 'italic', fontSize: 13, color: design.ink2, marginTop: 12, padding: 10, backgroundColor: design.paper2, borderRadius: 8 },
  explain: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 10 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  btnAccept: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: colors.forest },
  btnAcceptText: { fontFamily: font.sansMed, fontSize: 13.5, color: '#f4f1ea' },
  btnGhost: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: design.line },
  btnGhostText: { fontFamily: font.sansMed, fontSize: 13.5, color: design.ink2 },
  btnLink: { paddingVertical: 11, paddingHorizontal: 8 },
  btnLinkText: { fontFamily: font.sansMed, fontSize: 13.5, color: colors.ember },

  counterRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  counterInput: { flex: 1, borderWidth: 1, borderColor: design.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontFamily: font.sans, fontSize: 15, color: design.ink, backgroundColor: design.bg },
  btnSend: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.forest },
  btnSendText: { fontFamily: font.sansMed, fontSize: 14, color: '#f4f1ea' },

  waiting: { fontSize: 12, color: design.ink3, marginTop: 12 },
});
