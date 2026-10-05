// =============================================================================
// ShopHomeScreen — the "My Shop" tab for a local shop
// =============================================================================
// A local shop sells to households and nothing else (CLAUDE.md §3), so its
// dashboard is two things: what it has sold, and the orders it has to send.
// No offers, no AI helper, no demand board: those are the trade side, where a
// lot is bargained over by the tonne, and none of it applies to a kirana
// counter whose prices are fixed on the shelf.
//
// Same look as the farm dashboard (farmer/HomeScreen), kept apart so each can
// lose what the other needs without a flag in every block.
//
// ORDERS ARE SHOP ORDERS, NOT LOTS. A household basket from one shop is one
// RetailOrder holding a lot per item (§3b), and it travels as one delivery,
// so the list groups lots by their order and "On the way" moves every lot in
// it together, the way the shop actually sends it.
//
// ONLY PAID ORDERS CAN BE SENT. An order placed but not yet paid is shown as
// waiting for payment with no send button, so nobody packs goods that have
// not been paid for.
// =============================================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Wordmark } from '../../components/marks';
import { Appear } from '../../components/motion';
import { Eyebrow, GridBg, Mono } from '../../components/buyerKit';
import { NotificationBell } from '../../components/NotificationBell';
import { IconArrow, IconCheck, IconClock, IconPlus } from '../../components/icons';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../context/AuthContext';
import { myListings, myTransactions, updateDeliveryStatus } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { DeliveryStatus, Listing, Transaction } from '../../api/types';
import { money, timeAgo, unitLabel } from '../../lib/format';
import { sellerDisplayName } from '../../lib/sellerType';
import { colors, design, font } from '../../theme';

/** One household order: every lot bought from this shop in one basket. */
interface ShopOrder {
  key: string;
  lines: Transaction[];
  buyer: string;
  phone: string | null;
  address: string | null;
  total: number;
  currency: string;
  paid: boolean;
  status: DeliveryStatus;
  createdAt: string;
}

