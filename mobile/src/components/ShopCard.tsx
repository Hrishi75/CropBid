// =============================================================================
// ShopCard — one local shop, on the home screen
// =============================================================================
// THE SHOP IS THE UNIT, NOT THE PRODUCT. The same tomato costing ₹24 at one
// counter and ₹28 at another is the point, not noise to average away: shop
// identity is the one thing an aggregator's model structurally cannot copy,
// because it works by making the source invisible (CLAUDE.md §3).
//
// The card has to answer "is this worth opening?" without a tap, so it carries
// what is actually on the shelf and the cheapest price on it, not just a name.
// =============================================================================

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { IconLeaf, IconShield } from './icons';
import { money } from '../lib/format';
import type { RetailShop } from '../api/types';
import { colors, design, font, radius, spacing } from '../theme';

/** "Vegetable shop", "Kirana store". Falls back to the seller kind. */
export function shopTypeLabel(shopType: string | null, sellerType: string): string {
  if (shopType) {
    const map: Record<string, string> = {
      vegetable: 'Vegetable shop',
      kirana: 'Kirana store',
      general: 'General store',
      fruit: 'Fruit shop',
      dairy: 'Dairy',
    };
    return map[shopType] ?? `${shopType[0].toUpperCase()}${shopType.slice(1)} shop`;
  }
  if (sellerType === 'FARMER') return 'Farm';
  if (sellerType === 'WHOLESALER') return 'Wholesaler';
  return 'Shop';
}

export function ShopCard({ shop, onPress }: { shop: RetailShop; onPress: () => void }) {
  // Rounded. The crop rails interpolate trustScore raw and render
  // "★ 84.2601595017465" on a card; this does not.
  const trust = Math.round(shop.trustScore);

  return (
    <PressScale onPress={onPress} scaleTo={0.98} cardStyle={styles.card}>
      <View style={styles.row}>
        {/* A stand-in that looks deliberate beats a blank tile, which reads as
            an image that failed to load. */}
        {shop.image ? (
          <Image source={{ uri: shop.image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbLetter}>{shop.name.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>{shop.name}</Text>
            {shop.verified ? <IconShield size={14} stroke={colors.sage} /> : null}
          </View>

          <Text style={styles.meta} numberOfLines={1}>
            {shopTypeLabel(shop.shopType, shop.sellerType)} · {shop.itemCount}{' '}
            {shop.itemCount === 1 ? 'item' : 'items'}
          </Text>

          {/* What is actually on the shelf. Without this the card is a name and
              a photograph, and there is no reason to open one shop over another. */}
          <Text style={styles.crops} numberOfLines={1}>
            {shop.crops.slice(0, 3).join(' · ')}
            {shop.crops.length > 3 ? `  +${shop.crops.length - 3}` : ''}
          </Text>

          <View style={styles.foot}>
            <View style={styles.pills}>
              {/* Labelled, because a bare 0-100 platform score reads as a
                  five-star rating with the stars missing. */}
              <View style={styles.pill}>
                <Mono style={styles.pillText}>TRUST {trust}</Mono>
              </View>
              {shop.organicCount > 0 ? (
                <View style={[styles.pill, styles.pillOrganic]}>
                  <IconLeaf size={10} stroke={colors.sage} />
                  <Mono style={[styles.pillText, { color: colors.sage }]}>ORGANIC</Mono>
                </View>
              ) : null}
            </View>

            {/* "from", because it is the cheapest thing on the shelf and not the
                price of whatever is in the picture. */}
            {shop.fromPricePerKg != null ? (
              <Text style={styles.price}>
                <Text style={styles.priceLabel}>from </Text>
                {money(shop.fromPricePerKg, shop.currency)}
                <Text style={styles.priceLabel}>/kg</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: design.paper2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbLetter: { fontFamily: font.sansBold, fontSize: 30, color: colors.sage },

  body: { flex: 1, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  meta: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 2 },
  crops: { fontFamily: font.sans, fontSize: 12, color: design.ink2, marginTop: 5 },

  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  pills: { flexDirection: 'row', gap: 5 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  pillOrganic: { borderColor: colors.sage },
  pillText: { fontSize: 9, letterSpacing: 0.3, color: design.ink3 },
  price: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  priceLabel: { fontFamily: font.sans, fontSize: 11, color: design.ink3 },
});
