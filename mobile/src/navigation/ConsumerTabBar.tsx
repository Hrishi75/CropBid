// Custom bottom tab bar for the consumer app — lean 4-tab variant of
// BuyerTabBar (Home / Cart / Orders / You), no dark marketplace surface since
// there's no auction tab.
//
// Cart carries a count badge. That badge is this app's answer to the web
// header's basket chip (client/src/components/consumer/CartBar.tsx): a shopper
// looking for their basket looks at the tab bar on a phone and at the header on
// a desktop, so each surface puts it where the habit already is.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconBasket, IconDoc, IconHome, IconUser, IcoProps } from '../components/icons';
import { useCart } from '../context/CartContext';
import { colors, design, font } from '../theme';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Cart: IconBasket,
  Orders: IconDoc,
  You: IconUser,
};

export default function ConsumerTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { count } = useCart();

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: 'rgba(251,249,243,0.98)', borderTopColor: design.line },
      ]}
    >
      {state.routes.map((route, i) => {
        const sel = state.index === i;
        const Icon = ICONS[route.name] || IconHome;
        const label = descriptors[route.key].options.title ?? route.name;
        const badge = route.name === 'Cart' && count > 0 ? count : 0;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!sel && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item} hitSlop={6}>
            <View>
              <Icon size={23} stroke={sel ? colors.forest : design.ink3} sw={sel ? 2 : 1.7} />
              {badge > 0 ? (
                <View style={styles.badge}>
                  {/* Past nine the pill would stretch wider than the icon it sits
                      on; a household basket never gets there, but a stuck one
                      shouldn't wreck the row. */}
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color: sel ? colors.forest : design.ink3, fontFamily: sel ? font.sansSemi : font.sansMed }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  item: { alignItems: 'center', gap: 4, width: 60 },
  label: { fontSize: 10, letterSpacing: -0.1 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.sansBold, fontSize: 10, lineHeight: 13, color: colors.textInverse },
});
