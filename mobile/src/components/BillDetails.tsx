// =============================================================================
// BillDetails — what the shopper actually pays, itemised
// =============================================================================
// The same card on the cart and on the checkout, because the number must not
// change between the two screens. Every line here is a real line: the money
// column adds up to what the shop orders will charge.
//
// DELIVERY IS PER SHOP. Each shop makes its own run: free from ₹200 of that
// shop's items, ₹30 below. The row is the sum across shops, and says how many
// are paying so a ₹60 line on a two-shop basket is not a mystery.
//
// HANDLING IS PER SHOP ORDER TOO, and flat: ₹10 on each, whatever it comes to
// (2026-11-22), kept by CropBid. It replaced a "Platform fee: Paid by the
// seller" row: the 2% still comes out of the seller's settlement, but the
// shopper's bill shows only what the shopper pays.
// =============================================================================

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { money } from '../lib/format';
import { colors, design, font } from '../theme';
import type { RetailRules } from '../api/types';

interface Props {
  itemCount: number;
  itemsTotal: number;
  /** Every shop's delivery fee together. Null when the rules could not be loaded. */
  deliveryFee: number | null;
  /** How many shops in this bill pay for delivery. */
  shopsPayingDelivery: number;
  /** Every shop order's handling fee together. Null when the rules could not be loaded. */
  handlingFee: number | null;
  toPay: number | null;
  currency: string;
  rules: RetailRules | null;
  /** Rows the shopper still has in the basket that are not being billed. */
  excludedCount?: number;
  /** How many separate orders this bill becomes: one per shop. */
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
  itemCount, itemsTotal, deliveryFee, shopsPayingDelivery, handlingFee, toPay, currency, rules,
  excludedCount = 0, orderCount,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Mono style={styles.eyebrow}>{t('BILL DETAILS')}</Mono>

      <Row
        label={`Items total (${itemCount} ${itemCount === 1 ? 'lot' : 'lots'})`}
        value={money(itemsTotal, currency)}
      />
      <Row
        label={shopsPayingDelivery > 1 ? `Delivery (${shopsPayingDelivery} shops)` : 'Delivery'}
        value={deliveryFee === null
          ? 'Could not load'
          : deliveryFee > 0 ? money(deliveryFee, currency) : 'Free'}
        muted={deliveryFee === 0}
      />
      {handlingFee !== 0 ? (
        <Row
          label={orderCount != null && orderCount > 1 ? `Handling fee (${orderCount} orders)` : 'Handling fee'}
          value={handlingFee === null ? 'Could not load' : money(handlingFee, currency)}
        />
      ) : null}

      <View style={styles.totalRow}>
        <Mono style={styles.totalLabel}>{t('TO PAY')}</Mono>
        <Text style={styles.totalValue}>{toPay === null ? '—' : money(toPay, currency)}</Text>
      </View>

      {excludedCount > 0 ? (
        <Text style={styles.warn}>
          {excludedCount === 1 ? '1 lot in your cart is' : `${excludedCount} lots in your cart are`} not in
          this bill — see the note on {excludedCount === 1 ? 'it' : 'them'} above.
        </Text>
      ) : null}

      {rules ? (
        <Text style={styles.note}>
          Delivery is free on {money(rules.freeDeliveryFrom, currency)} or more from a shop, and{' '}
          {money(rules.deliveryFee, currency)} per shop below that.
          {rules.handlingFee ? ` A ${money(rules.handlingFee, currency)} handling fee applies to each shop order.` : ''}
        </Text>
      ) : null}

      {orderCount != null && orderCount > 1 ? (
        <Text style={styles.note}>
          CropBid collects from each shop separately, so this becomes {orderCount} orders, one per shop, paid for
          together in one payment and tracked on their own in Orders.
        </Text>
      ) : null}

      <Text style={styles.note}>
        You pay as soon as the order is placed. Money is held by CropBid and released to the seller
        only once you confirm the delivery arrived.
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
