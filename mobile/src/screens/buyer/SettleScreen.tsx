// Buyer app · Contracts — wired to /transactions. Hero shows the latest deal,
// terms come from the real transaction, and buyers can confirm delivery
// (PATCH /transactions/:id/delivery) to release escrow. Payment itself runs
// through Razorpay on the web client.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrow, IconCheck, IconShield } from '../../components/icons';
import { Eyebrow, GridBg, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { createPaymentOrder, myTransactions, updateDeliveryStatus, type PaymentOrder } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { DeliveryStatus, Transaction } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import RazorpayCheckout from '../../components/RazorpayCheckout';

const PAYMENT_LABEL: Record<Transaction['paymentStatus'], string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  ESCROW: 'In escrow',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
};
const DELIVERY_LABEL: Record<Transaction['deliveryStatus'], string> = {
  PENDING: 'Awaiting shipment',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CONFIRMED: 'Confirmed',
};

function statusTone(tx: Transaction): 'ember' | 'sage' | 'paper' {
  if (tx.paymentStatus === 'RELEASED') return 'sage';
  if (tx.paymentStatus === 'REFUNDED') return 'paper';
  return 'ember';
}

export default function SettleScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState(0);
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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const tx = txs[selected] ?? null;
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
      `This releases ${money(tx.totalAmount, tx.currency)} from escrow to the farmer. Confirm you received the goods?`,
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
      return { kind: 'go', label: 'Confirm delivery · release escrow', onPress: onConfirmDelivery };
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
        if (tx.deliveryStatus === 'DELIVERED') return 'Delivered. Waiting for the buyer to confirm and release your payment.';
        return 'Funds are held in escrow.';
      }
      if (tx.paymentStatus === 'RELEASED') return 'Settled. Payment has been released to you.';
      return 'This contract was refunded to the buyer.';
    }
    if (tx.paymentStatus === 'AWAITING_PAYMENT') return 'Tap Pay to fund escrow. Your money is held safely until you confirm delivery.';
    if (tx.paymentStatus === 'ESCROW') return 'Funds are held in escrow. Confirming delivery releases payment to the farmer.';
    if (tx.paymentStatus === 'RELEASED') return 'This contract is settled. Payment was released to the farmer.';
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
        ['Commodity', `${tx.listing?.cropName ?? '—'}${tx.listing?.cropVariety ? ` · ${tx.listing.cropVariety}` : ''}`],
        ['Counterparty', isBuyer ? (tx.farmer?.name ?? '—') : (tx.buyer?.name ?? '—')],
        ['Volume', tx.bid ? `${tx.bid.quantity.toLocaleString('en-IN')} ${unitLabel(tx.listing?.unit ?? '')}` : '—'],
        ['Price', `${money(tx.finalPricePerUnit, tx.currency)} / ${unitLabel(tx.listing?.unit ?? 'unit')}`],
        ['Platform fee', `${money(tx.platformFeeAmount, tx.currency)} (${tx.platformFeePercent}%)`],
        ['Payment', PAYMENT_LABEL[tx.paymentStatus]],
        ['Delivery', DELIVERY_LABEL[tx.deliveryStatus]],
      ]
    : [];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.titlePad}>
          <Eyebrow>Contracts · {txs.length}</Eyebrow>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!tx ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No contracts yet. When a bid is accepted — by you or your agent — the escrow deal shows up here.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* match hero */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <View style={styles.hero}>
                <GridBg opacity={0.1} />
                <View style={{ alignItems: 'center' }}>
                  <View style={styles.heroBadge}>
                    <IconCheck size={26} sw={2.4} stroke="#9bc97a" />
                  </View>
                  <Mono style={styles.heroTag}>
                    {PAYMENT_LABEL[tx.paymentStatus].toUpperCase()} · {timeAgo(tx.createdAt).toUpperCase()}
                  </Mono>
                  <Text style={styles.heroVal}>{money(tx.totalAmount, tx.currency)}</Text>
                  <Text style={styles.heroSub}>
                    {tx.bid ? `${tx.bid.quantity.toLocaleString('en-IN')} ${unitLabel(tx.listing?.unit ?? '')} @ ` : ''}
                    {money(tx.finalPricePerUnit, tx.currency)}/{unitLabel(tx.listing?.unit ?? 'unit')}
                  </Text>
                </View>
              </View>
            </View>

            {/* terms */}
            <View style={styles.sectionHead}>
              <Eyebrow>Contract terms</Eyebrow>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <View style={styles.termsCard}>
                {terms.map(([k, v], i) => (
                  <View key={k} style={[styles.termRow, i === terms.length - 1 && { borderBottomWidth: 0 }]}>
                    <Mono style={styles.termKey}>{k}</Mono>
                    <Text style={styles.termVal}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* escrow note */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
              <View style={styles.audit}>
                <IconShield size={17} sw={2} stroke={colors.sage} />
                <Text style={styles.auditText}>{escrowNote()}</Text>
              </View>
            </View>

            {/* other contracts */}
            {txs.length > 1 ? (
              <>
                <View style={styles.sectionHead}>
                  <Eyebrow>All contracts</Eyebrow>
                </View>
                <View style={{ paddingHorizontal: 16, gap: 8 }}>
                  {txs.map((t, i) => (
                    <Pressable
                      key={t.id}
                      onPress={() => setSelected(i)}
                      style={[styles.txRow, i === selected && styles.txRowActive]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.txCrop} numberOfLines={1}>
                          {t.listing?.cropName ?? 'Contract'} · {money(t.totalAmount, t.currency)}
                        </Text>
                        <Text style={styles.txSub} numberOfLines={1}>
                          {DELIVERY_LABEL[t.deliveryStatus]} · {timeAgo(t.createdAt)}
                        </Text>
                      </View>
                      <StatusPill tone={statusTone(t)}>{PAYMENT_LABEL[t.paymentStatus].toLowerCase()}</StatusPill>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* action bar */}
      {tx ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.signRow}>
            {canPay ? (
              <Pressable
                onPress={onPayNow}
                disabled={paying}
                style={({ pressed }) => [styles.btnPrimary, paying && { opacity: 0.45 }, pressed && { opacity: 0.9 }]}
              >
                {paying ? (
                  <ActivityIndicator color="#f4f1ea" size="small" />
                ) : (
                  <>
                    <Text style={styles.btnPrimaryText}>Pay {money(tx.totalAmount, tx.currency)} · fund escrow </Text>
                    <IconArrow size={14} stroke="#f4f1ea" />
                  </>
                )}
              </Pressable>
            ) : (
              (() => {
                const action = deliveryAction();
                const blocked = action.kind === 'idle' || busy;
                return (
                  <Pressable
                    onPress={action.kind === 'go' ? action.onPress : undefined}
                    disabled={blocked}
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      blocked && { opacity: 0.45 },
                      pressed && action.kind === 'go' && { opacity: 0.9 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#f4f1ea" size="small" />
                    ) : (
                      <>
                        <Text style={styles.btnPrimaryText}>{action.label} </Text>
                        {action.kind === 'go' ? <IconArrow size={14} stroke="#f4f1ea" /> : null}
                      </>
                    )}
                  </Pressable>
                );
              })()
            )}
          </View>
        </View>
      ) : null}

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
  titlePad: { paddingHorizontal: 20, paddingTop: 14 },
  errorText: { fontFamily: font.sans, fontSize: 13, color: colors.ember, paddingHorizontal: 20, paddingTop: 8 },

  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 18 },
  emptyText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2 },

  hero: { backgroundColor: colors.forest, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, overflow: 'hidden' },
  heroBadge: { width: 52, height: 52, borderRadius: 999, backgroundColor: 'rgba(155,201,122,0.18)', borderWidth: 1, borderColor: 'rgba(155,201,122,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTag: { fontSize: 10.5, letterSpacing: 1.2, color: 'rgba(244,241,234,0.6)' },
  heroVal: { fontFamily: font.sansMed, fontSize: 32, letterSpacing: -0.64, color: '#e9e6dc', marginTop: 8 },
  heroSub: { fontFamily: font.sans, fontSize: 12.5, color: 'rgba(244,241,234,0.7)', marginTop: 2 },

  sectionHead: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  termsCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, overflow: 'hidden' },
  termRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: design.lineLight },
  termKey: { fontSize: 11.5, color: design.ink3, letterSpacing: 0.44, textTransform: 'uppercase' },
  termVal: { fontFamily: font.sansMed, fontSize: 14, color: design.ink, textAlign: 'right', maxWidth: 200 },

  audit: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, backgroundColor: 'rgba(107,142,78,0.08)', borderWidth: 1, borderColor: 'rgba(107,142,78,0.2)', borderRadius: 12 },
  auditText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, lineHeight: 19, color: design.ink2 },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  txRowActive: { borderColor: colors.forest },
  txCrop: { fontFamily: font.sansMed, fontSize: 14.5, color: design.ink },
  txSub: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 1 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingBottom: 14, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  signRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, backgroundColor: colors.forest },
  btnPrimaryText: { fontFamily: font.sansMed, fontSize: 14, color: '#f4f1ea' },
});
