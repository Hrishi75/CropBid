// =============================================================================
// FloatingTabBar — the bottom tabs as a pill that floats off the screen edge
// =============================================================================
// A rounded bar inset from the sides and lifted off the bottom, with the
// current tab filled in. It reads as one control a thumb rests on rather than
// a strip welded to the bottom of the screen, and the filled tab says where you
// are without relying on a colour shift in a 23px icon alone.
//
// IT STAYS IN THE LAYOUT, NOT OVER IT. The bar's surround is painted the page
// colour instead of being absolutely positioned over the screen, so no screen
// has to know to pad its last row clear of it. A truly transparent overlay
// would mean every scrolling screen in three stacks adding the bar's height to
// its padding, and the first one that forgets hides its last button under it.
//
// Shared by the role tab bars, which differ only in their icons and badges.
// =============================================================================

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { IcoProps } from '../components/icons';
import { IconHome } from '../components/icons';
import { colors, design, font } from '../theme';

export function FloatingTabBar({
  state, descriptors, navigation, icons, badgeFor,
}: BottomTabBarProps & {
  icons: Record<string, React.ComponentType<IcoProps>>;
  /** A count to badge a tab with; 0 for none. */
  badgeFor?: (routeName: string) => number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom - 8, 10) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, i) => {
          const sel = state.index === i;
          const Icon = icons[route.name] || IconHome;
          const label = descriptors[route.key].options.title ?? route.name;
          const badge = badgeFor ? badgeFor(route.name) : 0;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!sel && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={badge > 0 ? `${label}, ${badge}` : label}
              style={({ pressed }) => [styles.item, sel && styles.itemOn, pressed && !sel && styles.itemPressed]}
            >
              <View>
                <Icon size={21} stroke={sel ? colors.surface : design.ink3} sw={sel ? 2 : 1.7} />
                {badge > 0 ? (
                  <View style={[styles.badge, sel && styles.badgeOn]}>
                    {/* Past nine the pill would stretch wider than the icon it
                        sits on; a household basket never gets there, but a
                        stuck one shouldn't wreck the row. */}
                    <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, sel ? styles.labelOn : null]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The page colour, so the gap around the pill reads as the screen carrying on.
  wrap: { backgroundColor: design.bg, paddingHorizontal: 14, paddingTop: 6 },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    backgroundColor: design.paper,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: design.line,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 20,
  },
  itemOn: { backgroundColor: colors.forest },
  itemPressed: { backgroundColor: design.paper2 },
  label: { fontFamily: font.sansMed, fontSize: 10.5, letterSpacing: -0.1, color: design.ink3 },
  labelOn: { fontFamily: font.sansSemi, color: colors.surface },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.ember,
    borderWidth: 2,
    borderColor: design.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { borderColor: colors.forest },
  badgeText: { fontFamily: font.sansBold, fontSize: 9.5, lineHeight: 12, color: colors.textInverse },
});
