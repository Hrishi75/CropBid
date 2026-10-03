// =============================================================================
// ModeSwitch — Selling | Buying, for a shop that is approved to do both
// =============================================================================
// One account, two sides. A local shop sells to households, and once its buyer
// application is approved it can also buy stock for itself in the wholesale
// market. This control flips the whole app between the two: tabs, home and
// every request (AuthContext sets X-Act-As; the server checks the approval).
//
// Renders nothing for an account that cannot switch, so callers can drop it in
// without checking.
// =============================================================================

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { IconBasket, IconDoc } from './icons';
import { canSwitchToBuying, useAuth } from '../context/AuthContext';
import { colors, design, font } from '../theme';

export function ModeSwitch() {
  const { user, accountRole, mode, switchMode } = useAuth();
  // `user` may be the buying-mode view; the account itself is the seller.
  const real = user && accountRole ? { ...user, role: accountRole } : null;
  if (!canSwitchToBuying(real)) return null;

  return (
    <View style={styles.card}>
      <Mono style={styles.label}>YOU ARE</Mono>
      <View style={styles.track}>
        <Side on={mode === 'SELL'} label="Selling" sub="To households" Icon={IconDoc} onPress={() => switchMode('SELL')} />
        <Side on={mode === 'BUY'} label="Buying" sub="Stock for your shop" Icon={IconBasket} onPress={() => switchMode('BUY')} />
      </View>
    </View>
  );
}

function Side({
  on, label, sub, Icon, onPress,
}: {
  on: boolean;
  label: string;
  sub: string;
  Icon: typeof IconDoc;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={on ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.side, on && styles.sideOn]}
    >
      <Icon size={17} stroke={on ? colors.surface : colors.forest} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.sideLabel, on && styles.sideLabelOn]}>{label}</Text>
        <Text style={[styles.sideSub, on && styles.sideSubOn]} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 18, padding: 12, gap: 8,
  },
  label: { fontSize: 9, letterSpacing: 0.8, color: design.ink3, paddingHorizontal: 4 },
  track: { flexDirection: 'row', gap: 4, backgroundColor: design.paper2, borderRadius: 14, padding: 4 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 10 },
  sideOn: { backgroundColor: colors.forest },
  sideLabel: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  sideLabelOn: { color: colors.surface },
  sideSub: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 1 },
  sideSubOn: { color: design.leaf },
});
