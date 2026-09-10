// =============================================================================
// OrdersScreen — what the shopper has bought
// =============================================================================
// GROUPED BY DAY, because one basket becomes many orders. The server settles
// one lot per transaction, so six items from three shops is six rows. Listing
// them flat would read as six separate shopping trips. Grouping by the day they
// were placed puts the basket back together without pretending the underlying
// records are one thing.
//
// Status is shown in the shopper's words, not the enum's. PaymentStatus
// RELEASED and DeliveryStatus CONFIRMED both mean "done" to a household, and
// HELD_IN_ESCROW means "paid, they have not got it yet".
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { myOrders } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Order } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { money, toKg, formatWeight } from '../lib/units';
import { listingImage } from '../lib/cropImages';
import { Empty, ErrorState, Mono, SectionLabel, Skeleton } from '../components/ui';
import { IconArrowLeft, IconDoc } from '../components/icons';
import { colors, design, font, radius, shadow, spacing } from '../theme';

/** The enum pair, said the way a shopper would say it. */
function statusOf(order: Order): { label: string; tone: string } {
  // Ordered by what a shopper needs to know first, not by the enums' own order.
  // Money settled beats delivery state, and an action they must take beats a
  // state they can only wait through.
  if (order.paymentStatus === 'REFUNDED') return { label: 'Refunded', tone: design.ink3 };
  if (order.paymentStatus === 'AWAITING_PAYMENT') return { label: 'Payment pending', tone: colors.ember };
  if (order.deliveryStatus === 'CONFIRMED') return { label: 'Delivered', tone: colors.sage };
  // DELIVERED is the seller's claim; CONFIRMED is the shopper agreeing. Between
  // them the money is still held, so this is the one row that wants a tap.
  if (order.deliveryStatus === 'DELIVERED') return { label: 'Confirm delivery', tone: colors.wheat };
  if (order.deliveryStatus === 'IN_TRANSIT') return { label: 'On the way', tone: colors.info };
  if (order.paymentStatus === 'ESCROW') return { label: 'Paid, packing', tone: colors.info };
  return { label: 'Placed', tone: design.ink3 };
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function OrdersScreen({
  navigation,
}: {
  navigation: { navigate: (screen: 'Profile') => void };
}) {
  const insets = useSafeAreaInsets();
  // Names its destination rather than popping blindly, so a deep link straight
  // to /orders still has somewhere to go. Same reasoning as ShopScreen.
  const back = () => navigation.navigate('Profile');
  const { signedIn } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!signedIn) { setLoading(false); return; }
    setError(null);
    try {
      setOrders(await myOrders());
    } catch (e) {
      setError(errorMessage(e, 'Could not load your orders.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [signedIn]);

  useEffect(() => { void load(); }, [load]);

  // Flattened into a single list of day headers and rows, so one FlatList can
  // render the lot without nesting scrollers.
  const rows: Array<{ type: 'day'; key: string } | { type: 'order'; order: Order }> = [];
  let lastDay = '';
  for (const o of orders) {
    const d = dayKey(o.createdAt);
    if (d !== lastDay) { rows.push({ type: 'day', key: d }); lastDay = d; }
    rows.push({ type: 'order', order: o });
  }

  if (!signedIn) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: insets.top + spacing.lg }]}>
        <Back onPress={back} />
        <Text style={styles.title}>Orders</Text>
        <Empty
          icon={<IconDoc size={30} color={design.ink3} />}
          title="Sign in to see your orders"
          body="Your order history lives with your account, so it follows you to a new phone."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.pad}>
        <Back onPress={back} />
      </View>
      <Text style={[styles.title, styles.pad]}>Orders</Text>

      {loading ? (
        <View style={styles.pad}>
          {[0, 1, 2].map((i) => <Skeleton key={i} style={styles.skRow} />)}
        </View>
      ) : error ? (
        <View style={styles.pad}>
          <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.type === 'day' ? `d:${r.key}` : `o:${r.order.id}`)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={colors.sage}
            />
          }
          ListEmptyComponent={
            <Empty
              icon={<IconDoc size={30} color={design.ink3} />}
              title="No orders yet"
              body="What you buy will collect here, newest first."
            />
          }
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <View style={styles.dayHead}>
                <SectionLabel>{item.key.toUpperCase()}</SectionLabel>
              </View>
            ) : (
              <OrderRow order={item.order} />
            )
          }
        />
      )}
    </View>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
    >
      <IconArrowLeft size={18} color={design.ink} />
      <Text style={styles.backText}>You</Text>
    </Pressable>
  );
}

function OrderRow({ order }: { order: Order }) {
  const status = statusOf(order);
  const listing = order.listing;
  const photo = listing ? listingImage(listing) : null;
  // The shop's trading name first, the person's name only as a fallback. A
  // shop trades as its business; a farmer trades as themselves.
  const shop =
    listing?.farmer?.businessName ??
    listing?.farmer?.user?.name ??
    order.farmer?.name ??
    null;
  // Guarded on both sides: a transaction whose bid or listing did not come back
  // has no weight to show, and "NaN kg" is worse than showing nothing.
  const kg =
    listing && order.bid && Number.isFinite(order.bid.quantity)
      ? toKg(order.bid.quantity, listing.unit)
      : null;

  return (
    <View style={styles.card}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbLetter}>
            {(listing?.cropName ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={styles.crop} numberOfLines={1}>
          {listing?.cropName ?? 'Item no longer listed'}
        </Text>
        {shop ? <Mono style={styles.shop} numberOfLines={1}>{shop}</Mono> : null}
        {kg != null ? <Mono style={styles.qty}>{formatWeight(kg)}</Mono> : null}
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.amount}>{money(order.totalAmount, order.currency)}</Text>
        <View style={[styles.statusPill, { borderColor: status.tone }]}>
          <Mono style={[styles.statusText, { color: status.tone }]}>
            {status.label.toUpperCase()}
          </Mono>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg },
  title: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, marginBottom: spacing.lg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  backText: { fontFamily: font.sansMed, fontSize: 14, color: design.ink },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  dayHead: { marginTop: spacing.md, marginBottom: spacing.sm },
  skRow: { height: 74, borderRadius: 16, marginBottom: 10 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: design.paper2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbLetter: { fontFamily: font.sansBold, fontSize: 18, color: colors.sage },
  cardBody: { flex: 1 },
  crop: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  shop: { fontSize: 10, color: design.ink3, marginTop: 1 },
  qty: { fontSize: 10, color: design.ink2, marginTop: 3 },
  cardRight: { alignItems: 'flex-end', gap: 5 },
  amount: { fontFamily: font.monoSemi, fontSize: 14, color: design.ink },
  statusPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 8, letterSpacing: 0.4 },
});
