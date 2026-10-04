// =============================================================================
// ExportTerms — what an export request asks of the seller
// =============================================================================
// Shown on the request's own page, to the seller deciding whether to answer it
// and to the exporter who posted it: the port, the driest it may be, how it is
// packed, and the documents to hand over. Renders nothing for a request that
// is not for export, so callers can drop it in without checking.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import type { BuyerRequirement } from '../api/types';
import { docLabel, portName, useExportOptions } from '../lib/exportOptions';
import { colors, design, font } from '../theme';

export function ExportTerms({ r }: { r: BuyerRequirement }) {
  const opts = useExportOptions(!!r.forExport);
  if (!r.forExport) return null;
  const docs = r.requiredDocs ?? [];

  return (
    <View style={styles.card}>
      <Mono style={styles.kicker}>FOR EXPORT</Mono>
      <Row label="Deliver to" value={`${portName(opts, r.exportPort)} port · ${r.deliveryLocation}, ${r.deliveryState}`} />
      {r.maxMoisturePct != null ? <Row label="Moisture" value={`${r.maxMoisturePct}% at most`} /> : null}
      {r.packing ? <Row label="Packing" value={r.packing} /> : null}
      <View style={styles.row}>
        <Text style={styles.label}>Documents</Text>
        <View style={{ flex: 1, gap: 4 }}>
          {docs.length === 0 ? (
            <Text style={styles.value}>None asked for</Text>
          ) : (
            docs.map((d) => <Text key={d} style={styles.value}>✓ {docLabel(opts, d)}</Text>)
          )}
        </View>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.mint, borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: 'rgba(77,102,56,0.25)',
  },
  kicker: { fontSize: 10, letterSpacing: 0.9, color: colors.forest },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { width: 86, fontFamily: font.sans, fontSize: 13, color: design.ink3 },
  value: { fontFamily: font.sansMed, fontSize: 13.5, color: design.ink },
});
