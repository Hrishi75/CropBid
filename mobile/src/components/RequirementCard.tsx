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
import { cropEmojiFor } from '../utils/cropImages';
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

function Metric({
  label, value, sub, urgent,
}: { label: string; value: string; sub?: string; urgent?: boolean }) {
  return (
    <View style={styles.metric}>
      <Mono style={styles.metricLabel}>{label}</Mono>
      <Text style={[styles.metricValue, urgent && styles.metricUrgent]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
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

  // "in 5 days" reads faster than a date when deciding whether you can make
  // it; the date stays underneath for anyone planning a truck.
  const daysLeft = r.neededBy
    ? Math.ceil((new Date(r.neededBy).getTime() - Date.now()) / 86400000)
    : null;
  const dueLabel = daysLeft == null
    ? null
    : daysLeft < 0 ? 'Past due' : daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`;

  const body = (
    <>
      <View style={styles.head}>
        <View style={styles.cropTile}>
          <Text style={styles.cropEmoji}>{cropEmojiFor(r.cropName)}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.crop} numberOfLines={1}>
            {r.cropName}{r.cropVariety ? ` · ${r.cropVariety}` : ''}
          </Text>
          <View style={styles.headMeta}>
            <Mono style={[styles.status, { color: status.color }]}>● {status.label}</Mono>
            <Mono style={styles.ref}>#{r.id.slice(-6).toUpperCase()}</Mono>
          </View>
        </View>
        {/* The buyer's price is the number the farmer decides on, so it is
            the biggest thing on the card. */}
        <View style={styles.priceBox}>
          <Text style={styles.price}>{money(r.pricePerUnit, r.currency)}</Text>
          <Mono style={styles.priceUnit}>PER {unit.toUpperCase()}</Mono>
        </View>
      </View>

      <View style={styles.chips}>
        {company ? <Chip text={company} /> : null}
        <Chip text={`Grade ${r.qualityGrade}`} />
        {r.organic ? <Chip text="Organic only" tone="sage" /> : null}
        {belowMsp ? <Chip text={`Below MSP ${money(msp!, r.currency)}`} tone="ember" /> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="STILL NEEDED" value={`${r.remainingQuantity.toLocaleString('en-IN')} ${unit}`} />
        <Metric label="DELIVER TO" value={r.deliveryLocation} sub={r.deliveryState} />
        {r.neededBy ? (
          <Metric
            label="NEEDED BY"
            value={dueLabel ?? ''}
            sub={new Date(r.neededBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            urgent={daysLeft != null && daysLeft <= 3}
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

      {r.description ? (
        <View style={styles.desc}>
          <Text style={styles.descText}>{r.description}</Text>
        </View>
      ) : null}

      {r.buyer ? (
        <Text style={styles.who} numberOfLines={1}>
          {r.buyer.buyerProfile?.companyName || r.buyer.name}
          {r.buyer.buyerProfile?.verified ? ' · verified' : ''}
          {r.buyer.trustScore != null ? ` · trust ${Math.round(r.buyer.trustScore)}` : ''}
        </Text>
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropTile: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  cropEmoji: { fontSize: 24 },
  headText: { flex: 1, minWidth: 0 },
  crop: { fontFamily: font.sansBold, fontSize: 16, letterSpacing: -0.2, color: design.ink },
  headMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  ref: { fontSize: 9.5, letterSpacing: 0.5, color: design.ink3 },
  status: { fontSize: 9.5, letterSpacing: 0.6 },
  priceBox: { alignItems: 'flex-end' },
  price: { fontFamily: font.sansBold, fontSize: 18, letterSpacing: -0.4, color: colors.forest },
  priceUnit: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3, marginTop: 1 },

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

  metrics: {
    flexDirection: 'row', gap: 10,
    backgroundColor: design.bg, borderRadius: 12, padding: 12,
  },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  metricValue: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 3 },
  metricUrgent: { color: colors.ember },
  metricSub: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 1 },

  progressText: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginBottom: 5 },
  track: { height: 5, borderRadius: 999, backgroundColor: design.paper2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.sage },

  who: { fontFamily: font.sans, fontSize: 12, color: design.ink3 },
  desc: { borderLeftWidth: 2, borderLeftColor: design.mint, paddingLeft: 10 },
  descText: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2 },
});
