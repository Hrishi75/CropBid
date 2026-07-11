// Custom bottom tab bar for the consumer app — lean 3-tab variant of BuyerTabBar
// (Home / Orders / You), no dark marketplace surface since there's no auction tab.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconDoc, IconHome, IconUser, IcoProps } from '../components/icons';
import { colors, design, font } from '../theme';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Orders: IconDoc,
  You: IconUser,
};

export default function ConsumerTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!sel && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item} hitSlop={6}>
            <Icon size={23} stroke={sel ? colors.forest : design.ink3} sw={sel ? 2 : 1.7} />
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
});
