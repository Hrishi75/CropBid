// =============================================================================
// OrdersScreen: what a household ordered, where it is, and what is left to do
// =============================================================================
// THIS IS NOT THE CONTRACTS SCREEN. The Orders tab used to render
// buyer/SettleScreen, which is a B2B escrow view: "Contracts · 3", contract
// terms, bid quantities per quintal, escrow release language. A household that
// bought two kilos of tomatoes was being shown a commodity settlement record.
//
// ONE CARD PER SHOP ORDER. Everything bought from one shop is one order with
// one delivery fee, so it is one card with its items underneath, and the amount
// on it is what the shopper pays, delivery included. Orders from before shop
// orders existed have none, and show as a card of one.
//
// TWO THINGS TO DO, AND ONLY WHEN THEY ARE DUE (added 2026-09-20). This screen
// was a history and nothing else, which left two holes:
//
//   PAYING. Checkout said "Pay from the Orders tab" and this tab had no pay
//   button, so every order placed in the app sat at AWAITING_PAYMENT. Checkout
//   now opens payment itself; an order that is still unpaid here is one whose
//   window was closed, and the banner at the top pays everything owed in one go,
//   the same single approval checkout would have asked for.
//
//   SAYING IT ARRIVED. Delivery runs PENDING -> IN_TRANSIT -> DELIVERED, all
//   moved by the seller, then DELIVERED -> CONFIRMED by the shopper, which is
//   what marks the seller as due their money. An earlier version put a confirm
//   button on every row and posted DELIVERED on orders that were not, which
//   the server refused as the wrong transition and the wrong actor. So the
//   prompt appears only on items actually sitting at DELIVERED.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { IconSprout } from '../../components/icons';
import RazorpayCheckout from '../../components/RazorpayCheckout';
import { useAuth } from '../../context/AuthContext';
import {
  createRetailPayment,
  myTransactions,
  updateDeliveryStatus,
  verifyRetailPayment,
  type RetailPaymentOrder,
} from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Alert } from '../../lib/alert';
import type { DeliveryStatus, RetailOrderSummary, Transaction } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import { colors, design, font, radius, spacing } from '../../theme';

/**
 * Where an order is, in a shopper's words.
 *
 * Deliberately not the enum. `PENDING` means the seller has not sent it yet,
 * which to a shopper is "being packed", and `IN_TRANSIT` is "on the way". The
 * enum is the server's vocabulary and there is no reason a household should
 * learn it.
 */
const STAGE: Record<DeliveryStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Being packed', tone: colors.wheat },
  IN_TRANSIT: { label: 'On the way', tone: colors.info },
  DELIVERED: { label: 'Delivered', tone: colors.sage },
  // CONFIRMED once the shopper says it arrived. To them it is simply done.
  CONFIRMED: { label: 'Arrived', tone: colors.sage },
};

interface OrderGroup {
  key: string;
  shopOrder: RetailOrderSummary | null;
  items: Transaction[];
}

// Folds the item rows into shop orders, keeping the list's newest-first order:
// a shop order sits where its first item came back. Same rule as the website.
function groupOrders(orders: Transaction[]): OrderGroup[] {
  const groups: OrderGroup[] = [];
  const byShopOrder = new Map<string, OrderGroup>();
  for (const o of orders) {
    const shopOrder = o.retailOrder ?? null;
    if (!shopOrder) {
      groups.push({ key: o.id, shopOrder: null, items: [o] });
      continue;
    }
    const existing = byShopOrder.get(shopOrder.id);
    if (existing) existing.items.push(o);
    else {
      const group = { key: shopOrder.id, shopOrder, items: [o] };
      byShopOrder.set(shopOrder.id, group);
      groups.push(group);
    }
  }
  return groups;
}

