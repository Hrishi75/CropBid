// =============================================================================
// MyRequirementsScreen — the demand this buyer has posted
// =============================================================================
// The buyer's side of the board: what they asked for, how much of it farmers
// have filled, and how many offers are sitting unanswered.
//
// The offer count here is NOT the same number the board shows. On the feed
// _count.offers counts every offer ever made; on /requirements/my it counts
// only PENDING ones — because that is the number the buyer has to act on, and
// a badge that included rejections would never go down.
//
// Mirrors client/src/pages/buyer/MyRequirements.tsx.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eyebrow, Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { RequirementCard } from '../../components/RequirementCard';
import { myRequirements } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { BuyerRequirement, RequirementStatus } from '../../api/types';
import { colors, design, font } from '../../theme';

const TABS: Array<{ value: RequirementStatus | ''; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FULFILLED', label: 'Filled' },
  { value: 'CLOSED', label: 'Withdrawn' },
  { value: '', label: 'All' },
];

export default function MyRequirementsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<BuyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RequirementStatus | ''>('OPEN');

  const load = useCallback(async () => {
    try {
      const data = await myRequirements(tab || undefined);
      setRows(data.requirements);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your requirements'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // Fires on mount AND on every return to the screen. Posting or withdrawing
  // happens elsewhere and then comes back here, so a plain mount effect would
  // leave the list showing the state from before.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <Eyebrow>YOUR DEMAND</Eyebrow>
        <Text style={styles.title}>What you have asked for.</Text>
        <Text style={styles.lede}>
          Post what you need and farmers come to you — at your price, or with a counter.
        </Text>
        <PressScale onPress={() => nav.navigate('CreateRequirement')} cardStyle={styles.postBtn}>
          <Text style={styles.postBtnText}>Post a requirement</Text>
        </PressScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsPad}>
          {TABS.map((t) => {
            const on = tab === t.value;
            return (
              <Pressable key={t.label} onPress={() => setTab(t.value)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && rows.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>
              {tab === 'OPEN' ? 'Nothing open right now' : 'Nothing here'}
            </Text>
            <Text style={styles.emptyBody}>
              Say what you need, how much of it and what you will pay. Farmers who can supply it
              are notified.
            </Text>
          </View>
        ) : null}

        {rows.map((r) => (
          <RequirementCard
            key={r.id}
            requirement={r}
            onPress={() => nav.navigate('RequirementDetail', { id: r.id, preview: r })}
          >
            {r._count && r._count.offers > 0 ? (
              <Mono style={styles.pending}>
                {r._count.offers} {r._count.offers === 1 ? 'OFFER' : 'OFFERS'} AWAITING YOU
              </Mono>
            ) : null}
          </RequirementCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: design.bg,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
  },
  title: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.5, color: design.ink, marginTop: 6 },
  lede: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 4 },
  postBtn: {
    marginTop: 12,
    backgroundColor: colors.forest,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  postBtnText: { fontFamily: font.sansBold, fontSize: 14, color: colors.textInverse },

  body: { padding: 14, gap: 12, paddingBottom: 32 },
  tabsPad: { gap: 7, paddingRight: 14 },
  tab: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tabOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  tabText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  tabTextOn: { color: colors.textInverse },

  pending: { fontSize: 10, letterSpacing: 0.6, color: colors.ember },

  error: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.error },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 16, color: design.ink, textAlign: 'center' },
  emptyBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, textAlign: 'center' },
});
