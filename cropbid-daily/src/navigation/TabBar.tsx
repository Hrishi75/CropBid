// The bottom bar. Three tabs, which is what the app actually has: Orders lives
// inside You rather than beside it.
//
// The basket carries a count badge: on a phone a shopper looks for their basket
// at the bottom of the screen, so that is where the number lives. Capped at 9+
// because past nine the pill grows wider than the icon it sits on, and a
// household basket never gets there.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconBasket, IconHome, IconUser, type IcoProps } from '../components/icons';
import { useCart } from '../context/CartContext';
import { colors, design, font, radius } from '../theme';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Cart: IconBasket,
  You: IconUser,
};

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { count } = useCart();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const selected = state.index === i;
        const Icon = ICONS[route.name] ?? IconHome;
        const label = descriptors[route.key].options.title ?? route.name;
        const badge = route.name === 'Cart' && count > 0 ? count : 0;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item} hitSlop={6}>
            <View>
              <Icon size={23} color={selected ? colors.forest : design.ink3} sw={selected ? 2 : 1.7} />
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                { color: selected ? colors.forest : design.ink3, fontFamily: selected ? font.sansSemi : font.sansMed },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: design.paper,
    borderTopWidth: 1,
    borderTopColor: design.line,
    paddingTop: 9,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10.5 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontFamily: font.sansBold, fontSize: 9, color: colors.surface },
});
