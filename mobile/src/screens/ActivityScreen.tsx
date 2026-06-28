// Activity — the user's notification feed. Loads /notifications (DB history),
// then subscribes to the socket's `notification:new` for live push while open.
// Tap a row to mark it read; "Mark all" clears every unread in one call.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/endpoints';
import { errorMessage } from '../api/client';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import type { AppNotification } from '../api/types';
import { Loading } from '../components/ui';
import { timeAgo } from '../lib/format';
import { colors, spacing } from '../theme';

// Category tint for the leading accent dot.
function toneFor(type: string): string {
  switch (type) {
    case 'BID_ACCEPTED':
    case 'PAYMENT_RELEASED':
    case 'AUCTION_WON':
    case 'NEGOTIATION_DONE':
      return colors.sage;
    case 'BID_REJECTED':
      return colors.error;
    case 'NEW_BID':
    case 'BID_COUNTERED':
      return colors.ember;
    default: // DELIVERY_UPDATE, SHIPMENT_BOOKED, SHIPMENT_UPDATE, …
      return colors.info;
  }
}

export default function ActivityScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchNotifications();
      setItems(page.notifications);
    } catch (e) {
      setError(errorMessage(e, 'Could not load activity'));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Live push while the screen is open. Prepend new arrivals (dedupe by id).
  useEffect(() => {
    const socket = getSocket(user?.name);
    const onNew = (n: AppNotification) => {
      setItems((prev) => (n?.id && prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
      disconnectSocket();
    };
  }, [user?.name]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  async function onTap(n: AppNotification) {
    if (n.read) return;
    setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read: true } : p)));
    try {
      await markNotificationRead(n.id);
    } catch {
      // Non-fatal: a refresh will reconcile the read state with the server.
    }
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((p) => ({ ...p, read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  }

  if (loading) return <Loading label="Loading…" />;

  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Activity{unread > 0 ? ` · ${unread}` : ''}</Text>
        {unread > 0 ? (
          <Pressable onPress={onMarkAll} hitSlop={8}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(n, i) => n.id ?? `tmp-${i}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
        ListEmptyComponent={!error ? <Text style={styles.empty}>No activity yet.</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onTap(item)}
            style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressed && { opacity: 0.85 }]}
          >
            <View style={[styles.dot, { backgroundColor: toneFor(item.type) }, item.read && styles.dotRead]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  heading: { fontSize: 22, fontWeight: '800', color: colors.text },
  markAll: { fontSize: 13, fontWeight: '600', color: colors.ember },
  error: { color: colors.error, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  rowUnread: { borderColor: colors.border, backgroundColor: colors.surfaceHover },
  dot: { width: 9, height: 9, borderRadius: 999, marginTop: 5 },
  dotRead: { opacity: 0.3 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  titleUnread: { fontWeight: '800' },
  message: { fontSize: 13.5, color: colors.textSecondary, marginTop: 2, lineHeight: 19 },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
