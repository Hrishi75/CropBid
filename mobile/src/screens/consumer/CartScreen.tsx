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
//   2. IT SAYS HOW MANY ORDERS THIS IS. One basket is not one order here. Every
//      lot is a separate grower with a separate escrow settlement, so four lots
//      means four orders in Orders. Hiding that would make the orders list look
//      wrong the moment the shopper opened it.
//
// The stepper writes straight through to the cart, so quantity changes need no
// save button and no refetch — the price data is already in hand and only the
// arithmetic moves.
// =============================================================================

import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillDetails } from '../../components/BillDetails';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Mono } from '../../components/buyerKit';
import { FadeInImage, PressScale } from '../../components/motion';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useCartLines, type CartLine } from '../../lib/cartLines';
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
        <Pressable onPress={onOpen} hitSlop={4}>
          <Text style={styles.rowName} numberOfLines={1}>{item.cropName}</Text>
        </Pressable>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.cropVariety ? `${item.cropVariety} · ` : ''}
          {item.organic ? 'Organic' : `Grade ${item.qualityGrade}`}
          {item.farmerName ? ` · ${item.farmerName}` : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {money(price, item.currency)}/{unit}
          {item.pack ? ` · ${item.pack.label} pack` : ''}
        </Text>

        {problem ? (
          <Text style={styles.rowProblem}>{problem}</Text>
        ) : repriced ? (
          <Text style={styles.rowProblem}>
            Price updated by the grower — was {money(item.pricePerUnit, item.currency)}/{unit}.
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

        <Pressable onPress={onRemove} hitSlop={6}>
          <Text style={styles.rowRemove}>Remove</Text>
        </Pressable>
      </View>
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
            Add produce from the shop and it collects here — one bill, however many growers it
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
        <View style={styles.list}>
          {bill.lines.map((line, i) => (
            <View key={line.item.listingId} style={i > 0 ? styles.divided : undefined}>
              <CartRow
                line={line}
                onQuantity={(qty) => setQuantity(line.item.listingId, qty)}
                onRemove={() => remove(line.item.listingId)}
                onOpen={() => nav.navigate('ListingDetail', { id: line.item.listingId })}
              />
            </View>
          ))}
        </View>

        <BillDetails
          itemCount={bill.orderable.length}
          itemsTotal={bill.itemsTotal}
          deliveryFee={bill.deliveryFee}
          toPay={bill.toPay}
          currency={bill.currency}
          excludedCount={blocked}
          orderCount={bill.orderCount}
        />
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: 12 }]}>
        <PressScale
          onPress={
            bill.loading || bill.orderable.length === 0 ? undefined : () => nav.navigate('Checkout')
          }
          scaleTo={0.98}
          cardStyle={[
            styles.checkoutBtn,
            (bill.loading || bill.orderable.length === 0) && styles.checkoutBtnDim,
          ]}
        >
          <Text style={styles.checkoutText}>
            {bill.loading
              ? 'Checking stock…'
              : bill.orderable.length === 0
                ? 'Nothing to check out'
                : `Checkout · ${money(bill.toPay, bill.currency)}`}
          </Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
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
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  rowMeta: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3 },
  rowProblem: { fontFamily: font.sansMed, fontSize: 11.5, lineHeight: 16, color: colors.ember, marginTop: 3 },
  rowControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  rowAmount: { fontFamily: font.monoSemi, fontSize: 14, color: design.ink },
  rowRemove: { fontFamily: font.sansMed, fontSize: 12, color: design.ink3, marginTop: 6 },

  foot: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: design.paper,
    borderTopWidth: 1,
    borderTopColor: design.line,
  },
  checkoutBtn: {
    backgroundColor: colors.forest,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
  },
  checkoutBtnDim: { opacity: 0.5 },
  checkoutText: { fontFamily: font.sansBold, fontSize: 15, color: colors.textInverse, letterSpacing: 0.2 },

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
