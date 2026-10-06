// =============================================================================
// MyOffersScreen — what this farmer has offered against buyer demand
// =============================================================================
// Every answer sent from the demand board, in status tabs. Two kinds land here
// and they mean different things:
//   INSTANT — filled at the buyer's posted price. Already ACCEPTED when it was
//             made; there was never anything to wait for.
//   COUNTER — the farmer's own price, sitting with the buyer until they decide.
// A pending counter can still be pulled back; nothing else can, which is why
// Withdraw only appears on one of them.
//
// A BUYER CAN COUNTER BACK (a restaurant negotiates every order). That offer
// is COUNTERED and leads the list as "Buyer countered": accept their price,
// which makes the deal, or send a new one between theirs and yours.
//
// Mirrors client/src/pages/farmer/MyOffers.tsx.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eyebrow, Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { acceptBuyerCounter, myRequirementOffers, reviseRequirementOffer, withdrawRequirementOffer } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { money, timeAgo, unitLabel } from '../../lib/format';
import type { RequirementOffer, RequirementOfferStatus } from '../../api/types';
import { colors, design, font } from '../../theme';

const TABS: Array<{ value: RequirementOfferStatus | ''; label: string }> = [
  { value: 'COUNTERED', label: 'Buyer countered' },
  { value: 'PENDING', label: 'Awaiting buyer' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];

const STATUS_COLOR: Record<RequirementOfferStatus, string> = {
  PENDING: colors.wheat,
  COUNTERED: colors.ember,
  ACCEPTED: colors.sage,
  REJECTED: design.ink3,
  WITHDRAWN: design.ink3,
  EXPIRED: design.ink3,
};

export default function MyOffersScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<RequirementOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RequirementOfferStatus | ''>('PENDING');
  const [revising, setRevising] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await myRequirementOffers();
      setOffers(list);
      setError(null);
      // A counter is the seller's move, so it is where they land.
      if (list.some((o) => o.status === 'COUNTERED')) setTab((t) => (t === 'PENDING' ? 'COUNTERED' : t));
    } catch (e) {
      setError(errorMessage(e, 'Could not load your offers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': offers.length };
    for (const o of offers) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [offers]);

  const visible = useMemo(
    () => (tab ? offers.filter((o) => o.status === tab) : offers),
    [offers, tab],
  );

  async function takeTheirPrice(o: RequirementOffer) {
    setBusy(o.id);
    try {
      await acceptBuyerCounter(o.id);
      Alert.alert('Deal made', 'The buyer has been told. It is in your deliveries once they pay.');
      await load();
    } catch (e) {
      Alert.alert('Could not accept it', errorMessage(e, 'Please try again'));
    } finally {
      setBusy(null);
    }
  }

  async function sendNewPrice(o: RequirementOffer) {
    const price = Number(newPrice);
    if (!(price > 0)) { Alert.alert('Enter a price', 'Type your new price per unit.'); return; }
    setBusy(o.id);
    try {
      await reviseRequirementOffer(o.id, price);
      setRevising(null);
      setNewPrice('');
      await load();
    } catch (e) {
      Alert.alert('Could not send it', errorMessage(e, 'Please try again'));
    } finally {
      setBusy(null);
    }
  }

  function confirmWithdraw(o: RequirementOffer) {
    Alert.alert('Withdraw this offer?', 'The buyer stops seeing it. You can offer again later.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdrawRequirementOffer(o.id);
            await load();
          } catch (e) {
            Alert.alert('Could not withdraw it', errorMessage(e, 'Please try again'));
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <Eyebrow>YOUR OFFERS</Eyebrow>
        <Text style={styles.title}>What you have offered.</Text>
        <Text style={styles.lede}>
          Your answers to buyer demand — filled outright, or waiting on the buyer.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsPad}>
          {TABS.map((t) => {
            const on = tab === t.value;
            const n = counts[t.value] ?? 0;
            return (
              <Pressable key={t.label} onPress={() => setTab(t.value)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {t.label}{n > 0 ? ` · ${n}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && visible.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🤝</Text>
            <Text style={styles.emptyTitle}>
              {offers.length === 0 ? 'You have not offered on anything yet' : 'Nothing in this tab'}
            </Text>
            <Text style={styles.emptyBody}>
              {offers.length === 0
                ? 'The demand board lists what buyers are asking for. Fill one at their price, or counter with yours.'
                : 'Try another tab.'}
            </Text>
            {offers.length === 0 ? (
              <PressScale onPress={() => nav.navigate('Demand')} cardStyle={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Open the demand board</Text>
              </PressScale>
            ) : null}
          </View>
        ) : null}

        {visible.map((o) => {
          const r = o.requirement;
          const unit = r ? unitLabel(r.unit) : '';
          return (
            <PressScale
              key={o.id}
              onPress={r ? () => nav.navigate('RequirementDetail', { id: o.requirementId, preview: r }) : undefined}
              scaleTo={0.99}
              cardStyle={styles.card}
            >
              <View style={styles.cardHead}>
                <Text style={styles.crop} numberOfLines={1}>
                  {r ? `${r.cropName}${r.cropVariety ? ` · ${r.cropVariety}` : ''}` : 'Requirement'}
                </Text>
                <Mono style={[styles.status, { color: STATUS_COLOR[o.status] }]}>● {o.status === 'COUNTERED' ? 'BUYER COUNTERED' : o.status}</Mono>
              </View>

              <Text style={styles.terms}>
                {o.quantity.toLocaleString('en-IN')} {unit} at {money(o.pricePerUnit, o.currency)}
                {unit ? `/${unit}` : ''} · <Text style={styles.total}>{money(o.totalAmount, o.currency)}</Text>
              </Text>
              <Text style={styles.meta}>
                {o.kind === 'INSTANT' ? "Filled at the buyer's price" : 'Countered with your price'}
                {' · '}{timeAgo(o.createdAt)}
                {r ? ` · deliver to ${r.deliveryLocation}` : ''}
              </Text>
              {o.message ? <Text style={styles.message}>{o.message}</Text> : null}

              {/* Only a counter still waiting on the buyer can be pulled back.
                  An accepted offer is a deal, and a rejected one is over. */}
              {o.status === 'COUNTERED' && o.buyerCounterPrice != null ? (
                <View style={styles.counterBox}>
                  <Text style={styles.counterLine}>
                    They would pay {money(o.buyerCounterPrice, o.currency)}{unit ? `/${unit}` : ''} · {money(o.buyerCounterPrice * o.quantity, o.currency)} in all
                  </Text>
                  {revising === o.id ? (
                    <View style={styles.reviseRow}>
                      <TextInput
                        style={styles.reviseInput}
                        value={newPrice}
                        onChangeText={(t) => setNewPrice(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder={`Between ${money(o.buyerCounterPrice, o.currency)} and ${money(o.pricePerUnit, o.currency)}`}
                        placeholderTextColor={design.ink3}
                        autoFocus
                      />
                      <PressScale onPress={busy ? undefined : () => void sendNewPrice(o)} cardStyle={[styles.btn, styles.btnPrimary]}>
                        <Text style={styles.btnPrimaryText}>Send</Text>
                      </PressScale>
                    </View>
                  ) : (
                    <View style={styles.reviseRow}>
                      <PressScale onPress={busy ? undefined : () => void takeTheirPrice(o)} style={{ flex: 1 }} cardStyle={[styles.btn, styles.btnPrimary, busy === o.id && { opacity: 0.6 }]}>
                        <Text style={styles.btnPrimaryText}>Accept {money(o.buyerCounterPrice, o.currency)}</Text>
                      </PressScale>
                      <PressScale onPress={() => { setRevising(o.id); setNewPrice(''); }} style={{ flex: 1 }} cardStyle={styles.btn}>
                        <Text style={styles.btnText}>New price</Text>
                      </PressScale>
                    </View>
                  )}
                </View>
              ) : null}

              {(o.status === 'PENDING' || o.status === 'COUNTERED') && o.kind === 'COUNTER' ? (
                <Pressable onPress={() => confirmWithdraw(o)} hitSlop={6}>
                  <Text style={styles.withdraw}>Withdraw offer</Text>
                </Pressable>
              ) : null}
            </PressScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  counterBox: { backgroundColor: 'rgba(200,96,43,0.08)', borderRadius: 12, padding: 12, gap: 10, marginTop: 4 },
  counterLine: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  reviseRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  reviseInput: {
    flex: 1, borderWidth: 1, borderColor: design.line, borderRadius: 11, backgroundColor: design.paper,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.sans, fontSize: 14.5, color: design.ink,
  },
  btn: { borderWidth: 1, borderColor: design.line, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', backgroundColor: design.paper },
  btnPrimary: { backgroundColor: colors.forest, borderColor: colors.forest },
  btnText: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  btnPrimaryText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.textInverse },
  head: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: design.bg,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
  },
  title: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.5, color: design.ink, marginTop: 6 },
  lede: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 4 },

  body: { padding: 14, gap: 12, paddingBottom: 32 },
  tabsPad: { gap: 7, paddingRight: 14 },
  tab: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tabOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  tabText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  tabTextOn: { color: colors.textInverse },

  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
    gap: 3,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  crop: { flex: 1, fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  status: { fontSize: 9.5, letterSpacing: 0.6 },
  terms: { fontFamily: font.sans, fontSize: 13, color: design.ink2, marginTop: 4 },
  total: { fontFamily: font.sansBold, color: design.ink },
  meta: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 2 },
  message: {
    backgroundColor: design.paper2,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: design.ink2,
  },
  withdraw: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.ember, marginTop: 10 },

  error: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.error },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 16, color: design.ink, textAlign: 'center' },
  emptyBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, textAlign: 'center' },
  emptyBtn: {
    marginTop: 10,
    backgroundColor: colors.forest,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: { fontFamily: font.sansBold, fontSize: 13.5, color: colors.textInverse },
});
