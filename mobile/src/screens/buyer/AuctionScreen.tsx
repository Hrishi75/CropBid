// Buyer app · Live auction — wired to /auctions via REST polling (5s).
// Shows the real bid thread, countdown, and current price. Live bidding uses
// the web client's WebSocket room; mobile is a live viewer with a jump-off to
// the listing for standard bids when no auction is running.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { IconArrow, IconChevR } from '../../components/icons';
import { LiveDot, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { listAuctions } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Auction, AuctionBid } from '../../api/types';
import { money, unitLabel } from '../../lib/format';

const POLL_MS = 5000;

function countdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AuctionScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const wantedId: string | undefined = route.params?.listingId;

  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // re-render for the countdown
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const data = await listAuctions();
      setAuctions(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load auctions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  const auction = (wantedId ? auctions.find((a) => a.listingId === wantedId) : null) ?? auctions[0] ?? null;

  if (loading) {
    return (
      <View style={[styles.flex, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerInner}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10} style={{ transform: [{ rotate: '180deg' }], alignSelf: 'flex-start' }}>
            <IconChevR size={15} stroke={design.ink2} />
          </Pressable>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No live auctions right now.</Text>
          <Text style={styles.emptyText}>
            {error ?? 'Farmers open auctions from their listings. When one goes live, it shows up here in real time.'}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.9 }]}
            onPress={() => nav.navigate('Tabs', { screen: 'Market' })}
          >
            <Text style={styles.emptyBtnText}>Browse the market </Text>
            <IconArrow size={13} stroke="#f4f1ea" />
          </Pressable>
        </View>
      </View>
    );
  }

  const unit = unitLabel(auction.unit);
  const leading = auction.currentWinner;
  const youLead = !!user && auction.bids.length > 0 && auction.bids[auction.bids.length - 1].userId === user.id;

  return (
    <View style={styles.flex}>
      {/* sticky lot header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerInner}>
          <View style={[styles.rowBetween, { marginBottom: 8 }]}>
            <View style={styles.rowCenter}>
              <Pressable onPress={() => nav.goBack()} hitSlop={10} style={{ transform: [{ rotate: '180deg' }] }}>
                <IconChevR size={15} stroke={design.ink2} />
              </Pressable>
              <View style={{ width: 8 }} />
              <StatusPill tone="ember" dot>Live auction</StatusPill>
            </View>
            <Mono style={styles.timer}>⏱ {countdown(auction.endsAt)}</Mono>
          </View>
          <View style={styles.rowBetweenBaseline}>
            <View>
              <Text style={styles.lotTitle}>{auction.cropName}</Text>
              <Text style={styles.lotSub}>
                {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'} · {auction.participantCount} in room
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono style={styles.spotLabel}>FLOOR</Mono>
              <Mono style={styles.spotVal}>{money(auction.startPrice, auction.currency)}/{unit}</Mono>
            </View>
          </View>
        </View>
      </View>

      {/* bid thread */}
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ paddingTop: insets.top + 92, paddingBottom: insets.bottom + 150, paddingHorizontal: 16, gap: 11 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View style={styles.outbid}>
          <LiveDot size={6} />
          <Mono style={styles.outbidMuted}>  Auction opened at {money(auction.startPrice, auction.currency)}/{unit}</Mono>
        </View>
        {auction.bids.length === 0 ? (
          <View style={styles.outbid}>
            <Mono style={styles.outbidMuted}>No bids yet — floor stands.</Mono>
          </View>
        ) : (
          auction.bids.map((b, i) => <BidMsg key={`${b.timestamp}-${i}`} bid={b} mine={b.userId === user?.id} unit={unit} currency={auction.currency} />)
        )}
        {leading ? (
          <View style={styles.outbid}>
            <Mono style={styles.outbidEmber}>
              {youLead ? 'You lead' : `${leading} leads`} · {money(auction.currentPrice, auction.currency)}
            </Mono>
          </View>
        ) : null}
      </ScrollView>

      {/* status bar */}
      <View style={[styles.settleBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.rowBetween, { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 8, alignItems: 'center' }]}>
          <View>
            <Mono style={styles.settleLabel}>CURRENT HIGH</Mono>
            <Text style={styles.settleVal}>
              {money(auction.currentPrice, auction.currency)}<Text style={styles.settleUnit}>/{unit}</Text>
            </Text>
          </View>
          <Mono style={styles.saved}>{youLead ? 'you lead' : leading ? `${leading} leads` : 'no bids'}</Mono>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <Pressable
            style={({ pressed }) => [styles.signBtn, pressed && { opacity: 0.9 }]}
            onPress={() => nav.navigate('ListingDetail', { id: auction.listingId })}
          >
            <Text style={styles.signBtnText}>View listing · bid live on the web </Text>
            <IconArrow size={14} stroke={colors.forest} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BidMsg({ bid, mine, unit, currency }: { bid: AuctionBid; mine: boolean; unit: string; currency: string }) {
  const bg = mine ? 'rgba(31,45,24,0.05)' : 'rgba(200,96,43,0.05)';
  const border = mine ? 'rgba(31,45,24,0.15)' : 'rgba(200,96,43,0.18)';
  const dot = mine ? colors.forest : colors.ember;
  const time = new Date(bid.timestamp).toLocaleTimeString('en-IN', { hour12: false });
  return (
    <View style={[styles.msg, { alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: bg, borderColor: border }]}>
      <View style={styles.msgHead}>
        <View style={[styles.msgDot, { backgroundColor: dot }]} />
        <Mono style={styles.msgName}>{mine ? 'You' : bid.userName}</Mono>
        <Mono style={styles.msgTime}>{time}</Mono>
      </View>
      <Text style={styles.msgBody}>
        Bid <Text style={{ fontFamily: font.sansSemi }}>{money(bid.price, currency)}/{unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, backgroundColor: 'rgba(244,241,234,0.96)', borderBottomWidth: 1, borderBottomColor: design.line },
  headerInner: { paddingHorizontal: 18, paddingBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenBaseline: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  timer: { fontSize: 13, color: design.ink2 },
  lotTitle: { fontFamily: font.sansMed, fontSize: 17, letterSpacing: -0.25, color: design.ink },
  lotSub: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3, marginTop: 1 },
  spotLabel: { fontSize: 10.5, color: design.ink3 },
  spotVal: { fontFamily: font.monoSemi, fontSize: 15 },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontFamily: font.sansMed, fontSize: 19, letterSpacing: -0.3, color: design.ink },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink3, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: colors.forest, marginTop: 8 },
  emptyBtnText: { fontFamily: font.sansMed, fontSize: 14, color: '#f4f1ea' },

  outbid: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line, borderStyle: 'dashed', borderRadius: 999 },
  outbidEmber: { fontFamily: font.monoSemi, fontSize: 11, color: colors.ember },
  outbidMuted: { fontSize: 11, color: design.ink3 },

  msg: { maxWidth: '90%', paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14 },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  msgDot: { width: 7, height: 7, borderRadius: 999 },
  msgName: { fontSize: 10, color: design.ink3, letterSpacing: 0.3 },
  msgTime: { fontSize: 10, color: design.ink3, opacity: 0.7, marginLeft: 'auto' },
  msgBody: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink },

  settleBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, backgroundColor: colors.forest },
  settleLabel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(244,241,234,0.65)' },
  settleVal: { fontFamily: font.sansMed, fontSize: 18, letterSpacing: -0.18, color: '#e9e6dc', marginTop: 2 },
  settleUnit: { color: 'rgba(244,241,234,0.6)', fontSize: 14 },
  saved: { fontSize: 11.5, color: design.leaf },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: design.mint },
  signBtnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.forest },
});
