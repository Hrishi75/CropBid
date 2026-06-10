// Buyer app · Home / dashboard — wired to live API data.
// KPIs from /transactions/stats + /bids/my, agent row from /agent/config,
// "needs your decision" from countered bids and live auctions.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Wordmark, MARKS } from '../../components/marks';
import { IconArrow, IconBell } from '../../components/icons';
import { Eyebrow, GridBg, LiveDot, MiniChart, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getAgentConfig, listAuctions, myBids, myNegotiations, transactionStats } from '../../api/endpoints';
import type { AgentConfig, Auction, Bid, Negotiation, TransactionStats } from '../../api/types';
import { money, timeAgo } from '../../lib/format';

const SPARK = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 16];

function outcomeTone(o: Negotiation['finalOutcome']): 'ember' | 'sage' | 'paper' {
  if (o === 'IN_PROGRESS') return 'ember';
  if (o === 'DEAL') return 'sage';
  return 'paper';
}
function outcomeLabel(o: Negotiation['finalOutcome']): string {
  if (o === 'IN_PROGRESS') return 'negotiating';
  if (o === 'DEAL') return 'deal';
  return 'no deal';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user } = useAuth();

  const [bids, setBids] = useState<Bid[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [b, s, n, a, au] = await Promise.allSettled([
      myBids(),
      transactionStats(),
      myNegotiations(),
      getAgentConfig(),
      listAuctions(),
    ]);
    if (b.status === 'fulfilled') setBids(Array.isArray(b.value) ? b.value : []);
    if (s.status === 'fulfilled') setStats(s.value);
    if (n.status === 'fulfilled') setNegotiations(Array.isArray(n.value) ? n.value : []);
    if (a.status === 'fulfilled') setAgent(a.value);
    if (au.status === 'fulfilled') setAuctions(Array.isArray(au.value) ? au.value : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const currency = user?.currency || 'INR';
  const firstName = user?.name?.split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeBids = bids.filter((b) => b.status === 'PENDING' || b.status === 'COUNTERED');
  const countered = bids.filter((b) => b.status === 'COUNTERED');
  const liveNegotiations = negotiations.filter((n) => n.finalOutcome === 'IN_PROGRESS');
  const needsYou = countered.length;
  const working = liveNegotiations.length + activeBids.length;

  // Top decision item: a countered bid beats a live auction.
  const decisionBid = countered[0] ?? null;
  const decisionAuction = !decisionBid && auctions.length > 0 ? auctions[0] : null;

  const recentNegotiations = negotiations.slice(0, 3);
  const glyphs = ['sprout', 'bars', 'kernel'];

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
            <View>
              <IconBell size={22} stroke={design.ink2} />
              {needsYou > 0 ? <View style={styles.bellDot} /> : null}
            </View>
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
            <Text style={styles.h1}>
              {working > 0 ? `${working} ${working === 1 ? 'deal' : 'deals'} working,` : 'All quiet on the desk,'}{'\n'}
              <Text style={styles.h1Serif}>{needsYou > 0 ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you.` : 'nothing needs you.'}</Text>
            </Text>
          </View>
        </View>

        {/* portfolio card */}
        <View style={styles.sidePad}>
          <View style={styles.portfolio}>
            <GridBg opacity={0.12} />
            <View>
              <View style={styles.rowBetweenTop}>
                <View>
                  <Mono style={styles.portfolioLabel}>SETTLED · ALL TIME</Mono>
                  <Text style={styles.portfolioValue}>{money(stats?.totalRevenue ?? 0, currency)}</Text>
                </View>
                <View style={styles.benchRow}>
                  <IconArrow size={11} stroke={design.leaf} />
                  <Mono style={styles.benchText}> {stats?.released ?? 0} released</Mono>
                </View>
              </View>
              <MiniChart width={330} height={46} data={SPARK} color={design.leaf} fill />
              <View style={styles.statsRow}>
                {[
                  [String(stats?.total ?? 0), 'contracts'],
                  [String(stats?.inEscrow ?? 0), 'in escrow'],
                  [String(activeBids.length), 'bids open'],
                ].map(([n, l]) => (
                  <View key={l} style={{ flex: 1 }}>
                    <Text style={styles.statN}>{n}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* action required */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>Needs your decision</Eyebrow>
          {decisionBid || decisionAuction ? (
            <View style={styles.liveRow}>
              <LiveDot size={6} />
              <Mono style={styles.liveText}> {decisionAuction ? `${auctions.length} live` : `${countered.length} waiting`}</Mono>
            </View>
          ) : null}
        </View>
        <View style={styles.sidePad}>
          {decisionBid ? (
            <View style={styles.actionCard}>
              <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'center' }]}>
                <StatusPill tone="ember" dot>Counter received</StatusPill>
                <Mono style={styles.muted12}>{timeAgo(decisionBid.createdAt)}</Mono>
              </View>
              <Text style={styles.cardTitle}>
                {decisionBid.listing?.cropName ?? 'Listing'}
                {decisionBid.listing?.cropVariety ? ` · ${decisionBid.listing.cropVariety}` : ''}
              </Text>
              <Text style={styles.cardSub}>
                Your bid {money(decisionBid.bidPricePerUnit, decisionBid.currency)} · farmer countered{' '}
                {decisionBid.counterPrice != null ? money(decisionBid.counterPrice, decisionBid.currency) : '—'}
              </Text>
              <View style={styles.actionBtns}>
                <Pressable
                  style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
                  onPress={() => nav.navigate('ListingDetail', { id: decisionBid.listingId })}
                >
                  <Text style={styles.btnPrimaryText}>Review &amp; respond </Text>
                  <IconArrow size={13} stroke={colors.textInverse} />
                </Pressable>
              </View>
            </View>
          ) : decisionAuction ? (
            <View style={styles.actionCard}>
              <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'center' }]}>
                <StatusPill tone="ember" dot>Live auction</StatusPill>
                <Mono style={styles.muted12}>{decisionAuction.bidCount} bids</Mono>
              </View>
              <Text style={styles.cardTitle}>{decisionAuction.cropName}</Text>
              <Text style={styles.cardSub}>
                Now at {money(decisionAuction.currentPrice, decisionAuction.currency)} · {decisionAuction.participantCount} in the room
              </Text>
              <View style={styles.actionBtns}>
                <Pressable
                  style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
                  onPress={() => nav.navigate('Auction', { listingId: decisionAuction.listingId })}
                >
                  <Text style={styles.btnPrimaryText}>Watch live </Text>
                  <IconArrow size={13} stroke={colors.textInverse} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nothing waiting on you. Browse the market to start a deal.</Text>
            </View>
          )}
        </View>

        {/* agent + recent negotiations */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Your agent</Eyebrow>
          <Pressable onPress={() => nav.navigate('Agents')}>
            <Text style={styles.manage}>Manage</Text>
          </Pressable>
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {agent ? (
            <View style={styles.agentRow}>
              <View style={styles.agentIcon}>
                {(() => {
                  const Mark = MARKS['sprout'];
                  return <Mark size={22} color={colors.forest} accent={colors.ember} />;
                })()}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.agentName}>Buyer agent · {agent.negotiationStyle.toLowerCase()}</Text>
                <Text style={styles.agentCrop} numberOfLines={1}>
                  {agent.preferredCrops.length > 0 ? agent.preferredCrops.join(' · ') : 'No crop preferences set'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <StatusPill tone={agent.active ? 'sage' : 'paper'}>{agent.active ? 'active' : 'paused'}</StatusPill>
                <Mono style={styles.agentLots}>
                  {agent.maxPrice != null ? `cap ${money(agent.maxPrice, currency)}` : 'no cap'}
                </Mono>
              </View>
            </View>
          ) : null}
          {recentNegotiations.map((n, i) => {
            const Mark = MARKS[glyphs[i % glyphs.length]];
            return (
              <View key={n.id} style={styles.agentRow}>
                <View style={styles.agentIcon}>
                  <Mark size={22} color={colors.forest} accent={colors.ember} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.agentName} numberOfLines={1}>
                    {n.listing?.cropName ?? 'Negotiation'}
                    {n.listing?.cropVariety ? ` · ${n.listing.cropVariety}` : ''}
                  </Text>
                  <Text style={styles.agentCrop} numberOfLines={1}>
                    vs {n.listing?.farmer?.user?.name ?? 'farmer'} · {Array.isArray(n.rounds) ? n.rounds.length : 0} rounds
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <StatusPill tone={outcomeTone(n.finalOutcome)}>{outcomeLabel(n.finalOutcome)}</StatusPill>
                  <Mono style={styles.agentLots}>{timeAgo(n.startedAt)}</Mono>
                </View>
              </View>
            );
          })}
          {!agent && recentNegotiations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Configure your agent to negotiate while you sleep.</Text>
            </View>
          ) : null}
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
});
