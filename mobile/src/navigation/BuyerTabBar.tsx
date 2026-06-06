// Custom bottom tab bar for the buyer app — port of crop-bid <TabBar>.
// Goes dark while the Market tab is active to match the dark marketplace screen.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconAgent, IconDoc, IconHome, IconMarket, IconUser, IcoProps } from '../components/icons';
import { colors, design, font } from '../theme';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Market: IconMarket,
  Agents: IconAgent,
  Contracts: IconDoc,
  You: IconUser,
};

export default function BuyerTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index].name;
  const dark = activeName === 'Market';
  const idle = dark ? 'rgba(233,230,220,0.5)' : design.ink3;
  const on = dark ? '#f4f1ea' : colors.forest;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: dark ? 'rgba(20,26,16,0.97)' : 'rgba(251,249,243,0.98)',
          borderTopColor: dark ? 'rgba(255,255,255,0.08)' : design.line,
        },
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
            <Icon size={23} stroke={sel ? on : idle} sw={sel ? 2 : 1.7} />
            <Text style={[styles.label, { color: sel ? on : idle, fontFamily: sel ? font.sansSemi : font.sansMed }]}>{label}</Text>
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
