// Contracts — wired to /transactions. The buyer's Contracts tab and the
// seller's "Your sales", one screen for both sides of a deal.
//
// A LIST OF DEALS, ONE OPEN AT A TIME. Each deal is a card with its delivery
// progress; tapping one opens its terms and its one next step inside the card.
// It used to be a hero for one deal, its terms, and the other deals in a list
// below, which a fixed pay bar and the tab bar covered, so a second deal could
// not be reached at all.
//
// The confirm step marks the seller due their money; it does not pay them
// (CLAUDE.md §6: payouts are made by hand), so no label here says "release".
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrow, IconArrowLeft, IconCheck, IconShield } from '../../components/icons';
import { Mono, StatusPill } from '../../components/buyerKit';
import { Appear } from '../../components/motion';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { cropEmojiFor } from '../../utils/cropImages';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { createPaymentOrder, myTransactions, updateDeliveryStatus, type PaymentOrder } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { DeliveryStatus, Transaction } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import RazorpayCheckout from '../../components/RazorpayCheckout';
import { SupplyContracts } from '../../components/SupplyContracts';

const DELIVERY_LABEL: Record<Transaction['deliveryStatus'], string> = {
  PENDING: 'Awaiting shipment',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

// The one word for where a deal is, from both columns together. The pill used
// to show payment alone, so a delivered deal still read "Paid".
function stageLabel(tx: Transaction): string {
  if (tx.paymentStatus === 'REFUNDED') return 'Refunded';
  if (tx.paymentStatus === 'CANCELLED' || tx.deliveryStatus === 'CANCELLED') return 'Cancelled';
  if (tx.paymentStatus === 'AWAITING_PAYMENT') return 'To pay';
  if (tx.paymentStatus === 'RELEASED' || tx.deliveryStatus === 'CONFIRMED') return 'Settled';
  if (tx.deliveryStatus === 'DELIVERED') return 'Delivered';
  if (tx.deliveryStatus === 'IN_TRANSIT') return 'On the way';
  return 'Paid';
}

function statusTone(tx: Transaction): 'ember' | 'sage' | 'paper' {
  // Orange only for "you still have to pay"; paid and settled are good news.
  if (tx.paymentStatus === 'AWAITING_PAYMENT') return 'ember';
  if (tx.paymentStatus === 'REFUNDED' || tx.paymentStatus === 'CANCELLED') return 'paper';
  return 'sage';
}

// The four steps a trade deal goes through, and how far this one has got.
const STEPS = ['Paid', 'Shipped', 'Delivered', 'Confirmed'];
function stepOf(tx: Transaction): number {
  if (tx.paymentStatus === 'AWAITING_PAYMENT') return 0;
  if (tx.deliveryStatus === 'CONFIRMED' || tx.paymentStatus === 'RELEASED') return 4;
  if (tx.deliveryStatus === 'DELIVERED') return 3;
  if (tx.deliveryStatus === 'IN_TRANSIT') return 2;
  return 1;
}

type Filter = 'all' | 'todo' | 'done';

export default function SettleScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const nav = useNavigation<any>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await myTransactions();
      setTxs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load contracts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Deals still needing someone, and deals that are over.
  const isDone = (t: Transaction) =>
    t.paymentStatus === 'RELEASED' || t.paymentStatus === 'REFUNDED' || t.paymentStatus === 'CANCELLED';
  // What this viewer has to do on a deal, if anything. Mirrors deliveryAction
  // and the pay rule below, for a deal that is not the open one.
  const needsMe = (t: Transaction): string | null => {
    const buyer = user?.id === t.buyerId;
    const seller = user?.id === t.farmerId;
    if (buyer && t.paymentStatus === 'AWAITING_PAYMENT') return `Pay ${money(t.totalAmount, t.currency)}`;
    if (buyer && t.deliveryStatus === 'DELIVERED') return 'Confirm it arrived';
    if (seller && t.paymentStatus === 'ESCROW' && t.deliveryStatus === 'PENDING') return 'Mark it shipped';
    if (seller && t.deliveryStatus === 'IN_TRANSIT') return 'Mark it delivered';
    return null;
  };
  // Deals waiting on this viewer first, then the rest newest first.
  const shown = txs
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? isDone(t) : !isDone(t)))
    .sort((a, b) => Number(!!needsMe(b)) - Number(!!needsMe(a)) || b.createdAt.localeCompare(a.createdAt));
  // The open card: the one tapped, else the first that needs something.
  const tx =
    txs.find((t) => t.id === selectedId) ??
    shown.find((t) => !!needsMe(t)) ??
    shown.find((t) => !isDone(t)) ??
    shown[0] ??
    null;
  const isBuyer = user?.id === tx?.buyerId;
  const isFarmer = user?.id === tx?.farmerId;
  const canPay = !!tx && isBuyer && tx.paymentStatus === 'AWAITING_PAYMENT';

  async function onPayNow() {
    if (!tx || paying) return;
    setPaying(true);
    try {
      // Mint (or reuse) the Razorpay order, then hand it to the WebView checkout.
      setOrder(await createPaymentOrder(tx.id));
    } catch (e) {
      Alert.alert('Could not start payment', errorMessage(e));
    } finally {
      setPaying(false);
    }
  }

  async function onPaid(updated: Transaction) {
    setOrder(null);
    // Trust the verified transaction from the server, then refetch for good measure.
    setTxs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    await load();
  }

  function onCheckoutClose(err?: string) {
    setOrder(null);
    if (err) Alert.alert('Payment not completed', err);
  }

  // Drives PATCH /transactions/:id/delivery. The server enforces who may make
  // each transition: farmer ships (PENDING→IN_TRANSIT→DELIVERED), buyer confirms
  // (DELIVERED→CONFIRMED, which releases escrow).
  function advanceDelivery(status: DeliveryStatus, title: string, message: string) {
    if (!tx || busy) return;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy(true);
          try {
            await updateDeliveryStatus(tx.id, status);
            await load();
          } catch (e) {
            Alert.alert('Could not update', errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  const onConfirmDelivery = () =>
    tx &&
    advanceDelivery(
      'CONFIRMED',
      'Confirm delivery',
      `This marks the seller due their ${money(tx.totalAmount, tx.currency)}. Confirm you received the goods?`,
    );
  const onShip = () =>
    advanceDelivery('IN_TRANSIT', 'Mark as shipped', 'Confirm the crop has been dispatched to the buyer?');
  const onDeliver = () =>
    advanceDelivery('DELIVERED', 'Mark as delivered', 'Confirm the shipment has reached the buyer?');

  // The single context-aware delivery action for the bottom bar. `go` = tappable,
  // `idle` = a disabled status label (waiting on the other party).
  type DeliveryAction = { kind: 'go'; label: string; onPress: () => void } | { kind: 'idle'; label: string };
  function deliveryAction(): DeliveryAction {
    if (!tx) return { kind: 'idle', label: '' };
    if (isBuyer && tx.deliveryStatus === 'DELIVERED') {
      return { kind: 'go', label: 'Confirm it arrived', onPress: onConfirmDelivery };
    }
    if (isFarmer && tx.deliveryStatus === 'PENDING') {
      if (tx.paymentStatus === 'ESCROW') return { kind: 'go', label: 'Mark as shipped', onPress: onShip };
      return {
        kind: 'idle',
        label: tx.paymentStatus === 'AWAITING_PAYMENT' ? 'Waiting for buyer payment' : DELIVERY_LABEL[tx.deliveryStatus],
      };
    }
    if (isFarmer && tx.deliveryStatus === 'IN_TRANSIT') {
      return { kind: 'go', label: 'Mark as delivered', onPress: onDeliver };
    }
    return {
      kind: 'idle',
      label: tx.deliveryStatus === 'CONFIRMED' ? 'Delivery confirmed' : DELIVERY_LABEL[tx.deliveryStatus],
    };
  }

  // Status/escrow guidance, written for whichever side is viewing.
  function escrowNote(): string {
    if (!tx) return '';
    if (isFarmer) {
      if (tx.paymentStatus === 'AWAITING_PAYMENT') return 'Waiting for the buyer to fund escrow. You can ship once the payment is held.';
      if (tx.paymentStatus === 'ESCROW') {
        if (tx.deliveryStatus === 'PENDING') return 'Payment is secured in escrow. Ship the crop, then mark it shipped here.';
        if (tx.deliveryStatus === 'IN_TRANSIT') return 'In transit. Mark it delivered once it reaches the buyer.';
        if (tx.deliveryStatus === 'DELIVERED') return 'Delivered. Waiting for the buyer to confirm it arrived.';
        return 'Funds are held in escrow.';
      }
      if (tx.paymentStatus === 'RELEASED') return 'Settled. You are due this payment; CropBid sends it to the account on your profile.';
      return 'This contract was refunded to the buyer.';
    }
    if (tx.paymentStatus === 'AWAITING_PAYMENT') return 'Pay to start the deal. CropBid holds the money and books the delivery; the seller is due it once you confirm the goods arrived.';
    if (tx.paymentStatus === 'ESCROW') return 'Your payment is held by CropBid. Confirming delivery marks the seller due their money.';
    if (tx.paymentStatus === 'RELEASED') return 'This contract is settled. The seller is due their payment.';
    return 'This contract was refunded to you.';
  }

  if (loading) {
    return (
      <View style={[styles.flex, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  const terms: [string, string][] = tx
    ? [
        [isBuyer ? 'Seller' : 'Buyer', isBuyer ? (tx.farmer?.name ?? '-') : (tx.buyer?.name ?? '-')],
        ['From', [tx.listing?.location, tx.listing?.state].filter(Boolean).join(', ') || '-'],
        ['Quantity', tx.bid ? `${tx.bid.quantity.toLocaleString('en-IN')} ${unitLabel(tx.listing?.unit ?? '')}` : '-'],
        ['Price', `${money(tx.finalPricePerUnit, tx.currency)} / ${unitLabel(tx.listing?.unit ?? 'unit')}`],
        // The 2% comes off the seller's side, so only the seller sees it; to a
        // buyer it read as a charge on top of what they pay.
        ...(isBuyer ? [] : [['CropBid fee', `${money(tx.platformFeeAmount, tx.currency)} (${tx.platformFeePercent}%)`] as [string, string]]),
      ]
    : [];

  const counts = {
    all: txs.length,
    todo: txs.filter((t) => !isDone(t)).length,
    done: txs.filter(isDone).length,
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.head}>
          {/* Pushed from a seller's profile there is somewhere to go back to;
              as the buyer's tab there is not, though a tab navigator answers
              canGoBack() true (it counts tab history), hence the type check. */}
          {nav.getState()?.type !== 'tab' && nav.canGoBack() ? (
            <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityLabel="Back" style={styles.back}>
              <IconArrowLeft size={19} stroke={design.ink} />
            </Pressable>
          ) : null}
          <Text style={styles.h1}>{user?.role === 'BUYER' ? 'Contracts' : 'Your sales'}</Text>
          <Text style={styles.lede}>Every deal, its payment and its delivery.</Text>
        </View>
        {/* Supply contracts sit above the deals their batches become. Renders
            nothing for an account without any. */}
        <SupplyContracts side={user?.role === 'BUYER' ? 'BUYER' : 'SELLER'} />
        <View style={styles.head}>
          {/* What this viewer owes and has to do, before any card is opened. */}
          {txs.length > 0 ? (
            <View style={styles.summary}>
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>{user?.role === 'BUYER' ? 'TO PAY' : 'AWAITING PAYMENT'}</Mono>
                <Text style={styles.sumVal}>
                  {money(txs.filter((t) => t.paymentStatus === 'AWAITING_PAYMENT').reduce((n, t) => n + t.totalAmount, 0), txs[0].currency)}
                </Text>
              </View>
              <View style={styles.sumDivider} />
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>NEEDS YOU</Mono>
                <Text style={[styles.sumVal, txs.some((t) => !!needsMe(t)) && styles.sumHot]}>
                  {txs.filter((t) => !!needsMe(t)).length}
                </Text>
              </View>
              <View style={styles.sumDivider} />
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>SETTLED</Mono>
                <Text style={styles.sumVal}>{txs.filter((t) => t.paymentStatus === 'RELEASED').length}</Text>
              </View>
            </View>
          ) : null}
          {txs.length > 0 ? (
            <View style={styles.filters}>
              {([['all', 'All'], ['todo', 'In progress'], ['done', 'Done']] as const).map(([k, label]) => (
                <Pressable key={k} onPress={() => { setFilter(k); setSelectedId(null); }} style={[styles.chip, filter === k && styles.chipOn]}>
                  <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{label}</Text>
                  <Text style={[styles.chipCount, filter === k && styles.chipCountOn]}>{counts[k]}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {txs.length === 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📄</Text>
              <Text style={styles.emptyText}>
                No contracts yet. When a seller accepts your bid or fills one of your requests, the deal shows up here with its payment and delivery.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {shown.map((t, i) => {
              const open = t.id === tx?.id;
              const step = stepOf(t);
              const unit = unitLabel(t.listing?.unit ?? '');
              return (
                <Appear key={t.id} index={i}>
                  <View style={[styles.card, open && styles.cardOpen]}>
                    <Pressable onPress={() => setSelectedId(t.id)} style={styles.cardHead}>
                      <View style={styles.tile}><Text style={styles.tileEmoji}>{cropEmojiFor(t.listing?.cropName)}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.crop} numberOfLines={1}>
                          {t.listing?.cropName ?? 'Contract'}{t.listing?.cropVariety ? ` · ${t.listing.cropVariety}` : ''}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {t.bid ? `${t.bid.quantity.toLocaleString('en-IN')} ${unit} · ` : ''}{timeAgo(t.createdAt)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.total}>{money(t.totalAmount, t.currency)}</Text>
                        <StatusPill tone={needsMe(t) ? 'ember' : statusTone(t)}>{stageLabel(t).toLowerCase()}</StatusPill>
                      </View>
                    </Pressable>

                    {/* Where the deal has got to, at a glance. */}
                    {t.paymentStatus !== 'REFUNDED' && t.paymentStatus !== 'CANCELLED' ? (
                      <View style={styles.steps}>
                        {STEPS.map((label, k) => (
                          <View key={label} style={styles.step}>
                            <View style={[styles.stepBar, k < step && styles.stepBarOn]} />
                            <Mono style={[styles.stepText, k < step && styles.stepTextOn]}>{label.toUpperCase()}</Mono>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {!open && needsMe(t) ? (
                      <Pressable onPress={() => setSelectedId(t.id)} style={styles.nudge}>
                        <View style={styles.nudgeDot} />
                        <Text style={styles.nudgeText}>Needs you: {needsMe(t)}</Text>
                      </Pressable>
                    ) : null}

                    {open ? (
                      <View style={styles.detail}>
                        <View style={styles.terms}>
                          {terms.map(([k, v]) => (
                            <View key={k} style={styles.term}>
                              <Mono style={styles.termKey}>{k.toUpperCase()}</Mono>
                              <Text style={styles.termVal} numberOfLines={1}>{v}</Text>
                            </View>
                          ))}
                        </View>
                        <View style={styles.note}>
                          <IconShield size={16} sw={2} stroke={colors.sage} />
                          <Text style={styles.noteText}>{escrowNote()}</Text>
                        </View>
                        {canPay ? (
                          <Pressable
                            onPress={onPayNow}
                            disabled={paying}
                            style={({ pressed }) => [styles.btn, paying && { opacity: 0.5 }, pressed && { opacity: 0.9 }]}
                          >
                            {paying ? (
                              <ActivityIndicator color="#f4f1ea" size="small" />
                            ) : (
                              <>
                                <Text style={styles.btnText}>Pay {money(t.totalAmount, t.currency)}</Text>
                                <IconArrow size={14} stroke="#f4f1ea" />
                              </>
                            )}
                          </Pressable>
                        ) : (
                          (() => {
                            const action = deliveryAction();
                            if (action.kind === 'idle') {
                              return (
                                <View style={styles.idle}>
                                  {step === 4 ? <IconCheck size={14} stroke={colors.forest} /> : null}
                                  <Text style={styles.idleText}>{action.label}</Text>
                                </View>
                              );
                            }
                            return (
                              <Pressable
                                onPress={busy ? undefined : action.onPress}
                                style={({ pressed }) => [styles.btn, busy && { opacity: 0.5 }, pressed && { opacity: 0.9 }]}
                              >
                                {busy ? (
                                  <ActivityIndicator color="#f4f1ea" size="small" />
                                ) : (
                                  <>
                                    <Text style={styles.btnText}>{action.label}</Text>
                                    <IconArrow size={14} stroke="#f4f1ea" />
                                  </>
                                )}
                              </Pressable>
                            );
                          })()
                        )}
                      </View>
                    ) : null}
                  </View>
                </Appear>
              );
            })}
            {shown.length === 0 ? (
              <Text style={styles.errorText}>
                {filter === 'done' ? 'Nothing finished yet.' : 'Nothing in progress.'}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <RazorpayCheckout
        order={order}
        prefill={{ name: user?.name, email: user?.email, contact: user?.phone ?? undefined }}
        onPaid={onPaid}
        onClose={onCheckoutClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: { paddingHorizontal: 16, paddingBottom: 14 },
  back: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, marginBottom: 12,
  },
  h1: { fontFamily: font.sansBold, fontSize: 26, letterSpacing: -0.6, color: design.ink, marginTop: 6 },
  lede: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 3 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { color: colors.textInverse },
  chipCount: { fontFamily: font.monoMed, fontSize: 11, color: design.ink3 },
  chipCountOn: { color: design.leaf },
  summary: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14,
    backgroundColor: colors.forest, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14,
  },
  sumCell: { flex: 1, minWidth: 0 },
  sumLabel: { fontSize: 8.5, letterSpacing: 0.7, color: 'rgba(244,241,234,0.6)' },
  sumVal: { fontFamily: font.sansBold, fontSize: 17, letterSpacing: -0.3, color: colors.textInverse, marginTop: 2 },
  sumHot: { color: '#f0a36f' },
  sumDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(244,241,234,0.14)', marginHorizontal: 10 },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(200,96,43,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  nudgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ember },
  nudgeText: { fontFamily: font.sansSemi, fontSize: 13, color: colors.ember },
  errorText: { fontFamily: font.sans, fontSize: 13, color: design.ink3, paddingHorizontal: 4, paddingTop: 8, textAlign: 'center' },

  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18, padding: 22, alignItems: 'center', gap: 8 },
  emptyEmoji: { fontSize: 30 },
  emptyText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2, textAlign: 'center' },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18, padding: 14, gap: 12 },
  cardOpen: { borderColor: colors.forest },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  tileEmoji: { fontSize: 22 },
  crop: { fontFamily: font.sansBold, fontSize: 15.5, letterSpacing: -0.2, color: design.ink },
  sub: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 2 },
  total: { fontFamily: font.sansBold, fontSize: 16, color: design.ink },

  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, gap: 5 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: design.paper2 },
  stepBarOn: { backgroundColor: colors.sage },
  stepText: { fontSize: 8.5, letterSpacing: 0.5, color: design.ink3 },
  stepTextOn: { color: colors.forest },

  detail: { gap: 12, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 12 },
  terms: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  term: { width: '48%', flexGrow: 1, backgroundColor: design.bg, borderRadius: 12, padding: 10 },
  termKey: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  termVal: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 3 },
  note: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12,
    backgroundColor: 'rgba(107,142,78,0.08)', borderRadius: 12,
  },
  noteText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2 },
  btn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, backgroundColor: colors.forest,
  },
  btnText: { fontFamily: font.sansSemi, fontSize: 15, color: '#f4f1ea' },
  idle: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, backgroundColor: design.paper2,
  },
  idleText: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink2 },
});
