// =============================================================================
// ExportFilters — what makes a lot worth an exporter's time, on the market
// =============================================================================
// An exporter filling a container has no use for a 40 kg lot or a Grade C one,
// so the market lets them say so: Grade A only, organic only, and a smallest
// lot size in quintals. The filters go to the server (GET /browse with
// quality, organic, minQuintals), not over the page already on the phone,
// because the market loads one page and a filter over that would hide every
// matching lot on the next.
//
// Grade A and 10+ quintals are on when an exporter arrives, and they are chips
// on screen, so what is being hidden is never a secret. The count under the
// row is the server's total for these filters, not the page length.
// =============================================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { colors, design, font } from '../theme';

export interface ExportFilter {
  gradeA: boolean;
  organic: boolean;
  /** Smallest lot shown, in quintals. 0 is no floor. */
  minQuintals: number;
}

export const EXPORT_DEFAULT: ExportFilter = { gradeA: true, organic: false, minQuintals: 10 };

/** The floors offered, in quintals. */
const SIZES = [0, 10, 50, 100];

export const isFiltering = (f: ExportFilter) => f.gradeA || f.organic || f.minQuintals > 0;

export function ExportFilters({
  value, onChange, total,
}: {
  value: ExportFilter;
  onChange: (next: ExportFilter) => void;
  /** Lots matching, from the server. null while loading. */
  total: number | null;
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Mono style={styles.label}>EXPORT-READY</Mono>
        <Toggle label="Grade A" on={value.gradeA} onPress={() => onChange({ ...value, gradeA: !value.gradeA })} />
        <Toggle label="Organic" on={value.organic} onPress={() => onChange({ ...value, organic: !value.organic })} />
        <View style={styles.sizes}>
          {SIZES.map((q) => (
            <PressScale
              key={q}
              onPress={() => onChange({ ...value, minQuintals: q })}
              scaleTo={0.94}
              cardStyle={[styles.size, value.minQuintals === q && styles.sizeOn]}
            >
              <Text style={[styles.sizeText, value.minQuintals === q && styles.sizeTextOn]}>
                {q === 0 ? 'Any size' : `${q}+ qtl`}
              </Text>
            </PressScale>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.count}>
        {total == null ? ' ' : `${total.toLocaleString('en-IN')} ${total === 1 ? 'lot matches' : 'lots match'}`}
      </Text>
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.94} cardStyle={[styles.toggle, on && styles.toggleOn]}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{on ? `✓ ${label}` : label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  label: { fontSize: 9.5, letterSpacing: 0.8, color: design.ink3, marginRight: 2 },
  toggle: {
    borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  toggleOn: { backgroundColor: design.mint, borderColor: colors.sage },
  toggleText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  toggleTextOn: { color: colors.forest, fontFamily: font.sansSemi },
  // One segmented track, because the sizes are alternatives, not toggles.
  sizes: { flexDirection: 'row', gap: 2, backgroundColor: design.paper2, borderRadius: 999, padding: 3 },
  size: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sizeOn: { backgroundColor: colors.forest },
  sizeText: { fontFamily: font.sansMed, fontSize: 12, color: design.ink2 },
  sizeTextOn: { color: colors.surface },
  count: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, paddingHorizontal: 16, marginTop: 6 },
});