const awaitingPayment = (g: OrderGroup) => g.items.some((o) => o.paymentStatus === 'AWAITING_PAYMENT');

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [orders, setOrders] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [payment, setPayment] = useState<RetailPaymentOrder | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await myTransactions());
    } catch (e) {
      setError(errorMessage(e, 'Could not load your orders.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = groupOrders(orders);
  // Shop orders still owed. Orders from before shop orders existed are left
  // out: the server pays those one by one, and none are placed any more.
  const owed = groups.filter((g) => g.shopOrder && !g.shopOrder.paidAt && awaitingPayment(g));
  const owedTotal = Math.round(owed.reduce((sum, g) => sum + g.shopOrder!.totalAmount, 0) * 100) / 100;

  async function payOwed() {
    setOpening(true);
    try {
      setPayment(await createRetailPayment(owed.map((g) => g.shopOrder!.id)));
    } catch (e) {
      Alert.alert(t('Could not start the payment'), errorMessage(e, 'Try again in a moment.'));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.forest}
          />
        }
      >
        {/* No eyebrow: the navigation header one line above already says
            "Your orders", and repeating it puts the same words twice in the
            first 40 pixels of the screen. The count is the only thing this
            line adds. */}
        <View style={styles.head}>
          <Text style={styles.h1}>
            {groups.length === 0
              ? t('Nothing yet.')
              : `${groups.length} ${groups.length === 1 ? t('order') : t('orders')}.`}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {owed.length > 0 ? (
          <View style={styles.oweSlot}>
            <View style={styles.owe}>
              <Text style={styles.oweTitle}>{money(owedTotal, owed[0].shopOrder!.currency)} {t('to pay')}</Text>
              <Text style={styles.oweBody}>
                {owed.length === 1
                  ? t('1 order is waiting for payment.')
                  : `${owed.length} ${t('orders are waiting for payment, paid together in one go.')}`}{' '}
                {t('The shop only gets your address and number once it is paid.')}
              </Text>
              <PressScale
                onPress={opening ? undefined : payOwed}
                scaleTo={0.98}
                cardStyle={[styles.oweBtn, opening && { opacity: 0.6 }]}
              >
                <Text style={styles.oweBtnText}>
                  {opening ? t('Opening…') : `${t('Pay')} ${money(owedTotal, owed[0].shopOrder!.currency)}`}
                </Text>
              </PressScale>
            </View>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.sage} />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('No orders yet')}</Text>
            <Text style={styles.emptyBody}>
              {t('Anything you buy shows up here, with where it has got to.')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {groups.map((g) => (
              <OrderCard key={g.key} group={g} onChanged={load} />
            ))}
          </View>
        )}

        {/* The partner pitch. A household reading their own order list is
            exactly who might also grow something or run a shop, and this is the
            one screen they come back to without being sold anything. */}
        <PartnerPitch onPress={() => nav.navigate('Partner')} />
      </ScrollView>

      <RazorpayCheckout<{ id: string; paidAt: string | null }>
        order={payment}
        prefill={{ name: user?.name, email: user?.email ?? undefined, contact: user?.phone ?? undefined }}
        verify={verifyRetailPayment}
        onPaid={() => {
          setPayment(null);
          Alert.alert(t('Paid'), t('Your order is on its way.'));
          void load();
        }}
        onClose={(err) => {
          setPayment(null);
          if (err) Alert.alert(t('Payment did not go through'), err);
          void load();
        }}
      />
    </View>
  );
}

/**
 * When an order was placed, read the way somebody scanning a history reads it.
 *
 * "2 hours ago" is what you want for something you just did; "4 months ago" is
 * not, because by then the question is which week it was. So recent orders get
 * the relative form and anything past a week gets a date.
 */
