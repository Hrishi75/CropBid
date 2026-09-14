// =============================================================================
// OrdersScreen — what a household ordered, and where it is
// =============================================================================
// THIS IS NOT THE CONTRACTS SCREEN. The Orders tab used to render
// buyer/SettleScreen, which is a B2B escrow view: "Contracts · 3", contract
// terms, bid quantities per quintal, escrow release language. A household that
// bought two kilos of tomatoes was being shown a commodity settlement record.
// Every word of that is correct for a processor sourcing by the tonne and wrong
// for somebody who wants to know whether their vegetables are coming.
//
// IT IS A HISTORY, AND ONLY A HISTORY. What did I buy, what did it cost, when,
// and where has it got to. Nothing here asks the shopper to do anything.
//
// THERE IS DELIBERATELY NO "CONFIRM DELIVERY" BUTTON. Two reasons. The first is
// what this screen is for: somebody opening their order list wants to look, not
// to be handed a task. The second is that the version which had one was wrong.
// The state machine is PENDING → IN_TRANSIT → DELIVERED, all three moved by the
// FARMER, and only then DELIVERED → CONFIRMED by the buyer. The button offered
// on PENDING and IN_TRANSIT posted DELIVERED, which the server refuses as both
// an invalid transition and the wrong actor.
//
// WHAT THAT LEAVES UNBUILT: nothing in the app now moves DELIVERED → CONFIRMED,
// which is the step that flips escrow to RELEASED. In practice that changes
// little, because release only writes a database column and every payout is a
// manual bank transfer already (CLAUDE.md §6). But when real payouts land, a
// shopper needs some way to say "this arrived", and it should be a prompt on
// the order that is actually sitting at DELIVERED, not a button on every row.
//
// ORDERS ARE PER LOT, not per basket. Retail checkout places one order per
// seller's lot, so a basket spanning two farms lands here as two rows. That is
// the truth of what was bought and it is why the rows carry the crop rather
// than an order number nobody recognises.
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
import { myTransactions } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { DeliveryStatus, Transaction } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import { colors, design, font, radius, spacing } from '../../theme';

/**
 * Where an order is, in a shopper's words.
 *
 * Deliberately not the enum. `PENDING` means the farmer has not sent it yet,
 * which to a shopper is "being packed", and `IN_TRANSIT` is "on the way". The
 * enum is the server's vocabulary and there is no reason a household should
 * learn it.
 */
const STAGE: Record<DeliveryStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Being packed', tone: colors.wheat },
  IN_TRANSIT: { label: 'On the way', tone: colors.info },
  DELIVERED: { label: 'Delivered', tone: colors.sage },
  // The server marks CONFIRMED once the shopper says it arrived, which is what
  // releases the money. To them it is simply done.
  CONFIRMED: { label: 'Delivered', tone: colors.sage },
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { t } = useTranslation();

  const [orders, setOrders] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            {orders.length === 0
              ? t('Nothing yet.')
              : `${orders.length} ${orders.length === 1 ? t('order') : t('orders')}.`}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.sage} />
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('No orders yet')}</Text>
            <Text style={styles.emptyBody}>
              {t('Anything you buy shows up here, with where it has got to.')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </View>
        )}

        {/* The partner pitch. A household reading their own order list is
            exactly who might also grow something or run a shop, and this is the
            one screen they come back to without being sold anything. */}
        <PartnerPitch onPress={() => nav.navigate('Partner')} />
      </ScrollView>
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

function OrderCard({ order }: { order: Transaction }) {
  const { t } = useTranslation();
  const stage = STAGE[order.deliveryStatus];
  const crop = order.listing?.cropName ?? t('Your order');
  // What was actually bought. A history row that says only "Tomato · ₹46"
  // leaves out the thing somebody is usually checking: how much of it.
  const qty = order.bid?.quantity;
  const unit = order.listing?.unit;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.crop} numberOfLines={1}>{crop}</Text>
          <Mono style={styles.when}>
            {placedOn(order.createdAt).toUpperCase()}
            {qty != null && unit ? ` · ${qty} ${unitLabel(unit)}` : ''}
          </Mono>
        </View>
        <Text style={styles.amount}>{money(order.totalAmount, order.currency)}</Text>
      </View>

      <View style={styles.stageRow}>
        <View style={[styles.dot, { backgroundColor: stage.tone }]} />
        <Text style={styles.stage}>{t(stage.label)}</Text>
        {/* The seller's name, because "who is bringing it" is the other half of
            "where is it". */}
        {order.farmer?.name ? (
          <Text style={styles.from} numberOfLines={1}>· {order.farmer.name}</Text>
        ) : null}
      </View>

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

  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 999 },
  stage: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  from: { flex: 1, fontFamily: font.sans, fontSize: 13, color: design.ink3 },

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
