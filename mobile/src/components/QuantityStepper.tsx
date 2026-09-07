// =============================================================================
// QuantityStepper — how much of a listing a shopper wants
// =============================================================================
// Listings are denominated in the unit the FARMER sells in (kg, quintal or
// tonne), and the direct-purchase API takes its quantity in that same unit. A
// shopper buying "1" of a quintal-denominated lot would be ordering 100 kg, so
// nothing here counts in listing units where a household pack exists: a packed
// lot steps in PACKS ("2 × 500 g") and converts on the way out, exactly as the
// storefront card and the listing screen's buy bar already do. Only a bulk-only
// crop with no pack (cotton, maize) is stepped by its own unit, and then the
// step size is scaled per unit rather than being a flat 1.
//
// Floating point is the real hazard here: 0.1 + 0.2 is 0.30000000000000004, and
// that number would go on to be multiplied by a price and sent as an order
// quantity. Pack arithmetic is therefore rounded in KILOGRAMS — where every
// pack is a whole number of grams — and only then converted, which is what
// keeps a 500 g pack off a TONNE lot from collapsing to zero.
// =============================================================================

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CartPack } from '../context/CartContext';
import type { Unit } from '../api/types';
import { unitLabel } from '../lib/format';
import { colors, design, font } from '../theme';

// Roughly a half-kilo of resolution in every denomination, so the buttons move
// by an amount a household actually thinks in. Only reached by pack-less lots.
const STEP: Record<Unit, number> = { KG: 0.5, QUINTAL: 0.05, TONNE: 0.005 };

/** How much `count` packs comes to in the LISTING's own unit — what the order carries. */
export function packQuantity(pack: CartPack, count: number): number {
  const kgPerUnit = pack.kg / pack.units;
  return Number((count * pack.kg).toFixed(3)) / kgPerUnit;
}

/** How many whole packs a stored quantity represents. Never less than one. */
export function packCount(pack: CartPack, quantity: number): number {
  return Math.max(1, Math.round(quantity / pack.units));
}

/** What one tap of + or − moves, in listing units. */
export function stepFor(pack: CartPack | null, unit: Unit): number {
  return pack ? pack.units : STEP[unit] ?? 1;
}

interface Props {
  /** The current amount, in the listing's own unit. */
  value: number;
  /** Called with the next amount, in the listing's own unit. */
  onChange: (next: number) => void;
  unit: Unit;
  /** The household pack this lot is shelved as, if it has one. */
  pack: CartPack | null;
  /** Stock ceiling, in listing units. */
  max: number;
  /**
   * 'sm' is the pill that sits on a shelf card or beside a cart row's price.
   * 'md' is the wider control the listing screen gives a whole line to.
   */
  size?: 'sm' | 'md';
  /** Lets the smallest step remove the row instead of clamping at one step. */
  onEmpty?: () => void;
  /** Whether the pill spells out what it is counting. A 150px card has no room. */
  showUnit?: boolean;
}

export function QuantityStepper({
  value, onChange, unit, pack, max, size = 'md', onEmpty, showUnit = true,
}: Props) {
  const step = stepFor(pack, unit);
  // What the number on the pill means, and what the label beside it reads.
  const shown = pack ? packCount(pack, value) : value;
  const label = pack ? pack.label : unitLabel(unit);

  // Never offer a quantity the server would reject: the floor is one step and
  // the ceiling is whatever stock is actually left.
  const atMin = value <= step;
  const atMax = value + step > max;

  const move = (delta: number) => {
    if (delta < 0 && atMin) { onEmpty?.(); return; }
    const next = pack
      ? packQuantity(pack, Math.max(1, shown + delta))
      : Math.round(Math.max(step, value + delta * step) * 1000) / 1000;
    onChange(Math.min(next, Math.max(max, step)));
  };

  const small = size === 'sm';

  return (
    <View style={[styles.wrap, small ? styles.wrapSm : styles.wrapMd]}>
      <Pressable
        onPress={() => move(-1)}
        disabled={atMin && !onEmpty}
        hitSlop={6}
        accessibilityLabel={atMin && onEmpty ? `Remove ${label}` : `Less ${label}`}
        style={[styles.btn, small ? styles.btnSm : styles.btnMd, atMin && !onEmpty && styles.btnOff]}
      >
        <Text style={[styles.btnText, small && styles.btnTextSm]}>{atMin && onEmpty ? '🗑' : '−'}</Text>
      </Pressable>

      {/* The unit stays in the accessible name even when it is not drawn —
          "2" alone tells a screen reader nothing about what was added. */}
      <View style={styles.valueWrap} accessible accessibilityLabel={`${shown} ${label}`}>
        <Text style={[styles.value, small && styles.valueSm]} numberOfLines={1}>
          {shown}
          {showUnit ? <Text style={[styles.valueUnit, small && styles.valueUnitSm]}> {label}</Text> : null}
        </Text>
      </View>

      <Pressable
        onPress={() => move(1)}
        disabled={atMax}
        hitSlop={6}
        accessibilityLabel={`More ${label}`}
        style={[styles.btn, small ? styles.btnSm : styles.btnMd, atMax && styles.btnOff]}
      >
        <Text style={[styles.btnText, small && styles.btnTextSm]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.3,
    borderColor: colors.forest,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  wrapSm: { borderRadius: 9 },
  wrapMd: { borderRadius: 12 },
  btn: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  btnSm: { paddingHorizontal: 9, paddingVertical: 5 },
  btnMd: { paddingHorizontal: 14, paddingVertical: 10 },
  btnOff: { opacity: 0.4 },
  btnText: { fontFamily: font.sansBold, fontSize: 16, lineHeight: 19, color: colors.forest },
  btnTextSm: { fontSize: 14, lineHeight: 17 },
  valueWrap: { minWidth: 44, paddingHorizontal: 6, alignItems: 'center' },
  value: { fontFamily: font.sansBold, fontSize: 15, color: design.ink },
  valueSm: { fontSize: 13 },
  valueUnit: { fontFamily: font.sansMed, fontSize: 12, color: design.ink3 },
  valueUnitSm: { fontSize: 11 },
});
