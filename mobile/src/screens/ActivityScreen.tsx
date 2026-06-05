import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { incomingBids, myBids } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Bid } from '../api/types';
import { Badge, Card, Loading } from '../components/ui';
import { money, timeAgo, unitLabel } from '../lib/format';
import { colors, spacing } from '../theme';

export default function ActivityScreen() {
  const { user } = useAuth();
  const isFarmer = user?.role === 'FARMER';
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = isFarmer ? await incomingBids() : await myBids();
      setBids(data);
    } catch (e) {
      setError(errorMessage(e, 'Could not load activity'));
    }
  }, [isFarmer]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) return <Loading label="Loading…" />;

  return (
    <View style={styles.flex}>
      <Text style={styles.heading}>{isFarmer ? 'Incoming bids' : 'My bids'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={bids}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !error ? (
            <Text style={styles.empty}>
              {isFarmer ? 'No bids on your listings yet.' : 'You have no bids yet.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => <BidRow bid={item} />}
      />
    </View>
  );
}

function BidRow({ bid }: { bid: Bid }) {
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.crop} numberOfLines={1}>
          {bid.listing?.cropName ?? 'Listing'}
          {bid.listing?.cropVariety ? ` · ${bid.listing.cropVariety}` : ''}
        </Text>
        <Badge status={bid.status} />
      </View>
      <Text style={styles.amount}>
        {money(bid.bidPricePerUnit, bid.currency)}
        <Text style={styles.unit}>
          {' '}
          /{bid.listing ? unitLabel(bid.listing.unit) : 'unit'} · {bid.quantity} ·{' '}
          {money(bid.totalAmount, bid.currency)} total
        </Text>
      </Text>
      {bid.counterPrice != null ? (
        <Text style={styles.counter}>
          Counter offer: {money(bid.counterPrice, bid.currency)}
        </Text>
      ) : null}
      {bid.message ? <Text style={styles.message}>“{bid.message}”</Text> : null}
      <Text style={styles.time}>{timeAgo(bid.createdAt)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  list: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  card: { gap: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  crop: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  amount: { fontSize: 15, fontWeight: '700', color: colors.forest, marginTop: spacing.xs },
  unit: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  counter: { fontSize: 14, color: colors.info, fontWeight: '600' },
  message: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  time: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
