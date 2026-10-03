// =============================================================================
// CartScreen — the basket, priced against what is actually for sale
// =============================================================================
// The shop's middle step: everything the shopper has picked, in one list, with
// the bill underneath. Two things it deliberately does that a demo cart would
// not:
//
//   1. IT RE-PRICES ON OPEN. Every row is checked against its live listing
//      (useCartLines). A lot that sold out, went bulk-only or moved city stays
//      on screen with the reason, dimmed and excluded from the bill, instead of
//      vanishing or — worse — being billed and then refused at the API.
//
//   2. IT IS GROUPED BY SHOP. Each shop delivers separately, so each shop is
//      its own order and pays its own delivery: free from ₹200 of that shop's
//      items, ₹30 below. Every shop's block says which it is and how much more
//      would make it free, because "add ₹40 of anything from this shop" is
//      something a shopper can act on and a basket-wide total is not.
//
// The stepper writes straight through to the cart, so quantity changes need no
// save button and no refetch — the price data is already in hand and only the
// arithmetic moves.
// =============================================================================

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillDetails } from '../../components/BillDetails';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Mono } from '../../components/buyerKit';
import { FadeInImage, PressScale } from '../../components/motion';
import { IconCheck, IconClock, IconClose, IconSprout } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useCartLines, type CartLine, type ShopGroup } from '../../lib/cartLines';
import type { RetailRules } from '../../api/types';
import { mediaUrl } from '../../api/client';
import { cropImageFor } from '../../utils/cropImages';
import { money, unitLabel } from '../../lib/format';
import { colors, design, font } from '../../theme';

function CartRow({
  line, onQuantity, onRemove, onOpen,
}: {
  line: CartLine;
  onQuantity: (qty: number) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { item, listing, price, problem, repriced } = line;
  const unit = unitLabel(item.unit);
  const img = (item.image ? mediaUrl(item.image) : null) ?? cropImageFor(item.cropName);
  // Stock can only be trusted once the live listing has landed; until then the
  // stepper's ceiling is the quantity already chosen, so it never offers more
  // than we know exists.
  const max = Math.max(listing?.remainingQuantity ?? item.quantity, item.quantity);

  return (
    <View style={[styles.row, problem ? styles.rowDim : null]}>
      <PressScale onPress={onOpen} scaleTo={0.95} cardStyle={styles.thumb}>
        {img ? (
          <FadeInImage uri={img} style={styles.thumbImg} />
        ) : (
          <View style={[styles.thumbImg, styles.thumbEmpty]}><Text style={styles.thumbEmoji}>🌾</Text></View>
        )}
      </PressScale>

      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Pressable onPress={onOpen} hitSlop={4} style={styles.rowNameWrap}>
            <Text style={styles.rowName} numberOfLines={1}>{item.cropName}</Text>
          </Pressable>
          {/* A small cross in the corner rather than a "Remove" line under the
              stepper: it is the least-used control on the row, so it gets the
              least space, and it no longer sits where a thumb aiming at the
              stepper lands. */}
          <Pressable
            onPress={onRemove}
            hitSlop={10}
            accessibilityLabel={`Remove ${item.cropName}`}
            style={styles.rowRemove}
          >
            <IconClose size={12} stroke={design.ink3} />
          </Pressable>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.cropVariety ? `${item.cropVariety} · ` : ''}
          {item.organic ? 'Organic' : `Grade ${item.qualityGrade}`}
          {' · '}
          {money(price, item.currency)}/{unit}
        </Text>

        {problem ? (
          <Text style={styles.rowProblem}>{problem}</Text>
        ) : repriced ? (
          <Text style={styles.rowProblem}>
            Price updated by the seller: was {money(item.pricePerUnit, item.currency)}/{unit}.
          </Text>
        ) : null}

        <View style={styles.rowControls}>
          <QuantityStepper
            value={item.quantity}
            onChange={onQuantity}
            unit={item.unit}
            pack={item.pack}
            max={max}
            size="sm"
            onEmpty={onRemove}
          />
          <Text style={styles.rowAmount}>{money(line.lineTotal, item.currency)}</Text>
        </View>
      </View>
    </View>
  );
}

// Which delivery a shop's order rides, derived from who sells it and never
// stored (CLAUDE.md §3): a local shop sends it round today, a farm or a
// wholesaler is bought at tomorrow's mandi run. Null until a live listing has
// said which, rather than guessing a promise.
function laneOf(shop: ShopGroup): 'today' | 'tomorrow' | null {
  const type = shop.lines.find((l) => l.listing?.farmer?.sellerType)?.listing?.farmer?.sellerType;
  if (!type) return null;
  return type === 'LOCAL_SHOP' ? 'today' : 'tomorrow';
}