function placedOn(iso: string): string {
  const at = new Date(iso);
  const days = (Date.now() - at.getTime()) / 86_400_000;
  if (days < 7) return timeAgo(iso);
  return at.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    // The year only once it is not this one. "12 Jun 2026" on every row this
    // year is noise in the same column on every card.
    ...(at.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
}

function OrderCard({ group, onChanged }: { group: OrderGroup; onChanged: () => void }) {
  const { t } = useTranslation();
  const { shopOrder, items } = group;
  const [first] = items;
  const [confirming, setConfirming] = useState(false);

  // Who is bringing it: the shop's trading name, which is what the storefront
  // showed them, or the person's own name when there is none.
  const seller = first.listing?.farmer?.businessName?.trim() || first.farmer?.name || null;
  const unpaid = awaitingPayment(group);
  const amount = shopOrder ? shopOrder.totalAmount : first.totalAmount;
  const delivered = items.filter((o) => o.deliveryStatus === 'DELIVERED');

  // One tap for everything that has been handed over. Each item is still
  // confirmed on its own on the server, because escrow is per item.
  async function confirmArrived() {
    setConfirming(true);
    try {
      await Promise.all(delivered.map((o) => updateDeliveryStatus(o.id, 'CONFIRMED')));
    } catch (e) {
      Alert.alert(t('Could not confirm'), errorMessage(e, 'Try again in a moment.'));
    } finally {
      setConfirming(false);
      onChanged();
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.crop} numberOfLines={1}>{seller ?? t('Your order')}</Text>
          <Mono style={styles.when}>
            {placedOn(first.createdAt).toUpperCase()}
            {items.length > 1 ? ` · ${items.length} ${t('ITEMS')}` : ''}
          </Mono>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.amount}>{money(amount, first.currency)}</Text>
          {shopOrder ? (
            <Text style={styles.feeNote}>
              {shopOrder.deliveryFee > 0
                ? `${t('incl.')} ${money(shopOrder.deliveryFee, shopOrder.currency)} ${t('delivery')}`
                : t('Free delivery')}
            </Text>
          ) : null}
        </View>
      </View>

      {unpaid ? (
        <View style={styles.stageRow}>
          <View style={[styles.dot, { backgroundColor: colors.ember }]} />
          <Text style={[styles.stage, { color: colors.ember }]}>{t('Payment due')}</Text>
        </View>
      ) : null}

      <View style={styles.items}>
        {items.map((o) => {
          const stage = STAGE[o.deliveryStatus];
          // What was actually bought. A row that says only "Tomato · ₹46"
          // leaves out the thing somebody is usually checking: how much of it.
          const qty = o.bid?.quantity;
          const unit = o.listing?.unit;
          return (
            <View key={o.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {o.listing?.cropName ?? t('Item')}
                  {qty != null && unit ? <Text style={styles.itemQty}>{`  ${qty} ${unitLabel(unit)}`}</Text> : null}
                </Text>
                {/* Before it is paid, nothing is being packed, so no stage. */}
                {!unpaid ? (
                  <View style={styles.itemStage}>
                    <View style={[styles.dot, { backgroundColor: stage.tone }]} />
                    <Text style={styles.stage}>{t(stage.label)}</Text>
                  </View>
                ) : null}
              </View>
              {items.length > 1 ? <Text style={styles.itemAmount}>{money(o.totalAmount, o.currency)}</Text> : null}
            </View>
          );
        })}
      </View>

      {delivered.length > 0 ? (
        <View style={styles.arrived}>
          <Text style={styles.arrivedTitle}>{t('Did it arrive?')}</Text>
          <Text style={styles.arrivedBody}>
            {t('The seller has marked')} {delivered.map((o) => o.listing?.cropName ?? t('an item')).join(', ')}{' '}
            {t('as delivered. Confirm only once you have it: this is what tells us the seller can be paid.')}
          </Text>
          <PressScale
            onPress={confirming ? undefined : confirmArrived}
            scaleTo={0.98}
            cardStyle={[styles.arrivedBtn, confirming && { opacity: 0.6 }]}
          >
            <Text style={styles.arrivedBtnText}>
              {confirming
                ? t('Confirming…')
                : delivered.length === 1 ? t('Yes, it arrived') : `${t('Yes, all')} ${delivered.length} ${t('arrived')}`}
            </Text>
          </PressScale>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The nudge from shopping into selling.
 *
 * SAYS FREE, BECAUSE IT IS FREE. There is no signup charge in the code: an
 * account costs nothing, listing costs nothing, and the platform takes a flat
 * 2% only once a deal settles (CLAUDE.md §2). A card here claiming a joining
 * fee would be inventing a price, and one implying earnings would be inventing
 * a promise, so it says exactly what the fee schedule says.
 */
function PartnerPitch({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <PressScale onPress={onPress} scaleTo={0.98} style={styles.pitchSlot} cardStyle={styles.pitch}>
      <View style={styles.pitchIcon}>
        <IconSprout size={18} stroke={colors.sage2} />
      </View>
      <Mono style={styles.pitchTag}>FREE TO JOIN</Mono>
      <Text style={styles.pitchTitle}>Grow it or trade it? Sell it here.</Text>
      <Text style={styles.pitchBody}>
        {t('Farmers, local shops and buyers onboard free. No joining fee, no listing fee, no monthly charge. We take 2% only when a deal actually settles.')}
      </Text>
      <View style={styles.pitchCta}>
        <Text style={styles.pitchCtaText}>{t('Become a partner')}</Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  h1: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, letterSpacing: -0.6 },
  error: { fontFamily: font.sans, fontSize: 14, color: colors.ember, paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  emptyTitle: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  emptyBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3, marginTop: 4 },

  oweSlot: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  owe: {
    backgroundColor: '#f6e4d9',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  oweTitle: { fontFamily: font.sansBold, fontSize: 17, color: design.ink },
  oweBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink2, marginTop: 4 },
  oweBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  oweBtnText: { fontFamily: font.sansBold, fontSize: 15, color: colors.textInverse },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  crop: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  when: { fontSize: 10, letterSpacing: 0.6, color: design.ink3, marginTop: 2 },
  amount: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },

  feeNote: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 2 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 999 },
  stage: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },

  items: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: design.line },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  itemName: { fontFamily: font.sansMed, fontSize: 14, color: design.ink },
  itemQty: { fontFamily: font.sans, fontSize: 13, color: design.ink3 },
  itemStage: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  itemAmount: { fontFamily: font.monoMed, fontSize: 13, color: design.ink2 },

  arrived: {
    marginTop: spacing.md,
    backgroundColor: design.bg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  arrivedTitle: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  arrivedBody: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 3 },
  arrivedBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.forest,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
  },
  arrivedBtnText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.textInverse },

  pitchSlot: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  pitch: {
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pitchIcon: {
    width: 36, height: 36, borderRadius: radius.pill,
    backgroundColor: 'rgba(155,201,122,0.16)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pitchTag: { fontSize: 9, letterSpacing: 1.2, color: colors.sage2 },
  pitchTitle: {
    fontFamily: font.sansBold, fontSize: 21, color: colors.surface,
    letterSpacing: -0.4, marginTop: 4,
  },
  pitchBody: {
    fontFamily: font.sans, fontSize: 13.5, lineHeight: 20,
    color: 'rgba(244,241,234,0.72)', marginTop: spacing.sm,
  },
  pitchCta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    marginTop: spacing.lg,
  },
  pitchCtaText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest },
});
