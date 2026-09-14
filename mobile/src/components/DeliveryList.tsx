// =============================================================================
// DeliveryList — everything arriving tomorrow morning, in every size we sell it
// =============================================================================
// The rails above answer "what is the going rate for tomatoes". This answers a
// different question: "what can I actually get delivered, and how much of it".
// A household filling a week's basket wants the whole list in one column with
// the sizes on it, not five horizontal scrollers to swipe through.
//
// MULTIPLE SKUs PER ROW. One pack size is enough for a card in a rail; it is
// not enough here. Somebody who wants 5 kg of onions should tap "5 kg", not
// "1 kg" and then +1 four times. The sizes come off a fixed ladder anchored to
// each crop's own base pack, so a spice never starts at a kilo and a staple
// never starts at 100 g. See lib/catalog `packVariants`.
//
// THE SIZE CHIP IS THE BUY BUTTON. Tapping "2 kg" puts 2 kg in the basket, and
// the row then shows a stepper for that line instead. Selecting a size and then
// hunting for a separate ADD is two taps where one will do, and the chip
// already says exactly what it will do.
//
// EVERY ROW IS A REAL LOT. Nothing here is a catalogue entry with no seller
// behind it: the list is built from what the browse feed returned, so a crop
// nobody is selling simply is not on it.
// =============================================================================

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { QuantityStepper } from './QuantityStepper';
import { IconLeaf } from './icons';
import { type PackVariant } from '../lib/catalog';
import { money } from '../lib/format';
import { listingImage } from '../utils/cropImages';
import type { Listing } from '../api/types';
import { colors, design, font, radius, spacing } from '../theme';

export interface DeliveryRowCart {
  /** How much of this listing is already in the basket, in listing units. */
  inCart: number;
  /**
   * Quantity is in the LISTING's own unit, and that is the whole conversion.
   * The basket derives the pack itself (CartContext `packOf`), so tapping
   * "2 kg" on a kilo-based lot stores 2 units against a 1 kg pack and the
   * stepper reads "2 × 1 kg". Passing a pack in here as well would be a second
   * source for something the cart already knows.
   */
  add: (listing: Listing, quantity: number) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  remove: (listingId: string) => void;
}

/**
 * A lot and the sizes it is sold in.
 *
 * The variants are computed by the CALLER, not per row, so that whatever counts
 * the list ("12 items") is counting rows that will actually render. Working it
 * out in here instead let a bulk-only crop be counted in the heading and then
 * return null, and the header disagreed with the list underneath it.
 */
export interface DeliveryRow {
  listing: Listing;
  variants: PackVariant[];
}

export function DeliveryList({
  rows,
  cart,
  onOpen,
}: {
  rows: DeliveryRow[];
  /** Null for anyone who is not a signed-in shopper: they read the list, they do not fill it. */
  cart: ((listing: Listing) => DeliveryRowCart) | null;
  onOpen: (listing: Listing) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {rows.map(({ listing, variants }) => (
        <Row
          key={listing.id}
          listing={listing}
          variants={variants}
          cart={cart ? cart(listing) : null}
          onOpen={() => onOpen(listing)}
        />
      ))}
    </View>
  );
}

function Row({
  listing,
  variants,
  cart,
  onOpen,
}: {
  listing: Listing;
  variants: PackVariant[];
  cart: DeliveryRowCart | null;
  onOpen: () => void;
}) {
  const photo = listingImage(listing);
  // `Unit` is KG | QUINTAL | TONNE; there is no LITRE on a listing, so a litre
  // branch here would be unreachable. Dairy is denominated in KG like the rest.
  const perKg = variants[0].price / variants[0].kg;
  const inCart = cart?.inCart ?? 0;

  return (
    <View style={styles.row}>
      <PressScale onPress={onOpen} scaleTo={0.99} style={styles.rowTopSlot} cardStyle={styles.rowTop}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbLetter}>{listing.cropName.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.crop} numberOfLines={1}>{listing.cropName}</Text>
            {listing.organic ? <IconLeaf size={13} stroke={colors.sage} /> : null}
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            {listing.cropVariety ?? listing.location} · {gradeLabel(listing.qualityGrade)}
          </Text>
          <Text style={styles.perKg}>
            {money(perKg, listing.currency)}
            <Text style={styles.perKgUnit}>/kg</Text>
          </Text>
        </View>
      </PressScale>

      {/* The sizes. Read-only for a guest or a trader: the chips are the buy
          control, so without a basket there is nothing for them to be. */}
      {cart ? (
        inCart > 0 ? (
          <View style={styles.inBasket}>
            <Mono style={styles.inBasketLabel}>IN YOUR BASKET</Mono>
            <QuantityStepper
              value={inCart}
              onChange={(q) => cart.setQuantity(listing.id, q)}
              unit={listing.unit}
              // Stepped by the crop's BASE pack, which is the first rung of
              // the ladder. A shopper who tapped 5 kg can then come down in
              // 1 kg steps rather than being locked to multiples of five.
              pack={{ label: variants[0].label, kg: variants[0].kg, units: variants[0].units }}
              max={listing.remainingQuantity}
              size="sm"
              onEmpty={() => cart.remove(listing.id)}
            />
          </View>
        ) : (
          <View style={styles.skus}>
            {variants.map((v) => (
              <SkuChip
                key={v.label}
                variant={v}
                currency={listing.currency}
                onPress={() => cart.add(listing, v.units)}
              />
            ))}
          </View>
        )
      ) : (
        <View style={styles.skus}>
          {variants.map((v) => (
            <View key={v.label} style={[styles.chipSlot, styles.chip, styles.chipFlat]}>
              <Text style={styles.chipSize}>{v.label}</Text>
              <Text style={styles.chipPrice}>{money(v.price, listing.currency)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SkuChip({
  variant,
  currency,
  onPress,
}: {
  variant: PackVariant;
  currency: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} scaleTo={0.94} style={styles.chipSlot} cardStyle={styles.chip}>
      <Text style={styles.chipSize}>{variant.label}</Text>
      <Text style={styles.chipPrice}>{money(variant.price, currency)}</Text>
    </PressScale>
  );
}

/** "Grade A". Spelled out, because a bare "A" beside a variety reads as part of the name. */
function gradeLabel(grade: string): string {
  return `Grade ${grade}`;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg },

  row: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTopSlot: { alignSelf: 'stretch' },
  rowTop: { flexDirection: 'row', gap: spacing.md, backgroundColor: 'transparent' },

  thumb: { width: 62, height: 62, borderRadius: radius.md, backgroundColor: design.paper2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbLetter: { fontFamily: font.sansBold, fontSize: 24, color: colors.sage },

  info: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  crop: { fontFamily: font.sansSemi, fontSize: 15.5, color: design.ink },
  sub: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 1 },
  perKg: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 4 },
  perKgUnit: { fontFamily: font.sans, fontSize: 11, color: design.ink3 },

  skus: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  // The flex lives on the Pressable (PressScale's `style`), because that is the
  // flex child of the row. Putting it on `cardStyle` styles the inner animated
  // view instead and the chips stay content-width.
  chipSlot: { flex: 1 },
  chip: {
    borderWidth: 1,
    borderColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: design.paper,
  },
  // No border colour and no press target: the read-only version for a guest.
  chipFlat: { borderColor: design.line, opacity: 0.65 },
  chipSize: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink },
  chipPrice: { fontFamily: font.sansMed, fontSize: 12, color: colors.forest, marginTop: 1 },

  inBasket: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: design.lineLight,
  },
  inBasketLabel: { fontSize: 9, letterSpacing: 0.8, color: colors.sage },
});