function LaneTag({ lane }: { lane: 'today' | 'tomorrow' }) {
  return (
    <View style={styles.laneTag}>
      {lane === 'today'
        ? <IconClock size={12} stroke={colors.forest} />
        : <IconSprout size={12} stroke={colors.forest} />}
      <Mono style={styles.laneTagText}>{lane === 'today' ? 'ARRIVES TODAY' : 'TOMORROW MORNING'}</Mono>
    </View>
  );
}

// What one shop's delivery comes to, said where the shopper can still do
// something about it. A bar towards the free-delivery line, because "₹122 to
// go" is read at a glance from how full it is, and a sentence is not.
function DeliveryMeter({
  shop, rules, currency,
}: { shop: ShopGroup; rules: RetailRules | null; currency: string }) {
  if (shop.orderable.length === 0 || shop.deliveryFee === null || !rules) return null;
  if (shop.deliveryFee === 0) {
    return (
      <View style={styles.meterFree}>
        <IconCheck size={13} stroke={colors.forest} />
        <Text style={styles.meterFreeText}>Free delivery on this order</Text>
      </View>
    );
  }
  const filled = rules.freeDeliveryFrom > 0
    ? Math.min(1, shop.itemsTotal / rules.freeDeliveryFrom)
    : 0;
  return (
    <View style={styles.meter}>
      <Text style={styles.meterText}>
        Add <Text style={styles.meterStrong}>{money(shop.toFreeDelivery, currency)}</Text> more from
        this shop for free delivery
      </Text>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.max(filled * 100, 4)}%` }]} />
      </View>
      <Mono style={styles.meterFee}>
        {money(shop.deliveryFee, currency)} DELIVERY BELOW {money(rules.freeDeliveryFrom, currency)}
      </Mono>
    </View>
  );
}

export default function CartScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, hydrated, setQuantity, remove, clear } = useCart();
  const city = user?.location?.trim() || '';
  const bill = useCartLines(items, city);

  // Without the rules there is no honest delivery figure, so checkout waits:
  // an order placed on a guessed fee is a charge the shopper never saw.
  const blockCheckout = bill.loading || bill.orderable.length === 0 || bill.toPay === null;

  if (items.length === 0) {
    return (
      <View style={styles.flex}>
        <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
          <Mono style={styles.eyebrow}>YOUR CART</Mono>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🧺</Text>
          <Text style={styles.emptyTitle}>
            {hydrated ? 'Your cart is empty' : 'Fetching your cart…'}
          </Text>
          <Text style={styles.emptyBody}>
            Add produce from the shop and it collects here: one bill, however many shops it
            comes from.
          </Text>
          <PressScale onPress={() => nav.navigate('Home')} cardStyle={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Start shopping</Text>
          </PressScale>
        </View>
      </View>
    );
  }

  const blocked = bill.lines.length - bill.orderable.length;

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Mono style={styles.eyebrow}>YOUR CART</Mono>
          <Text style={styles.title}>
            {items.length} {items.length === 1 ? 'lot' : 'lots'} in your cart
          </Text>
          {city ? <Text style={styles.headSub}>Delivering to {city}</Text> : null}
        </View>
        <Pressable
          hitSlop={8}
          onPress={() =>
            Alert.alert('Empty cart?', 'This removes everything you have picked.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Empty cart', style: 'destructive', onPress: clear },
            ])
          }
        >
          <Text style={styles.headAction}>Empty</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* One block per shop, because each is its own delivery and its own
            fee. The fee and the nudge sit on the shop they belong to, BEFORE the
            pay button, so the charge is never discovered after it. */}
        {bill.shops.map((shop) => (
          <View key={shop.sellerId} style={styles.list}>
            <View style={styles.shopHead}>
              <View style={styles.shopTitleRow}>
                <Text style={styles.shopName} numberOfLines={1}>{shop.sellerName ?? 'Seller'}</Text>
                {laneOf(shop) ? <LaneTag lane={laneOf(shop)!} /> : null}
              </View>
              {!bill.loading ? (
                <DeliveryMeter shop={shop} rules={bill.rules} currency={bill.currency} />
              ) : null}
            </View>
            {shop.lines.map((line) => (
              <View key={line.item.listingId} style={styles.divided}>
                <CartRow
                  line={line}
                  onQuantity={(qty) => setQuantity(line.item.listingId, qty)}
                  onRemove={() => remove(line.item.listingId)}
                  onOpen={() => nav.navigate('ListingDetail', { id: line.item.listingId })}
                />
              </View>
            ))}
          </View>
        ))}

        <BillDetails
          itemCount={bill.orderable.length}
          itemsTotal={bill.itemsTotal}
          deliveryFee={bill.deliveryFee}
          shopsPayingDelivery={bill.shopsPayingDelivery}
          toPay={bill.toPay}
          currency={bill.currency}
          rules={bill.rules}
          excludedCount={blocked}
          orderCount={bill.orderCount}
        />
      </ScrollView>

      {/* The pay button as a floating card, like the running basket on the
          shelf: the amount on the left and the action on the right, so what
          the tap will cost is read before it is pressed. */}
      <View style={styles.foot}>
        {bill.rulesFailed ? (
          <PressScale onPress={bill.reload} scaleTo={0.98} cardStyle={[styles.checkoutCard, styles.checkoutCardDim]}>
            <Text style={styles.checkoutWait}>Couldn't load delivery charges. Try again</Text>
          </PressScale>
        ) : blockCheckout ? (
          <View style={[styles.checkoutCard, styles.checkoutCardDim]}>
            <Text style={styles.checkoutWait}>
              {bill.loading ? 'Checking stock…' : 'Nothing to check out'}
            </Text>
          </View>
        ) : (
          <PressScale onPress={() => nav.navigate('Checkout')} scaleTo={0.98} cardStyle={styles.checkoutCard}>
            <View style={styles.checkoutLeft}>
              <Mono style={styles.checkoutEyebrow}>TO PAY</Mono>
              <Text style={styles.checkoutTotal}>{money(bill.toPay!, bill.currency)}</Text>
              <Text style={styles.checkoutSub}>
                {bill.orderCount} {bill.orderCount === 1 ? 'order' : 'orders'} · delivery included
              </Text>
            </View>
            <Text style={styles.checkoutCta}>Checkout →</Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  shopHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 10 },
  shopName: { flexShrink: 1, fontFamily: font.sansBold, fontSize: 15, color: design.ink },
  shopTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  laneTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: design.mint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  laneTagText: { fontSize: 9, letterSpacing: 0.6, color: colors.forest },
  meter: { gap: 7 },
  meterText: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: design.ink2 },
  meterStrong: { fontFamily: font.sansBold, color: colors.ember },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: design.paper2, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.ember },
  meterFee: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },
  meterFree: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: design.mint, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
  },
  meterFreeText: { fontFamily: font.sansSemi, fontSize: 12, color: colors.forest },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: design.bg,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3 },
  title: { fontFamily: font.sansBold, fontSize: 20, letterSpacing: -0.5, color: design.ink, marginTop: 3 },
  headSub: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 2 },
  headAction: { fontFamily: font.sansSemi, fontSize: 13, color: colors.ember },

  body: { padding: 14, gap: 14, paddingBottom: 24 },
  list: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    overflow: 'hidden',
  },
  divided: { borderTopWidth: 1, borderTopColor: design.line },

  row: { flexDirection: 'row', gap: 12, padding: 14 },
  rowDim: { opacity: 0.55 },
  thumb: { width: 62, height: 62, borderRadius: 10, overflow: 'hidden', backgroundColor: design.paper2 },
  thumbImg: { width: 62, height: 62 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 24 },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  rowMeta: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3 },
  rowProblem: { fontFamily: font.sansMed, fontSize: 11.5, lineHeight: 16, color: colors.ember, marginTop: 3 },
  rowControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  rowAmount: { fontFamily: font.monoSemi, fontSize: 14, color: design.ink },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNameWrap: { flex: 1, minWidth: 0 },
  rowRemove: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.paper2,
  },

  foot: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, backgroundColor: design.bg },
  checkoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.forest, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 13, minHeight: 64,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  checkoutLeft: { flex: 1, minWidth: 0 },
  checkoutEyebrow: { fontSize: 9, letterSpacing: 0.8, color: 'rgba(244,241,234,0.6)' },
  checkoutTotal: { fontFamily: font.sansBold, fontSize: 19, letterSpacing: -0.4, color: colors.textInverse, marginTop: 1 },
  checkoutSub: { fontFamily: font.sans, fontSize: 11, color: 'rgba(244,241,234,0.72)', marginTop: 1 },
  checkoutCta: { fontFamily: font.sansBold, fontSize: 15, color: design.leaf },
  checkoutWait: { flex: 1, textAlign: 'center', fontFamily: font.sansBold, fontSize: 14.5, color: colors.textInverse },
  checkoutCardDim: { opacity: 0.55, justifyContent: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 18, color: design.ink },
  emptyBody: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink3, textAlign: 'center' },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: colors.forest,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  emptyBtnText: { fontFamily: font.sansBold, fontSize: 14, color: colors.textInverse },
});
