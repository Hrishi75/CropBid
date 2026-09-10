// =============================================================================
// Analytics — the numbers behind a farmer's or a buyer's own trading
// =============================================================================
// The web has had /farmer/analytics and /buyer/analytics for a while; the phone
// had neither, which meant the one surface that answers "is any of this working
// for me" was desktop-only. For a farmer holding a phone in a field that is the
// wrong way round.
//
// ONE SCREEN, TWO SHAPES. GET /analytics dispatches on the caller's role and
// answers with a farmer payload or a buyer one, so this narrows the union once
// at the top and renders from there. It never merges the two: a farmer's
// revenue and a buyer's spend are different facts and putting them behind one
// optional field is how they end up on the wrong dashboard.
//
// CHARTS ARE DRAWN, NOT IMPORTED. Every series here is a list of labelled
// numbers, and a bar is a View with a width. A charting library would add a
// dependency, a bundle, and a native build step to draw rectangles, and it
// would still need this much layout code around it.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchAnalytics } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { isFarmerAnalytics, type Analytics, type ChartPoint } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { money } from '../lib/format';
import { Loading } from '../components/ui';
import { colors, spacing } from '../theme';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchAnalytics());
    } catch (e) {
      setError(errorMessage(e, 'Could not load your numbers.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: spacing.xl }]}>
        <Text style={styles.error}>{error ?? t('Nothing to show yet.')}</Text>
        <Text onPress={() => { setLoading(true); void load(); }} style={styles.retry}>
          {t('Try again')}
        </Text>
      </View>
    );
  }

  const currency = user?.currency ?? 'INR';

  return (
    <ScrollView
      style={styles.screen}
      // The stack header sits above this and already takes the notch, so the
      // inset is not added again here.
      contentContainerStyle={[styles.pad, { paddingTop: spacing.lg, paddingBottom: spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load(); }}
          tintColor={colors.forest}
        />
      }
    >
      {isFarmerAnalytics(data) ? (
        <>
          <View style={styles.kpiGrid}>
            <Kpi label={t('Earned')} value={money(data.summary.totalRevenue, currency)} wide />
            <Kpi label={t('Listings')} value={String(data.summary.totalListings)} />
            <Kpi label={t('Live now')} value={String(data.summary.activeListings)} />
            <Kpi label={t('Bids in')} value={String(data.summary.totalBids)} />
            <Kpi label={t('Accepted')} value={String(data.summary.acceptedBids)} />
            {/* Preformatted by the server, so it is printed rather than rounded
                again here. Rounding a rounded number is how 0.05 becomes 0.1. */}
            <Kpi label={t('Bids that closed')} value={`${data.summary.conversionRate}%`} />
            <Kpi label={t('Bids per listing')} value={data.summary.avgBidsPerListing} />
          </View>

          <Chart title={t('Earnings by month')} points={data.charts.monthlyRevenue} money currency={currency} />
          <Chart title={t('Bids by month')} points={data.charts.monthlyBids} />
          <Chart title={t('What you list')} points={data.charts.cropDistribution} />
          <Chart title={t('Listing status')} points={data.charts.listingStatuses} />
        </>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <Kpi label={t('Spent')} value={money(data.summary.totalSpent, currency)} wide />
            <Kpi label={t('Bids placed')} value={String(data.summary.totalBids)} />
            <Kpi label={t('Accepted')} value={String(data.summary.acceptedBids)} />
            <Kpi label={t('Deals closed')} value={String(data.summary.totalDeals)} />
            <Kpi label={t('Bids that won')} value={`${data.summary.successRate}%`} />
          </View>

          <Chart title={t('Spend by month')} points={data.charts.monthlySpending} money currency={currency} />
          <Chart title={t('Bids by month')} points={data.charts.monthlyBids} />
          <Chart title={t('What you buy')} points={data.charts.procurementMix} />
          <Chart title={t('Bid outcomes')} points={data.charts.bidStatuses} />
        </>
      )}
    </ScrollView>
  );
}

function Kpi({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.kpi, wide && styles.kpiWide]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, wide && styles.kpiValueWide]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A horizontal bar per point, scaled against the largest.
 *
 * Horizontal rather than vertical because the labels are words ("Groundnut",
 * "Sep 26") and a phone has width for a word beside a bar but not under one.
 *
 * An all-zero series is the common case for a new account, and dividing by its
 * max would be a divide by zero. It renders as empty tracks with their real
 * zeroes beside them, which is the honest picture: the months exist, nothing
 * happened in them.
 */
function Chart({
  title, points, money: asMoney, currency,
}: {
  title: string;
  points: ChartPoint[];
  money?: boolean;
  currency?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value));

  return (
    <View style={styles.chart}>
      <Text style={styles.chartTitle}>{title}</Text>
      {points.map((p) => (
        <View key={p.name} style={styles.row}>
          <Text style={styles.rowLabel} numberOfLines={1}>{p.name}</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: max > 0 ? `${(p.value / max) * 100}%` : 0 }]} />
          </View>
          <Text style={styles.rowValue} numberOfLines={1}>
            {asMoney ? money(p.value, currency) : p.value.toLocaleString('en-IN')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
  pad: { paddingHorizontal: spacing.lg },
  error: { fontSize: 14, color: colors.error, marginBottom: spacing.md },
  retry: { fontSize: 14, color: colors.forest, textDecorationLine: 'underline' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  kpiWide: { flexBasis: '100%' },
  kpiLabel: { fontSize: 11, color: colors.textMuted },
  kpiValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  kpiValueWide: { fontSize: 28 },

  chart: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  chartTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  rowLabel: { width: 78, fontSize: 11, color: colors.textSecondary },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHover, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.sage },
  rowValue: { minWidth: 62, textAlign: 'right', fontSize: 11, fontWeight: '600', color: colors.text },
});
