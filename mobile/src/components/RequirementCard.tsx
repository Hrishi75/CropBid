// =============================================================================
// RequirementCard — one buyer requirement, with a fill-progress bar
// =============================================================================
// Used by the demand board, the farmer's offers list and the buyer's own
// requirements, so it takes no role prop: the caller supplies whatever actions
// belong on it as children.
//
// The progress bar is the point of the card. A requirement is rarely all-or-
// nothing — it gets filled in pieces — so "300 of 500 qtl still needed" is the
// number a farmer actually decides on.
//
// WHEN THE BUYER IS MISSING, THAT IS NOT AN ERROR. The server strips a
// competitor's identity from rows it serves to another buyer: volume, price and
// business type stay, because that is the market signal, but the name attached
// to them would be competitive intelligence. So the identity line simply does
// not render, and nothing here treats it as missing data.
//
// Mirrors client/src/components/requirements/RequirementCard.tsx.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { money, unitLabel } from '../lib/format';
import { mspForCrop } from '../lib/msp';
import { companyTypeLabel } from '../lib/companyType';
import type { BuyerRequirement, RequirementStatus } from '../api/types';
import { colors, design, font } from '../theme';

const STATUS_META: Record<RequirementStatus, { label: string; color: string }> = {
  OPEN: { label: 'OPEN', color: colors.sage },
  FULFILLED: { label: 'FILLED', color: colors.forest },
  CLOSED: { label: 'CLOSED', color: design.ink3 },
  EXPIRED: { label: 'EXPIRED', color: design.ink3 },
};

function Chip({ text, tone }: { text: string; tone?: 'sage' | 'ember' }) {
  return (
    <View
      style={[
        styles.chip,
        tone === 'sage' && styles.chipSage,
        tone === 'ember' && styles.chipEmber,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          tone === 'sage' && styles.chipTextSage,
          tone === 'ember' && styles.chipTextEmber,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Mono style={styles.metricLabel}>{label}</Mono>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function RequirementCard({
  requirement: r,
  onPress,
  showMspWarning,
  children,
}: {
  requirement: BuyerRequirement;
  onPress?: () => void;
  /**
   * Flags a posted price below the government support price. Only meaningful on
   * a farmer's feed — a buyer gets the same warning at post time, as a confirm.
   */
  showMspWarning?: boolean;
  children?: React.ReactNode;
}) {
  const status = STATUS_META[r.status] ?? { label: r.status, color: design.ink3 };
  const unit = unitLabel(r.unit);
  const filled = r.quantity - r.remainingQuantity;
  const pct = r.quantity > 0 ? Math.min(100, (filled / r.quantity) * 100) : 0;

  const msp = showMspWarning ? mspForCrop(r.cropName, r.unit) : null;
  const belowMsp = msp != null && r.currency.toUpperCase() === 'INR' && r.pricePerUnit < msp;

  const company = companyTypeLabel(r.buyer?.buyerProfile?.companyType);

  const body = (
    <>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Mono style={styles.ref}>#{r.id.slice(-6).toUpperCase()}</Mono>
          <Text style={styles.crop} numberOfLines={1}>
            {r.cropName}{r.cropVariety ? ` · ${r.cropVariety}` : ''}
          </Text>
        </View>
        <Mono style={[styles.status, { color: status.color }]}>● {status.label}</Mono>
      </View>

      <View style={styles.chips}>
        {company ? <Chip text={company} /> : null}
        <Chip text={`Grade ${r.qualityGrade}`} />
        {r.organic ? <Chip text="Organic only" tone="sage" /> : null}
        {belowMsp ? <Chip text={`Below MSP ${money(msp!, r.currency)}`} tone="ember" /> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="WANTS" value={`${money(r.pricePerUnit, r.currency)}/${unit}`} />
        <Metric label="STILL NEEDED" value={`${r.remainingQuantity.toLocaleString('en-IN')} ${unit}`} />
        <Metric label="DELIVER TO" value={`${r.deliveryLocation}, ${r.deliveryState}`} />
        {r.neededBy ? (
          <Metric
            label="NEEDED BY"
            value={new Date(r.neededBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          />
        ) : null}
      </View>

      {/* Only worth drawing once something has actually been filled. */}
      {filled > 0 ? (
        <View>
          <Text style={styles.progressText}>
            {filled.toLocaleString('en-IN')} of {r.quantity.toLocaleString('en-IN')} {unit} filled
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </View>
      ) : null}

      {r.buyer ? (
        <Text style={styles.who} numberOfLines={1}>
          {r.buyer.buyerProfile?.companyName || r.buyer.name}
          {r.buyer.buyerProfile?.verified ? ' · verified' : ''}
          {r.buyer.trustScore != null ? ` · trust ${Math.round(r.buyer.trustScore)}` : ''}
        </Text>
      ) : null}

      {r.description ? (
        <View style={styles.desc}>
          <Text style={styles.descText}>{r.description}</Text>
        </View>
      ) : null}

      {children}
    </>
  );

  // Pressable only when the caller has somewhere to send it. A card carrying
  // its own action panel must not also swallow taps meant for the panel.
  return onPress ? (
    <PressScale onPress={onPress} scaleTo={0.99} cardStyle={styles.card}>{body}</PressScale>
  ) : (
    <View style={styles.card}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
    gap: 11,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  ref: { fontSize: 10, letterSpacing: 0.5, color: design.ink3 },
  crop: { flex: 1, fontFamily: font.sansSemi, fontSize: 15.5, color: design.ink },
  status: { fontSize: 10, letterSpacing: 0.6 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: design.paper2,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipSage: { backgroundColor: design.mint },
  chipEmber: { backgroundColor: 'rgba(200,96,43,0.12)' },
  chipText: { fontFamily: font.sansMed, fontSize: 11, color: design.ink2 },
  chipTextSage: { color: colors.forest },
  chipTextEmber: { color: colors.ember },

  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metric: { minWidth: 92 },
  metricLabel: { fontSize: 9.5, letterSpacing: 0.6, color: design.ink3 },
  metricValue: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 2 },

  progressText: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginBottom: 5 },
  track: { height: 4, borderRadius: 999, backgroundColor: design.paper2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.sage },

  who: { fontFamily: font.sans, fontSize: 12, color: design.ink3 },
  desc: { backgroundColor: design.paper2, borderRadius: 8, padding: 10 },
  descText: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2 },
});
