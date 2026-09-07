// =============================================================================
// BillDetails — what the shopper actually pays, itemised
// =============================================================================
// The same card on the cart and on the checkout, because the number must not
// change between the two screens. Every line here is a real line: the money
// column adds up to the amount the direct-purchase API will charge.
//
// WHY DELIVERY AND THE PLATFORM FEE ARE WORDS, NOT ZEROS
// Neither is charged to the shopper. The grower brings a retail order in on
// their local round, and CropBid's 2% comes out of the grower's settlement
// rather than being added on top. A "₹0" against each would read as a
// placeholder for a fee that lands later; saying who pays it is both shorter
// and true.
//
// If a delivery charge is ever levied, it arrives as `deliveryFee` and this
// card starts showing a number without any other screen having to change.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { money } from '../lib/format';
import { colors, design, font } from '../theme';

interface Props {
  itemCount: number;
  itemsTotal: number;
  deliveryFee: number;
  toPay: number;
  currency: string;
  /** Rows the shopper still has in the basket that are not being billed. */
  excludedCount?: number;
  /** How many separate orders this bill becomes. Omitted on a single-lot bill. */
  orderCount?: number;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
    </View>
  );
}

export function BillDetails({
  itemCount, itemsTotal, deliveryFee, toPay, currency, excludedCount = 0, orderCount,
}: Props) {
  return (
    <View style={styles.card}>
      <Mono style={styles.eyebrow}>BILL DETAILS</Mono>

      <Row
        label={`Items total (${itemCount} ${itemCount === 1 ? 'lot' : 'lots'})`}
        value={money(itemsTotal, currency)}
      />
      <Row
        label="Delivery"
        value={deliveryFee > 0 ? money(deliveryFee, currency) : 'Free'}
        muted={deliveryFee === 0}
      />
      <Row label="Platform fee" value="Paid by the grower" muted />

      <View style={styles.totalRow}>
        <Mono style={styles.totalLabel}>TO PAY</Mono>
        <Text style={styles.totalValue}>{money(toPay, currency)}</Text>
      </View>

      {excludedCount > 0 ? (
        <Text style={styles.warn}>
          {excludedCount === 1 ? '1 lot in your cart is' : `${excludedCount} lots in your cart are`} not in
          this bill — see the note on {excludedCount === 1 ? 'it' : 'them'} above.
        </Text>
      ) : null}

      {orderCount != null && orderCount > 1 ? (
        <Text style={styles.note}>
          Each lot is settled with its own grower, so this becomes {orderCount} orders — one per lot,
          each tracked separately in Orders.
        </Text>
      ) : null}

      <Text style={styles.note}>
        You pay after the order is placed. Money is held by CropBid and released to the grower only
        once you confirm the delivery arrived.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  rowLabel: { flex: 1, fontFamily: font.sans, fontSize: 13, color: design.ink2 },
  rowValue: { fontFamily: font.monoMed, fontSize: 13, color: design.ink },
  rowValueMuted: { color: design.ink3 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: design.line,
  },
  totalLabel: { fontSize: 10.5, letterSpacing: 0.7, color: design.ink3 },
  totalValue: { fontFamily: font.sansBold, fontSize: 20, letterSpacing: -0.4, color: design.ink },
  warn: { fontFamily: font.sansMed, fontSize: 11.5, lineHeight: 16, color: colors.ember, marginTop: 10 },
  note: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 16, color: design.ink3, marginTop: 10 },
});
