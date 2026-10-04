// Buyer app · Home / dashboard — wired to live API data.
// KPIs from /transactions/stats + /bids/my, agent row from /agent/config,
// "needs your decision" from countered bids and live auctions.
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Wordmark } from '../../components/marks';
import { IconArrow } from '../../components/icons';
import { Eyebrow, GridBg, LiveDot, Mono, StatusPill } from '../../components/buyerKit';
import { NotificationBell } from '../../components/NotificationBell';
import { ExportBook } from '../../components/ExportBook';
import { portName, useExportOptions } from '../../lib/exportOptions';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { listAuctions, myBids, myNegotiations, myRequirements, myTransactions, transactionStats } from '../../api/endpoints';
import type { Auction, Bid, BuyerRequirement, Negotiation, Transaction, TransactionStats } from '../../api/types';
import { cropEmojiFor } from '../../utils/cropImages';
import { IconChevR } from '../../components/icons';
import { money, timeAgo, unitLabel } from '../../lib/format';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user } = useAuth();

  const [bids, setBids] = useState<Bid[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [reqs, setReqs] = useState<BuyerRequirement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [b, s, n, au, tx, rq] = await Promise.allSettled([
      myBids(),
      transactionStats(),
      myNegotiations(),
      listAuctions(),
      myTransactions(),
      myRequirements('OPEN'),
    ]);
    if (b.status === 'fulfilled') setBids(Array.isArray(b.value) ? b.value : []);
    if (s.status === 'fulfilled') setStats(s.value);
    if (n.status === 'fulfilled') setNegotiations(Array.isArray(n.value) ? n.value : []);
    if (au.status === 'fulfilled') setAuctions(Array.isArray(au.value) ? au.value : []);
    if (tx.status === 'fulfilled') setTxs(Array.isArray(tx.value) ? tx.value : []);
    if (rq.status === 'fulfilled') setReqs(rq.value.requirements ?? []);
  }, []);

  // On focus, not only on mount: a bid accepted or a deal paid elsewhere must
  // show when the buyer comes back to this tab.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const currency = user?.currency || 'INR';
  // An exporter also gets the export book: tonnes by crop and by source state,
  // and where every unfinished deal is (components/ExportBook).
  const isExporter = user?.buyerProfile?.companyType === 'EXPORTER';
  const exportOpts = useExportOptions(isExporter);
  const firstName = user?.name?.split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeBids = bids.filter((b) => b.status === 'PENDING' || b.status === 'COUNTERED');
  const countered = bids.filter((b) => b.status === 'COUNTERED');
  const liveNegotiations = negotiations.filter((n) => n.finalOutcome === 'IN_PROGRESS');
  // EVERYTHING WAITING ON THIS BUYER, most urgent first. Each is a real state
  // in the data with somewhere to act on it, not a nudge: a deal to pay, a
  // delivery to confirm (which is what marks the seller due), a seller's
  // counter, offers on a posted request, and a live auction.
  const toPay = txs.filter((t) => t.paymentStatus === 'AWAITING_PAYMENT');
  const toConfirm = txs.filter((t) => t.deliveryStatus === 'DELIVERED');
  const withOffers = reqs.filter((r) => (r._count?.offers ?? 0) > 0);
  type Todo = { key: string; tone: 'ember' | 'sage'; emoji: string; title: string; sub: string; go: () => void };
  const todos: Todo[] = [
    ...toPay.map((t) => ({
      key: `pay-${t.id}`, tone: 'ember' as const, emoji: cropEmojiFor(t.listing?.cropName),
      title: `Pay for ${t.listing?.cropName ?? 'your deal'}`,
      sub: `${money(t.totalAmount, t.currency)} · the seller sends it once you pay`,
      go: () => nav.navigate('Contracts'),
    })),
    ...toConfirm.map((t) => ({
      key: `confirm-${t.id}`, tone: 'sage' as const, emoji: cropEmojiFor(t.listing?.cropName),
      title: `Did the ${t.listing?.cropName ?? 'delivery'} arrive?`,
      sub: 'Confirm it so the seller is due their money',
      go: () => nav.navigate('Contracts'),
    })),
    ...countered.map((b) => ({
      key: `counter-${b.id}`, tone: 'ember' as const, emoji: cropEmojiFor(b.listing?.cropName),
      title: `Counter on ${b.listing?.cropName ?? 'your bid'}`,
      sub: `You bid ${money(b.bidPricePerUnit, b.currency)} · the seller asks ${b.counterPrice != null ? money(b.counterPrice, b.currency) : 'more'}`,
      go: () => nav.navigate('ListingDetail', { id: b.listingId }),
    })),
    ...withOffers.map((r) => ({
      key: `offers-${r.id}`, tone: 'sage' as const, emoji: cropEmojiFor(r.cropName),
      title: `${r._count!.offers} ${r._count!.offers === 1 ? 'offer' : 'offers'} on your ${r.cropName} request`,
      sub: 'Accept one, or wait for better',
      go: () => nav.navigate('RequirementDetail', { id: r.id, preview: r }),
    })),
    ...auctions.slice(0, 1).map((a) => ({
      key: `auction-${a.listingId}`, tone: 'ember' as const, emoji: cropEmojiFor(a.cropName),
      title: `${a.cropName} auction is live`,
      sub: `Now ${money(a.currentPrice, a.currency)} · ${a.participantCount} in the room`,
      go: () => nav.navigate('Auction', { listingId: a.listingId }),
    })),
  ];
  const needsYou = todos.length;
  const working = liveNegotiations.length + activeBids.length;



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
            <NotificationBell />
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
            <Text style={styles.h1}>
              {/* "All quiet" only when nothing is waiting either: it used to
                  read "All quiet on the desk, 1 needs you." */}
              {needsYou > 0
                ? `${needsYou} ${needsYou === 1 ? 'thing needs' : 'things need'} you,`
                : working > 0
                  ? `${working} ${working === 1 ? 'deal' : 'deals'} working,`
                  : 'All quiet on the desk,'}{'\n'}
              <Text style={styles.h1Serif}>
                {needsYou > 0 ? 'starting below.' : 'nothing needs you.'}
              </Text>
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
                  {/* What this buyer has paid on deals that completed. Nothing
                      sits under it: the sparkline that used to was made-up
                      numbers, a rising line on an account that had spent ₹0. */}
                  <Mono style={styles.portfolioLabel}>SPENT · COMPLETED DEALS</Mono>
                  <Text style={styles.portfolioValue}>{money(stats?.totalRevenue ?? 0, currency)}</Text>
                </View>
                <View style={styles.benchRow}>
                  <IconArrow size={11} stroke={design.leaf} />
                  <Mono style={styles.benchText}> {stats?.released ?? 0} released</Mono>
                </View>
              </View>
              <View style={styles.statsRow}>
                {([
                  [String(stats?.total ?? 0), 'contracts', 'Contracts'],
                  [String(stats?.inEscrow ?? 0), 'paid, in progress', 'Contracts'],
                  [String(reqs.length), reqs.length === 1 ? 'open request' : 'open requests', 'Requests'],
                ] as const).map(([n, l, to]) => (
                  <Pressable key={l} style={{ flex: 1 }} onPress={() => nav.navigate(to)} hitSlop={6}>
                    <Text style={styles.statN}>{n}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* What needs a decision stays first: the book is a view, the list is work. */}
        {/* ---- needs your decision ----------------------------------- */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>Needs your decision</Eyebrow>
          {needsYou > 0 ? (
            <View style={styles.liveRow}>
              <LiveDot size={6} />
              <Mono style={styles.liveText}> {needsYou} waiting</Mono>
            </View>
          ) : null}
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {todos.length > 0 ? (
            todos.slice(0, 5).map((d) => (
              <Pressable
                key={d.key}
                onPress={d.go}
                style={({ pressed }) => [styles.todo, d.tone === 'ember' && styles.todoHot, pressed && styles.pressed]}
              >
                <View style={styles.todoTile}><Text style={styles.todoEmoji}>{d.emoji}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.todoTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.todoSub} numberOfLines={1}>{d.sub}</Text>
                </View>
                <IconChevR size={12} stroke={design.ink3} />
              </Pressable>
            ))
          ) : (
            <Pressable
              style={({ pressed }) => [styles.emptyCard, pressed && styles.pressed]}
              onPress={() => nav.navigate('Home')}
            >
              <Text style={styles.emptyText}>Nothing waiting on you. Browse the market to start a deal.</Text>
              <Text style={styles.emptyLink}>Open the market →</Text>
            </Pressable>
          )}
        </View>

        {isExporter ? <ExportBook txs={txs} onOpenContracts={() => nav.navigate('Contracts')} /> : null}

        {/* ---- your demand: what this buyer has asked for --------------- */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Your open requests</Eyebrow>
          {reqs.length > 0 ? (
            <Pressable onPress={() => nav.navigate('Requests')} hitSlop={8}>
              <Text style={styles.manage}>See all</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {reqs.slice(0, 3).map((r) => {
            const filled = r.quantity - r.remainingQuantity;
            const pct = r.quantity > 0 ? (filled / r.quantity) * 100 : 0;
            const offers = r._count?.offers ?? 0;
            return (
              <Pressable
                key={r.id}
                onPress={() => nav.navigate('RequirementDetail', { id: r.id, preview: r })}
                style={({ pressed }) => [styles.req, pressed && styles.pressed]}
              >
                <View style={styles.todoTile}><Text style={styles.todoEmoji}>{cropEmojiFor(r.cropName)}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.todoTitle} numberOfLines={1}>{r.cropName}</Text>
                    {offers > 0 ? (
                      <View style={styles.offerBadge}><Text style={styles.offerBadgeText}>{offers} new</Text></View>
                    ) : null}
                  </View>
                  <Text style={styles.todoSub} numberOfLines={1}>
                    {money(r.pricePerUnit, r.currency)}/{unitLabel(r.unit)} · to {r.forExport ? `${portName(exportOpts, r.exportPort)} port` : r.deliveryLocation}
                  </Text>
                  <View style={styles.track}><View style={[styles.trackFill, { width: `${Math.max(pct, 2)}%` }]} /></View>
                  <Mono style={styles.reqMeta}>
                    {filled.toLocaleString('en-IN')} OF {r.quantity.toLocaleString('en-IN')} {unitLabel(r.unit).toUpperCase()} FILLED
                  </Mono>
                </View>
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [styles.demandPrimary, pressed && styles.pressed]}
            onPress={() => nav.navigate('CreateRequirement')}
          >
            <Text style={styles.demandPrimaryText}>Post what you need </Text>
            <IconArrow size={13} stroke="#f4f1ea" />
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
  todo: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 12,
  },
  todoHot: { borderColor: 'rgba(200,96,43,0.4)' },
  todoTile: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  todoEmoji: { fontSize: 21 },
  todoTitle: { flexShrink: 1, fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  todoSub: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 2 },
  req: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 12,
  },
  offerBadge: { backgroundColor: 'rgba(200,96,43,0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  offerBadgeText: { fontFamily: font.sansSemi, fontSize: 11, color: colors.ember },
  track: { height: 5, borderRadius: 3, backgroundColor: design.paper2, overflow: 'hidden' },
  trackFill: { height: 5, borderRadius: 3, backgroundColor: colors.sage },
  reqMeta: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },
  emptyLink: { fontFamily: font.sansSemi, fontSize: 13.5, color: colors.forest, marginTop: 8 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3 },

  manage: { fontFamily: font.sansMed, fontSize: 13, color: colors.forest },
  demandRow: { flexDirection: 'row', gap: 10 },
  demandPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 11, backgroundColor: colors.forest },
  demandPrimaryText: { fontFamily: font.sansMed, fontSize: 13.5, color: '#f4f1ea' },
  demandGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 11, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  demandGhostText: { fontFamily: font.sansMed, fontSize: 13.5, color: design.ink },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  agentIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, alignItems: 'center', justifyContent: 'center' },
  agentName: { fontFamily: font.sansMed, fontSize: 15, letterSpacing: -0.15, color: design.ink },
  agentCrop: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 1 },
  agentLots: { marginTop: 5, fontSize: 11.5, color: design.ink3 },
});
