// The kilogram picker.
//
// Opens at 1 kg (or the whole lot when less than a kilo is left), steps by
// 500 g, and 500 g is the FLOOR rather than zero: below it the minus button
// becomes a remove, because a 200 g line is not something anyone delivers.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STEP_KG } from '../context/CartContext';
import { formatWeight } from '../lib/units';
import { colors, font, radius } from '../theme';

export function QuantityStepper({
  kg,
  maxKg,
  onChange,
  onRemove,
}: {
  kg: number;
  maxKg: number;
  onChange: (kg: number) => void;
  onRemove: () => void;
}) {
  const canAdd = kg + STEP_KG <= maxKg;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => (kg - STEP_KG < STEP_KG ? onRemove() : onChange(kg - STEP_KG))}
        hitSlop={6}
        style={styles.btn}
      >
        <Text style={styles.btnText}>{kg - STEP_KG < STEP_KG ? '×' : '−'}</Text>
      </Pressable>

      <Text style={styles.amount}>{formatWeight(kg)}</Text>

      <Pressable
        onPress={() => canAdd && onChange(kg + STEP_KG)}
        hitSlop={6}
        disabled={!canAdd}
        style={styles.btn}
      >
        {/* Dimmed rather than hidden at the stock ceiling: a control that
            vanishes reads as a bug, one that greys out reads as a limit. */}
        <Text style={[styles.btnText, !canAdd && styles.btnDisabled]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.forest,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 2,
  },
  btn: { width: 24, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: font.sansBold, fontSize: 15, color: colors.surface, lineHeight: 20 },
  btnDisabled: { opacity: 0.35 },
  amount: {
    minWidth: 52,
    textAlign: 'center',
    fontFamily: font.monoSemi,
    fontSize: 12,
    color: colors.surface,
  },
});
