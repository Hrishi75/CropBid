// =============================================================================
// CheckoutScreen — turn the basket into real orders
// =============================================================================
// ONE BASKET, SEVERAL ORDERS — AND WHY THAT IS NOT A BUG
// POST /bids/direct-purchase claims one lot's stock, mints a pre-ACCEPTED bid
// and opens a Transaction in the same DB transaction. That pairing is the whole
// escrow model: one lot, one grower, one settlement the shopper releases when
// that grower's produce arrives. Four lots genuinely are four settlements, so
// this screen places four purchases and says so before the shopper commits,
// rather than inventing a basket-level order the rest of the system has no
// concept of.
//
// PARTIAL SUCCESS IS A REAL OUTCOME, SO IT IS HANDLED
// The calls go one at a time. If the third fails — someone else took the last
// two kilos in the seconds since the cart was priced — the first two orders
// already exist and cannot be unwound by a client. So the successful lots are
// removed from the cart, the failed ones are LEFT in it with the reason, and
// the shopper is told exactly which is which. Clearing the whole basket there
// would hide an order they still want; retrying the whole basket would
// double-order the two that worked.
//
// AND A FAILURE IS NOT ALWAYS A FAILURE
// A request whose response is lost on the way back is indistinguishable here
// from one the server rejected: both land in the catch, and both leave the lot
// sitting in the cart looking unbought. Retrying would buy it a second time.
// Every line therefore carries a purchaseKey (see context/CartContext.tsx),
// sent as the request's idempotencyKey, and a retry with the same key returns
// the order that already exists instead of claiming the stock again. The key
// lives in the stored cart rather than in this component, because a shopper
// whose request vanished may well kill the app before trying again.
//
// WHY THE ADDRESS AND PHONE ARE COLLECTED HERE
// The API treats both as optional and falls back to the buyer's profile, but
// bid.service then REFUSES a retail order that ends up with neither. Asking
// here, prefilled from the profile, means that error never fires.
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BillDetails } from '../../components/BillDetails';
import { Mono } from '../../components/buyerKit';
import { FadeInImage, PressScale } from '../../components/motion';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useCartLines } from '../../lib/cartLines';
import { directPurchase } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import { cropImageFor } from '../../utils/cropImages';
import { money, unitLabel } from '../../lib/format';
import { colors, design, font } from '../../theme';

