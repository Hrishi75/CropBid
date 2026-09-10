// The floating basket bar, shown over the shop screens whenever there is
// something in the basket.
//
// Both Blinkit and Zepto keep one pinned above the tab bar, and it earns its
// place: a shopper filling a basket wants to know the running total without
// leaving the shelf, and the tab badge alone gives a count with no money
// attached.
//
// THE TOTAL HERE IS THE SNAPSHOT, not the re-priced bill. Pricing every line
// against the live listing takes a request per row (lib/cartLines), which is
// right on the cart screen where the shopper is about to pay and wrong on a
// bar that has to paint instantly while they browse. It is within a rupee
// unless a seller re-priced mid-basket, and the cart screen is the authority
// the moment they tap through, which is why this says "basket" rather than
// naming itself a bill.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import { money, pricePerKg } from '../lib/units';
import { Mono } from './ui';
import { IconBasket, IconChevronRight } from './icons';
import { colors, font, radius, shadow, spacing } from '../theme';

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const insets = useSafeAreaInsets();
  const { items } = useCart();

  if (items.length === 0) return null;

  const total = items.reduce(
    (sum, i) => sum + pricePerKg(i.pricePerUnit, i.unit) * i.quantity,
    0,
  );
  const currency = items[0]?.currency ?? 'INR';

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.bar,
        { bottom: insets.bottom + 64 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.icon}>
        <IconBasket size={17} color={colors.forest} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.count}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Text>
        <Mono style={styles.total}>{money(total, currency)}</Mono>
      </View>
      <Text style={styles.cta}>View basket</Text>
      <IconChevronRight size={16} color={colors.surface} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.header,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.sage2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontFamily: font.sansSemi, fontSize: 14, color: colors.surface },
  total: { fontSize: 11, color: colors.sage2, marginTop: 1 },
  cta: { fontFamily: font.sansSemi, fontSize: 14, color: colors.surface },
});
