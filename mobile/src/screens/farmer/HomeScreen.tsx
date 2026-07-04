// Farmer app · Home / dashboard — wired to live API data. KPIs from
// /listings/my (active lots), /bids/incoming (pending), /transactions/stats
// (season earnings); agent strip from /agent/config. Quick actions jump to
// listing creation, the bids queue, and contracts.
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Wordmark, MARKS } from '../../components/marks';
import { IconArrow, IconBell } from '../../components/icons';
import { Eyebrow, GridBg, LiveDot, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getAgentConfig, incomingBids, myListings, transactionStats, unreadNotificationCount } from '../../api/endpoints';
import type { AgentConfig, Bid, Listing, TransactionStats } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';

export default function FarmerHomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user } = useAuth();

  const [listings, setListings] = useState<Listing[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [l, b, s, a, u] = await Promise.allSettled([
      myListings(),
      incomingBids(),
      transactionStats(),
      getAgentConfig(),
      unreadNotificationCount(),
    ]);
    if (l.status === 'fulfilled') setListings(l.value.listings ?? []);
    if (b.status === 'fulfilled') setBids(Array.isArray(b.value) ? b.value : []);
    if (s.status === 'fulfilled') setStats(s.value);
    if (a.status === 'fulfilled') setAgent(a.value);
    if (u.status === 'fulfilled') setUnread(u.value);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const currency = user?.currency || 'INR';
  const firstName = user?.name?.split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeLots = listings.filter((l) => l.status === 'ACTIVE').length;
  const pending = bids.filter((b) => b.status === 'PENDING');
  const needsYou = pending.length;
  const topBid = pending[0] ?? null;
  const unit = unitLabel(topBid?.listing?.unit ?? '');

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {/* header */}
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <Wordmark size={17} glyph="arc" />
            <Pressable onPress={() => nav.navigate('Notifications')}>
              <IconBell size={22} stroke={design.ink2} />
              {unread > 0 ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
            <Text style={styles.h1}>
              {activeLots > 0 ? `${activeLots} ${activeLots === 1 ? 'crop' : 'crops'} on sale,` : 'No crops on sale,'}{'\n'}
              <Text style={styles.h1Serif}>{needsYou > 0 ? `${needsYou} ${needsYou === 1 ? 'offer is' : 'offers are'} waiting.` : 'no offers yet.'}</Text>
            </Text>
          </View>
        </View>

        {/* portfolio card */}
        <View style={styles.sidePad}>
          <Pressable style={styles.portfolio} onPress={() => nav.navigate('Contracts')}>
            <GridBg opacity={0.12} />
            <View>
              <View style={styles.rowBetweenTop}>
                <View>
                  <Mono style={styles.portfolioLabel}>MONEY YOU HAVE EARNED</Mono>
                  <Text style={styles.portfolioValue}>{money(stats?.totalRevenue ?? 0, currency)}</Text>
                </View>
                <View style={styles.benchRow}>
                  <IconArrow size={11} stroke={design.leaf} />
                  <Mono style={styles.benchText}> {stats?.released ?? 0} paid out</Mono>
                </View>
              </View>
              <View style={styles.statsRow}>
                {[
                  [String(activeLots), 'crops on sale'],
                  [String(stats?.inEscrow ?? 0), 'payments coming'],
                  [String(needsYou), 'offers waiting'],
                ].map(([n, l]) => (
                  <View key={l} style={{ flex: 1 }}>
                    <Text style={styles.statN}>{n}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
        </View>

        {/* needs your decision */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>Waiting for your reply</Eyebrow>
          {needsYou > 0 ? (
            <View style={styles.liveRow}>
              <LiveDot size={6} />
              <Mono style={styles.liveText}> {needsYou} waiting</Mono>
            </View>
          ) : null}
        </View>
        <View style={styles.sidePad}>
          {topBid ? (
            <View style={styles.actionCard}>
              <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'center' }]}>
                <StatusPill tone="ember" dot>New offer</StatusPill>
                <Mono style={styles.muted12}>{timeAgo(topBid.createdAt)}</Mono>
              </View>
              <Text style={styles.cardTitle}>
                {topBid.listing?.cropName ?? 'Listing'}{topBid.listing?.cropVariety ? ` · ${topBid.listing.cropVariety}` : ''}
              </Text>
              <Text style={styles.cardSub}>
                {topBid.buyer?.name ?? 'A buyer'} offers {money(topBid.bidPricePerUnit, topBid.currency)}/{unit} for {topBid.quantity.toLocaleString('en-IN')} {unit}
              </Text>
              <View style={styles.actionBtns}>
                <Pressable style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]} onPress={() => nav.navigate('Bids')}>
                  <Text style={styles.btnPrimaryText}>See offer &amp; reply </Text>
                  <IconArrow size={13} stroke={colors.textInverse} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No offers right now. Put a crop on sale and buyers will send offers here.</Text>
            </View>
          )}
        </View>

        {/* agent strip */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Your AI helper</Eyebrow>
          <Pressable onPress={() => nav.navigate('Agent')}>
            <Text style={styles.manage}>Open</Text>
          </Pressable>
        </View>
        <View style={styles.sidePad}>
          {agent ? (
            <Pressable style={styles.agentRow} onPress={() => nav.navigate('Agent')}>
              <View style={styles.agentIcon}>
                {(() => {
                  const Mark = MARKS['sprout'];
                  return <Mark size={22} color={colors.forest} accent={colors.ember} />;
                })()}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.agentName}>Answers offers for you</Text>
                <Text style={styles.agentCrop} numberOfLines={1}>
                  {agent.preferredCrops.length > 0 ? agent.preferredCrops.join(' · ') : 'Works on all your crops'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <StatusPill tone={agent.active ? 'sage' : 'paper'}>{agent.active ? 'working' : 'paused'}</StatusPill>
                <Mono style={styles.agentLots}>{agent.minPrice != null ? `min ${money(agent.minPrice, currency)}` : 'no min price set'}</Mono>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Turn on your AI helper — it replies to offers for you, even while you're in the field.</Text>
            </View>
          )}
        </View>

        {/* quick actions */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Quick</Eyebrow>
        </View>
        <View style={[styles.sidePad, styles.quickRow]}>
          <Pressable style={({ pressed }) => [styles.quickPrimary, pressed && styles.pressed]} onPress={() => nav.navigate('CreateListing')}>
            <Text style={styles.quickPrimaryText}>Sell a crop </Text>
            <IconArrow size={13} stroke="#f4f1ea" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.quickGhost, pressed && styles.pressed]} onPress={() => nav.navigate('Bids')}>
            <Text style={styles.quickGhostText}>See offers</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingBottom: 14 },
  sidePad: { paddingHorizontal: 16 },
  sidePadHead: { paddingHorizontal: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  bellDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 999, backgroundColor: colors.ember, borderWidth: 1.5, borderColor: design.bg },
  greeting: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3 },
  h1: { marginTop: 2, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink, lineHeight: 32 },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  portfolio: { backgroundColor: colors.forest, borderRadius: 16, padding: 20, overflow: 'hidden' },
  portfolioLabel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(233,230,220,0.7)' },
  portfolioValue: { fontFamily: font.sansMed, fontSize: 34, letterSpacing: -0.7, color: '#e9e6dc', marginTop: 4 },
  benchRow: { flexDirection: 'row', alignItems: 'center' },
  benchText: { fontSize: 12, color: design.leaf },
  statsRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statN: { fontFamily: font.sansMed, fontSize: 17, color: '#e9e6dc' },
  statL: { fontSize: 11, color: 'rgba(244,241,234,0.6)', marginTop: 1 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  liveText: { fontSize: 11, color: colors.ember },

  actionCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: 'rgba(200,96,43,0.4)', borderRadius: 16, padding: 16, shadowColor: colors.ember, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  muted12: { fontSize: 12, color: design.ink3 },
  cardTitle: { fontFamily: font.sansMed, fontSize: 16.5, letterSpacing: -0.25, color: design.ink },
  cardSub: { fontFamily: font.sans, fontSize: 13.5, color: design.ink2, marginTop: 2 },
  actionBtns: { flexDirection: 'row', gap: 9, marginTop: 14 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.forest },
  btnPrimaryText: { fontFamily: font.sansMed, fontSize: 14, letterSpacing: -0.14, color: '#f4f1ea' },
  pressed: { opacity: 0.85 },

  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3 },

  manage: { fontFamily: font.sansMed, fontSize: 13, color: colors.forest },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  agentIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, alignItems: 'center', justifyContent: 'center' },
  agentName: { fontFamily: font.sansMed, fontSize: 15, letterSpacing: -0.15, color: design.ink },
  agentCrop: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 1 },
  agentLots: { marginTop: 5, fontSize: 11.5, color: design.ink3 },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 11, backgroundColor: colors.forest },
  quickPrimaryText: { fontFamily: font.sansMed, fontSize: 14, color: '#f4f1ea' },
  quickGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 11, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  quickGhostText: { fontFamily: font.sansMed, fontSize: 14, color: design.ink2 },
});
