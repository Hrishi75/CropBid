// =============================================================================
// NearbyFilter — where a small buyer's market reaches
// =============================================================================
// A small business buys a few quintals and cannot pay to freight them across
// India, so its market starts at its own state, with its city one tap closer
// and all of India one tap further. The filter runs on the server (GET /browse
// with location or state), and the count under it is the server's total.
//
// The state is the shop's own (farmerProfile.state) when the account sells,
// otherwise worked out by the caller from lots in the buyer's city. Without
// one, the choice is city or all India.
// =============================================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { colors, design, font } from '../theme';

export type Reach = 'city' | 'state' | 'all';

export function NearbyFilter({
  value, onChange, city, state, total,
}: {
  value: Reach;
  onChange: (r: Reach) => void;
  city: string;
  state: string | null;
  total: number | null;
}) {
  const opts: Array<{ v: Reach; label: string }> = [
    ...(city ? [{ v: 'city' as const, label: city }] : []),
    ...(state ? [{ v: 'state' as const, label: state }] : []),
    { v: 'all', label: 'All India' },
  ];
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Mono style={styles.label}>BUY FROM</Mono>
        <View style={styles.track}>
          {opts.map((o) => (
            <PressScale key={o.v} onPress={() => onChange(o.v)} scaleTo={0.94} cardStyle={[styles.seg, value === o.v && styles.segOn]}>
              <Text style={[styles.segText, value === o.v && styles.segTextOn]}>{o.label}</Text>
            </PressScale>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.count}>
        {total == null ? ' ' : `${total.toLocaleString('en-IN')} ${total === 1 ? 'lot' : 'lots'} · bid on as little as you need`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  label: { fontSize: 9.5, letterSpacing: 0.8, color: design.ink3 },
  track: { flexDirection: 'row', gap: 2, backgroundColor: design.paper2, borderRadius: 999, padding: 3 },
  seg: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  segOn: { backgroundColor: colors.forest },
  segText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  segTextOn: { color: colors.surface },
  count: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, paddingHorizontal: 16, marginTop: 6 },
});