export default function CheckoutScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { items, removeMany } = useCart();
  const city = user?.location?.trim() || '';
  const bill = useCartLines(items, city);

  const [placing, setPlacing] = useState(false);
  const [address, setAddress] = useState(user?.location ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [touched, setTouched] = useState(false);

  // An empty basket has nothing to check out, and the cart screen is where the
  // shopper can see that and act on it.
  useEffect(() => {
    if (items.length === 0 && !placing) nav.goBack();
  }, [items.length, placing, nav]);

  const addressValid = address.trim().length >= 6;
  // Same shape the signup form enforces, for the same reason: a delivery phone
  // that can't be dialled is worse than no order.
  const phoneValid =
    /^[+0-9][0-9\s\-()]*$/.test(phone.trim())
    && phone.trim().length <= 20
    && phone.replace(/[^0-9]/g, '').length >= 7;

  async function placeOrder() {
    setTouched(true);
    if (!addressValid || !phoneValid || bill.orderable.length === 0) return;

    setPlacing(true);

    const placed: string[] = [];
    const failures: { name: string; message: string }[] = [];

    // Sequential, not Promise.all: each call decrements stock, and a farmer
    // watching their listings should see orders arrive as orders, not as a
    // burst of parallel writes racing each other's stock claims.
    for (const line of bill.orderable) {
      try {
        await directPurchase({
          listingId: line.item.listingId,
          quantity: line.quantity,
          deliveryAddress: address.trim(),
          contactPhone: phone.trim(),
          // The line's own key, minted when it was added and re-minted whenever
          // its quantity moved. A failure leaves the line in the cart carrying
          // it, so pressing Place order again replays THIS purchase rather than
          // making a second one.
          idempotencyKey: line.item.purchaseKey,
        });
        placed.push(line.item.listingId);
      } catch (e) {
        failures.push({
          name: line.item.cropName,
          message: errorMessage(e, 'Could not be ordered'),
        });
      }
    }

    // Only what actually became an order leaves the basket.
    if (placed.length > 0) removeMany(placed);

    if (placed.length === 0) {
      setPlacing(false);
      Alert.alert('Order not placed', failures[0]?.message ?? 'Could not place your order');
      return;
    }

    // Orders is a tab under ConsumerTabs, which is BELOW this screen in the
    // stack. Naming the parent both pops the checkout off and lands on the
    // right tab; a bare navigate('Orders') would switch the tab underneath and
    // leave the shopper still staring at the checkout they just finished.
    const done = () => nav.navigate('ConsumerTabs', { screen: 'Orders' });

    if (failures.length > 0) {
      Alert.alert(
        `${placed.length} of ${placed.length + failures.length} ordered`,
        `${failures.map((f) => `${f.name}: ${f.message}`).join('\n')}\n\nThe rest is still in your cart.`,
        [{ text: 'OK', onPress: done }],
      );
    } else {
      Alert.alert(
        placed.length === 1 ? 'Order placed' : `${placed.length} orders placed`,
        'Pay from the Orders tab to move the money into escrow.',
        [{ text: 'OK', onPress: done }],
      );
    }
    // `placing` deliberately stays true here. Everything that became an order
    // has just left the basket, and the guard at the top of this component
    // sends an empty basket back to the cart — which would fire behind the
    // alert and undo the navigation the alert is about to make.
  }

  if (items.length === 0) return <View style={styles.flex} />;

  const blocked = bill.lines.length - bill.orderable.length;
  const canPlace = !bill.loading && bill.orderable.length > 0 && !placing;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Mono style={styles.eyebrow}>WHERE SHOULD IT GO?</Mono>

          <Text style={styles.label}>Delivery address</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={address}
            onChangeText={setAddress}
            onBlur={() => setTouched(true)}
            multiline
            placeholder="Flat / street, area, city, PIN"
            placeholderTextColor={design.ink3}
          />
          {touched && !addressValid ? (
            <Text style={styles.fieldError}>Enter a full delivery address</Text>
          ) : null}

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            onBlur={() => setTouched(true)}
            keyboardType="phone-pad"
            placeholder="+91-9876543210"
            placeholderTextColor={design.ink3}
          />
          <Text style={touched && !phoneValid ? styles.fieldError : styles.hint}>
            {touched && !phoneValid
              ? 'Enter a valid phone number'
              : 'Every grower in this order uses this to arrange delivery.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>
            {bill.orderCount > 1 ? `YOUR ORDERS · ${bill.orderCount}` : 'YOUR ORDER'}
          </Mono>

          {bill.lines.map((line) => {
            const unit = unitLabel(line.item.unit);
            const img = (line.item.image ? mediaUrl(line.item.image) : null)
              ?? cropImageFor(line.item.cropName);
            return (
              <View
                key={line.item.listingId}
                style={[styles.line, line.problem ? styles.lineDim : null]}
              >
                <View style={styles.thumb}>
                  {img ? (
                    <FadeInImage uri={img} style={styles.thumbImg} />
                  ) : (
                    <Text style={styles.thumbEmoji}>🌾</Text>
                  )}
                </View>
                <View style={styles.lineMain}>
                  <Text style={styles.lineName} numberOfLines={1}>{line.item.cropName}</Text>
                  <Text style={styles.lineMeta} numberOfLines={1}>
                    {line.quantity.toLocaleString('en-IN', { maximumFractionDigits: 6 })} {unit} ·{' '}
                    {money(line.price, line.item.currency)}/{unit}
                  </Text>
                  {line.problem ? (
                    <Text style={styles.lineProblem}>{line.problem} Fix it in your cart.</Text>
                  ) : null}
                </View>
                <Text style={styles.lineAmount}>
                  {line.problem ? '—' : money(line.lineTotal, line.item.currency)}
                </Text>
              </View>
            );
          })}
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

      <View style={styles.foot}>
        <PressScale
          onPress={canPlace ? placeOrder : undefined}
          scaleTo={0.98}
          cardStyle={[styles.placeBtn, !canPlace && styles.placeBtnDim]}
        >
          <Text style={styles.placeText}>
            {placing
              ? 'Placing…'
              : bill.orderable.length > 1
                ? `Place ${bill.orderable.length} orders · ${money(bill.toPay, bill.currency)}`
                : `Place order · ${money(bill.toPay, bill.currency)}`}
          </Text>
        </PressScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  body: { padding: 14, gap: 14, paddingBottom: 24 },
  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 10 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2, marginTop: 8, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: font.sans,
    fontSize: 15,
    color: design.ink,
    backgroundColor: design.bg,
  },
  multiline: { minHeight: 74, textAlignVertical: 'top' },
  fieldError: { fontFamily: font.sansMed, fontSize: 11.5, color: colors.ember, marginTop: 5 },
  hint: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 5 },

  line: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12 },
  lineDim: { opacity: 0.55 },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: design.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: 46, height: 46 },
  thumbEmoji: { fontSize: 19 },
  lineMain: { flex: 1, minWidth: 0 },
  lineName: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  lineMeta: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 1 },
  lineProblem: { fontFamily: font.sansMed, fontSize: 11.5, color: colors.ember, marginTop: 2 },
  lineAmount: { fontFamily: font.monoSemi, fontSize: 13.5, color: design.ink },

  foot: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: design.paper,
    borderTopWidth: 1,
    borderTopColor: design.line,
  },
  placeBtn: { backgroundColor: colors.forest, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  placeBtnDim: { opacity: 0.5 },
  placeText: { fontFamily: font.sansBold, fontSize: 15, color: colors.textInverse, letterSpacing: 0.2 },
});
