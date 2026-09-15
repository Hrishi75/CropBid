// =============================================================================
// CartBar — the basket, always one thumb away
// =============================================================================
// A shopper filling a basket is scrolling a shelf, not watching a header. The
// bar rides the bottom of the screen from the first ADD onwards so the running
// total is never something they have to go and look for, and the way to the
// cart is under the thumb.
//
// It paints from the cart's own snapshot rather than re-pricing every lot: this
// is a signpost, not a bill. The real number — checked against live stock and
// live prices — is on the cart and checkout screens, which is exactly why
// neither of them renders one.
//
// POSITIONING. It is absolutely positioned inside whatever screen renders it,
// so on a tab screen it lands directly on top of the tab bar with no
// measurement, and on a pushed stack screen it needs the home-indicator inset
// instead — hence `overTabBar`.
//
// The web mirror of this is client/src/components/consumer/CartBar.tsx. The
// header chip that goes with it there is a bottom-tab badge here; see
// navigation/ConsumerTabBar.tsx.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { PressScale } from './motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { money } from '../lib/format';
import { colors, design, font } from '../theme';

export function CartBar({ overTabBar = false }: { overTabBar?: boolean }) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, count, snapshotTotal, currency } = useCart();

  // Retail only. A farmer or buyer has no basket, and an empty one has nothing
  // to say.
  if (user?.role !== 'CONSUMER' || items.length === 0) return null;

  const label = count === 1 ? '1 lot' : `${count} lots`;

  return (
    <View
      style={[styles.bar, { paddingBottom: overTabBar ? 12 : Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      <PressScale
        // The Cart tab lives inside ConsumerTabs, and navigate() only ever
        // searches the current navigator and its PARENTS — never down into a
        // child. Addressing it through ConsumerTabs is therefore the one form
        // that works from both places this bar is rendered: the shelf, which is
        // a sibling tab, and the seller comparison, which is pushed over the
        // whole tab bar.
        onPress={() => nav.navigate('ConsumerTabs', { screen: 'Cart' })}
        scaleTo={0.98}
        cardStyle={styles.inner}
      >
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
        <View style={styles.txt}>
          <Text style={styles.items}>{label}</Text>
          <Text style={styles.total}>{money(snapshotTotal, currency)}</Text>
        </View>
        <Text style={styles.cta}>View cart →</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.forest,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  countPill: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(244,241,234,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: font.sansBold, fontSize: 13, color: colors.textInverse },
  txt: { flex: 1, minWidth: 0 },
  items: { fontFamily: font.sansMed, fontSize: 11, color: 'rgba(244,241,234,0.72)' },
  total: { fontFamily: font.sansBold, fontSize: 15.5, letterSpacing: -0.3, color: colors.textInverse },
  cta: { fontFamily: font.sansBold, fontSize: 13.5, color: design.leaf },
});