function groupOrders(txs: Transaction[]): ShopOrder[] {
  const byKey = new Map<string, Transaction[]>();
  for (const t of txs) {
    // A lot bought before shop orders existed has no order; it is its own.
    const k = t.retailOrder?.id ?? t.id;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  return [...byKey.entries()].map(([key, lines]) => {
    const first = lines[0];
    const order = first.retailOrder;
    return {
      key,
      lines,
      buyer: first.buyer?.name ?? 'Customer',
      phone: first.bid?.contactPhone ?? null,
      address: first.bid?.deliveryAddress ?? null,
      // The items, which is the shop's share. The delivery fee is CropBid's.
      total: order?.itemsTotal ?? lines.reduce((n, l) => n + l.totalAmount, 0),
      currency: first.currency,
      paid: lines.every((l) => l.paymentStatus === 'ESCROW' || l.paymentStatus === 'RELEASED'),
      status: first.deliveryStatus,
      createdAt: first.createdAt,
    };
  });
}

export default function ShopHomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [l, t] = await Promise.allSettled([myListings(), myTransactions()]);
    if (l.status === 'fulfilled') setListings(l.value.listings ?? []);
    if (t.status === 'fulfilled') setTxs(Array.isArray(t.value) ? t.value : []);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const orders = useMemo(
    () => groupOrders(txs.filter((t) => t.retailOrder || t.listing?.directSaleEnabled)),
    [txs],
  );
  // Still to do: anything not yet with the customer and not called off.
  const toSend = orders
    .filter((o) => o.status === 'PENDING' || o.status === 'IN_TRANSIT')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Paid and not yet sent: the ones the shop has to pack now. An order already
  // on its way is not "to send", it is out.
  const sendable = toSend.filter((o) => o.paid && o.status === 'PENDING').length;
  // What the shop has sold: every paid order not called off, at its items
  // total. Not the server's revenue figure, which only counts money RELEASED,
  // i.e. after the customer confirms delivery, so a shop that has sent and
  // delivered an order would still read ₹0.
  const sales = orders
    .filter((o) => o.paid && o.status !== 'CANCELLED')
    .reduce((n, o) => n + o.total, 0);

  const onShelf = listings.filter((l) => l.status === 'ACTIVE' && l.remainingQuantity > 0).length;
  const soldOut = listings.filter((l) => l.status === 'ACTIVE' && l.remainingQuantity <= 0).length;
  const currency = user?.currency || 'INR';
  const name = sellerDisplayName(user);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  async function advance(o: ShopOrder, next: DeliveryStatus) {
    setBusy(o.key);
    try {
      // One delivery, so every lot in it moves together.
      for (const line of o.lines) {
        if (line.deliveryStatus !== next) await updateDeliveryStatus(line.id, next);
      }
      await load();
    } catch (e) {
      Alert.alert('Could not update the order', errorMessage(e));
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <Wordmark size={17} glyph="arc" />
            <NotificationBell />
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={styles.greeting}>{greeting}, {name}</Text>
            <Text style={styles.h1}>
              {sendable > 0
                ? <>{sendable} {sendable === 1 ? 'order' : 'orders'} <Text style={styles.h1Serif}>to send today.</Text></>
                : <>No orders <Text style={styles.h1Serif}>waiting right now.</Text></>}
            </Text>
          </View>
        </View>

        {/* ---- the green board: what the shop has sold -------------------- */}
        <View style={styles.sidePad}>
          <View style={styles.board}>
            <GridBg opacity={0.12} />
            <Mono style={styles.boardLabel}>YOUR SALES</Mono>
            <Text style={styles.boardValue}>{money(sales, currency)}</Text>
            <View style={styles.boardStats}>
              <BoardStat n={orders.length} label={orders.length === 1 ? 'order' : 'orders'} />
              {/* Paid and still to go out, the same count as the headline. An
                  unpaid order is not one to send, and counting it here said
                  "1 to send" under "No orders waiting". */}
              <BoardStat n={sendable} label="to send" hot={sendable > 0} />
              <BoardStat n={onShelf} label="on your shelf" />
            </View>
          </View>
        </View>

        {/* ---- orders to send -------------------------------------------- */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>Orders to send</Eyebrow>
          {toSend.length > 0 ? <Mono style={styles.count}>{toSend.length}</Mono> : null}
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {!loaded ? (
            <ActivityIndicator color={colors.forest} style={{ marginTop: 12 }} />
          ) : toSend.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🛍️</Text>
              <Text style={styles.emptyText}>
                When a household orders from your shelf, it shows up here to pack and send.
              </Text>
            </View>
          ) : (
            toSend.map((o, i) => (
              <Appear key={o.key} index={i}>
                <OrderCard
                  order={o}
                  busy={busy === o.key}
                  onSend={() => advance(o, 'IN_TRANSIT')}
                  onDelivered={() => advance(o, 'DELIVERED')}
                />
              </Appear>
            ))
          )}
        </View>

        {/* ---- shelf --------------------------------------------------- */}
        <View style={[styles.sectionHead, styles.sidePadHead, { paddingTop: 24 }]}>
          <Eyebrow>Your shelf</Eyebrow>
          {soldOut > 0 ? <Mono style={styles.warn}>{soldOut} SOLD OUT</Mono> : null}
        </View>
        <View style={[styles.sidePad, styles.quickRow]}>
          <Pressable
            style={({ pressed }) => [styles.quickPrimary, pressed && styles.pressed]}
            onPress={() => nav.navigate('CreateListing')}
          >
            <IconPlus size={15} stroke="#f4f1ea" />
            <Text style={styles.quickPrimaryText}>Add to your shelf</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickGhost, pressed && styles.pressed]}
            onPress={() => nav.navigate('Listings')}
          >
            <Text style={styles.quickGhostText}>My Stock</Text>
            <IconArrow size={12} stroke={colors.forest} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function BoardStat({ n, label, hot }: { n: number; label: string; hot?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statN, hot && styles.statHot]}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

function OrderCard({
  order: o, busy, onSend, onDelivered,
}: { order: ShopOrder; busy: boolean; onSend: () => void; onDelivered: () => void }) {
  const onTheWay = o.status === 'IN_TRANSIT';
  return (
    <View style={[styles.order, o.paid && !onTheWay && styles.orderReady]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.orderBuyer} numberOfLines={1}>{o.buyer}</Text>
          <Mono style={styles.orderMeta}>
            #{o.key.slice(-6).toUpperCase()} · {timeAgo(o.createdAt).toUpperCase()}
          </Mono>
        </View>
        <Text style={styles.orderTotal}>{money(o.total, o.currency)}</Text>
      </View>

      <View style={styles.lines}>
        {o.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <Text style={styles.lineName} numberOfLines={1}>{l.listing?.cropName ?? 'Item'}</Text>
            <Text style={styles.lineQty}>
              {formatQty(l.bid?.quantity ?? 0, l.listing?.unit)}
            </Text>
          </View>
        ))}
      </View>

      {o.address ? <Text style={styles.address} numberOfLines={2}>📍 {o.address}</Text> : null}

      {!o.paid ? (
        <View style={styles.waiting}>
          <IconClock size={14} stroke={design.ink3} />
          <Text style={styles.waitingText}>Waiting for the customer to pay. Don't send it yet.</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={onTheWay ? onDelivered : onSend}
            style={({ pressed }) => [styles.sendBtn, onTheWay && styles.doneBtn, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={onTheWay ? colors.forest : '#f4f1ea'} />
            ) : (
              <>
                {onTheWay ? <IconCheck size={15} stroke={colors.forest} /> : null}
                <Text style={[styles.sendText, onTheWay && styles.doneText]}>
                  {onTheWay ? 'Mark delivered' : 'Mark on the way'}
                </Text>
              </>
            )}
          </Pressable>
          {o.phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${o.phone}`)}
              style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
              accessibilityLabel={`Call ${o.buyer}`}
            >
              <Text style={styles.callText}>☎ Call</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

// Retail is sold by the kilo whatever the listing unit, so a quintal lot's
// 0.005 reads as 500 g, the way the shopper ordered it.
function formatQty(q: number, unit?: string): string {
  const perKg: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };
  const kg = q * (perKg[unit ?? 'KG'] ?? 1);
  if (unit && !perKg[unit]) return `${q} ${unitLabel(unit)}`;
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${+kg.toFixed(2)} kg`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingBottom: 14 },
  sidePad: { paddingHorizontal: 16 },
  sidePadHead: { paddingHorizontal: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  greeting: { fontFamily: font.sans, fontSize: 13.5, color: design.ink3 },
  h1: { marginTop: 2, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink, lineHeight: 32 },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  board: { backgroundColor: colors.forest, borderRadius: 18, padding: 20, overflow: 'hidden' },
  boardLabel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(233,230,220,0.7)' },
  boardValue: { fontFamily: font.sansMed, fontSize: 34, letterSpacing: -0.7, color: '#e9e6dc', marginTop: 4 },
  boardStats: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statN: { fontFamily: font.sansMed, fontSize: 18, color: '#e9e6dc' },
  statHot: { color: '#f0a36f' },
  statL: { fontSize: 11, color: 'rgba(244,241,234,0.6)', marginTop: 1 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 8 },
  count: { fontSize: 11, color: colors.ember },
  warn: { fontSize: 10, letterSpacing: 0.6, color: colors.ember },

  emptyCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 18, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 28 },
  emptyText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink3, textAlign: 'center' },

  order: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16, gap: 12 },
  orderReady: { borderColor: 'rgba(200,96,43,0.4)' },
  orderBuyer: { fontFamily: font.sansBold, fontSize: 15.5, color: design.ink },
  orderMeta: { fontSize: 9.5, letterSpacing: 0.5, color: design.ink3, marginTop: 2 },
  orderTotal: { fontFamily: font.sansBold, fontSize: 17, color: design.ink },
  lines: { backgroundColor: design.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 },
  lineName: { flex: 1, fontFamily: font.sans, fontSize: 13.5, color: design.ink },
  lineQty: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink2 },
  address: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: design.ink2 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: design.paper2, borderRadius: 12, padding: 10 },
  waitingText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, color: design.ink2 },
  actions: { flexDirection: 'row', gap: 10 },
  sendBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.forest, borderRadius: 12, paddingVertical: 12,
  },
  doneBtn: { backgroundColor: design.mint },
  sendText: { fontFamily: font.sansSemi, fontSize: 14, color: '#f4f1ea' },
  doneText: { color: colors.forest },
  callBtn: { borderWidth: 1, borderColor: design.line, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  callText: { fontFamily: font.sansSemi, fontSize: 13.5, color: colors.forest },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickPrimary: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12, backgroundColor: colors.forest,
  },
  quickPrimaryText: { fontFamily: font.sansSemi, fontSize: 14, color: '#f4f1ea' },
  quickGhost: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
  },
  quickGhostText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest },
  pressed: { opacity: 0.85 },
});
