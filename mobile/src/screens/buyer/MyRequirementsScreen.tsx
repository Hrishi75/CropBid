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
// Laid out like Contracts: one scroll, a summary strip, filters with counts,
// and the requests with offers waiting first, each saying so in a line that
// opens it. Everything is fetched once and filtered here, so the counts on the
// filters are real for every tab at once.
//
// Mirrors client/src/pages/buyer/MyRequirements.tsx.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono } from '../../components/buyerKit';
import { Appear, PressScale } from '../../components/motion';
import { IconArrowLeft, IconChevR, IconPlus } from '../../components/icons';
import { RequirementCard } from '../../components/RequirementCard';
import { myRequirements } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { BuyerRequirement, RequirementStatus } from '../../api/types';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';

const TABS: Array<{ value: RequirementStatus | ''; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FULFILLED', label: 'Filled' },
  { value: 'CLOSED', label: 'Withdrawn' },
  { value: '', label: 'All' },
];

export default function MyRequirementsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const isRestaurant = user?.buyerProfile?.companyType === 'RESTAURANT';
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<BuyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RequirementStatus | ''>('OPEN');

  const load = useCallback(async () => {
    try {
      // The server's largest page. Past 50 requests the counts would be of the
      // newest 50, which is a limit worth paging past when a buyer reaches it.
      const data = await myRequirements(undefined, 50);
      setRows(data.requirements);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your requirements'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fires on mount AND on every return to the screen. Posting or withdrawing
  // happens elsewhere and then comes back here, so a plain mount effect would
  // leave the list showing the state from before.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const offersOf = (r: BuyerRequirement) => r._count?.offers ?? 0;
  const count = (v: RequirementStatus | '') => (v ? rows.filter((r) => r.status === v).length : rows.length);
  // Requests with offers waiting first, then newest.
  const shown = rows
    .filter((r) => !tab || r.status === tab)
    .sort((a, b) => Number(offersOf(b) > 0) - Number(offersOf(a) > 0) || b.createdAt.localeCompare(a.createdAt));
  const open = rows.filter((r) => r.status === 'OPEN');
  const waiting = open.reduce((n, r) => n + offersOf(r), 0);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.head}>
          {/* A tab has nowhere to go back to; pushed from the profile it does. */}
          {nav.getState()?.type !== 'tab' && nav.canGoBack() ? (
            <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityLabel="Back" style={styles.back}>
              <IconArrowLeft size={19} stroke={design.ink} />
            </Pressable>
          ) : null}
          <View style={styles.titleRow}>
            <Text style={styles.title}>Requests</Text>
            <PressScale onPress={() => nav.navigate('CreateRequirement')} scaleTo={0.95} cardStyle={styles.postBtn}>
              <IconPlus size={15} stroke={colors.textInverse} />
              <Text style={styles.postBtnText}>Post</Text>
            </PressScale>
          </View>
          <Text style={styles.lede}>
            {isRestaurant
              ? 'What your kitchen needs. Sellers send their price; you accept, counter or decline.'
              : 'What you have asked for. Sellers fill it at your price, or offer theirs.'}
          </Text>

          {rows.length > 0 ? (
            <View style={styles.summary}>
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>OPEN</Mono>
                <Text style={styles.sumVal}>{open.length}</Text>
              </View>
              <View style={styles.sumDivider} />
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>OFFERS WAITING</Mono>
                <Text style={[styles.sumVal, waiting > 0 && styles.sumHot]}>{waiting}</Text>
              </View>
              <View style={styles.sumDivider} />
              <View style={styles.sumCell}>
                <Mono style={styles.sumLabel}>FILLED</Mono>
                <Text style={styles.sumVal}>{count('FULFILLED')}</Text>
              </View>
            </View>
          ) : null}

          {rows.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsPad}>
              {TABS.map((t) => {
                const on = tab === t.value;
                return (
                  <Pressable key={t.label} onPress={() => setTab(t.value)} style={[styles.tab, on && styles.tabOn]}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                    <Text style={[styles.tabCount, on && styles.tabCountOn]}>{count(t.value)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.body}>
          {!loading && shown.length === 0 && !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>
                {rows.length === 0 ? 'Nothing asked for yet' : tab === 'OPEN' ? 'Nothing open right now' : 'Nothing here'}
              </Text>
              <Text style={styles.emptyBody}>
                Say what you need, how much of it and what you will pay. Sellers who can supply it
                are notified.
              </Text>
              {rows.length === 0 ? (
                <PressScale onPress={() => nav.navigate('CreateRequirement')} cardStyle={styles.emptyBtn}>
                  <Text style={styles.postBtnText}>Post your first request</Text>
                </PressScale>
              ) : null}
            </View>
          ) : null}

          {shown.map((r, i) => {
            const offers = offersOf(r);
            const go = () => nav.navigate('RequirementDetail', { id: r.id, preview: r });
            return (
              <Appear key={r.id} index={i}>
                <RequirementCard requirement={r} onPress={go}>
                  {offers > 0 ? (
                    <Pressable onPress={go} style={styles.nudge}>
                      <View style={styles.nudgeDot} />
                      <Text style={styles.nudgeText}>
                        {offers} {offers === 1 ? 'offer' : 'offers'} waiting · review
                      </Text>
                      <IconChevR size={11} stroke={colors.ember} />
                    </Pressable>
                  ) : r.status === 'OPEN' ? (
                    <Text style={styles.noOffers}>No offers yet. Sellers who can supply it have been told.</Text>
                  ) : null}
                </RequirementCard>
              </Appear>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: { paddingHorizontal: 16, paddingBottom: 6 },
  back: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  title: { fontFamily: font.sansBold, fontSize: 26, letterSpacing: -0.6, color: design.ink },
  lede: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink3, marginTop: 3 },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.forest, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
  },
  postBtnText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.textInverse },

  summary: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14,
    backgroundColor: colors.forest, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14,
  },
  sumCell: { flex: 1, minWidth: 0 },
  sumLabel: { fontSize: 8.5, letterSpacing: 0.7, color: 'rgba(244,241,234,0.6)' },
  sumVal: { fontFamily: font.sansBold, fontSize: 17, letterSpacing: -0.3, color: colors.textInverse, marginTop: 2 },
  sumHot: { color: '#f0a36f' },
  sumDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(244,241,234,0.14)', marginHorizontal: 10 },

  tabsPad: { gap: 8, paddingTop: 14, paddingBottom: 6 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  tabOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  tabText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  tabTextOn: { color: colors.textInverse },
  tabCount: { fontFamily: font.monoMed, fontSize: 11, color: design.ink3 },
  tabCountOn: { color: design.leaf },

  body: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(200,96,43,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  },
  nudgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ember },
  nudgeText: { flex: 1, fontFamily: font.sansSemi, fontSize: 13, color: colors.ember },
  noOffers: { fontFamily: font.sans, fontSize: 12, color: design.ink3 },

  error: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.error, paddingHorizontal: 16 },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 16, color: design.ink, textAlign: 'center' },
  emptyBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, textAlign: 'center' },
  emptyBtn: { marginTop: 10, backgroundColor: colors.forest, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12 },
});
