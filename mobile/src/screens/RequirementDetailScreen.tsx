// =============================================================================
// RequirementDetailScreen — one piece of demand, and what each side can do
// =============================================================================
// The board shows enough to decide; this shows everything, and is where the
// offers on a requirement live.
//
//   FARMER — the full terms plus the answer panel (fill or counter).
//   OWNING BUYER — the same terms plus every offer received, each with accept
//     and reject. GET /requirements/:id/offers is BUYER-only and re-checks
//     ownership in the service, so a buyer opening someone else's requirement
//     simply gets no offers list rather than an error page.
//   ANY OTHER BUYER — read-only, with the poster's identity already stripped
//     by the server.
//
// Opens on the row the board already had (route param `preview`) so the screen
// paints immediately, then replaces it with the fetched copy — the board's row
// carries no offers and can be a page old.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../lib/alert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mono } from '../components/buyerKit';
import { Appear, PressScale } from '../components/motion';
import { IconCheck } from '../components/icons';
import { RequirementCard } from '../components/RequirementCard';
import { RequirementAnswerPanel } from '../components/RequirementAnswerPanel';
import { useAuth } from '../context/AuthContext';
import {
  acceptRequirementOffer,
  closeRequirement,
  fetchRequirement,
  offersForRequirement,
  rejectRequirementOffer,
} from '../api/endpoints';
import { errorMessage } from '../api/client';
import { money, timeAgo, unitLabel } from '../lib/format';
import type { BuyerRequirement, RequirementOffer, RequirementOfferStatus } from '../api/types';
import type { DemandStackParamList } from '../navigation/types';
import { colors, design, font } from '../theme';
import { ExportTerms } from '../components/ExportTerms';

// The server's codes, as a seller reads them.
const PAYMENT_LABEL: Record<string, string> = { LC: 'Letter of credit', NET7: 'Within 7 days', NET15: 'Within 15 days' };

type Props = NativeStackScreenProps<DemandStackParamList, 'RequirementDetail'>;

const OFFER_STATUS: Record<RequirementOfferStatus, { label: string; color: string }> = {
  PENDING: { label: 'NEW OFFER', color: colors.ember },
  ACCEPTED: { label: 'ACCEPTED', color: colors.sage },
  REJECTED: { label: 'REJECTED', color: design.ink3 },
  WITHDRAWN: { label: 'WITHDRAWN', color: design.ink3 },
  EXPIRED: { label: 'EXPIRED', color: design.ink3 },
};

export default function RequirementDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { user } = useAuth();

  const [requirement, setRequirement] = useState<BuyerRequirement | null>(preview ?? null);
  const [offers, setOffers] = useState<RequirementOffer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answering, setAnswering] = useState<'fill' | 'counter' | null>(null);

  const isFarmer = user?.role === 'FARMER';
  const isOwner = user?.role === 'BUYER' && requirement?.buyerId === user.id;

  const load = useCallback(async () => {
    try {
      const r = await fetchRequirement(id);
      setRequirement(r);
      setError(null);
      // Only the owning buyer can read the offers; asking as anyone else is a
      // 403 that means nothing to the reader, so it is simply not asked.
      if (user?.role === 'BUYER' && r.buyerId === user.id) {
        try {
          setOffers(await offersForRequirement(id));
        } catch {
          setOffers([]);
        }
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not load this requirement'));
    }
  }, [id, user]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function decide(offer: RequirementOffer, accept: boolean) {
    setBusy(offer.id);
    try {
      if (accept) {
        await acceptRequirementOffer(offer.id);
        Alert.alert('Offer accepted', 'The deal is open. Pay for it from Contracts to start the delivery.');
      } else {
        await rejectRequirementOffer(offer.id);
      }
      await load();
    } catch (e) {
      Alert.alert('Could not do that', errorMessage(e, 'Please try again'));
    } finally {
      setBusy(null);
    }
  }

  function confirmClose() {
    Alert.alert(
      'Withdraw this requirement?',
      'It stops appearing on the board. Offers already accepted are unaffected.',
      [
        { text: 'Keep it open', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeRequirement(id);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Could not withdraw it', errorMessage(e, 'Please try again'));
            }
          },
        },
      ],
    );
  }

  if (!requirement) {
    return (
      <View style={styles.flex}>
        <Text style={styles.error}>{error ?? 'Loading…'}</Text>
      </View>
    );
  }

  const r = requirement;
  const answerable = isFarmer && r.status === 'OPEN' && r.remainingQuantity > 0;
  const pending = offers.filter((o) => o.status === 'PENDING');

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      <RequirementCard requirement={r} showMspWarning={isFarmer}>
        {answerable ? (
          <View style={styles.actions}>
            <PressScale
              onPress={() => setAnswering(answering === 'fill' ? null : 'fill')}
              style={styles.grow}
              cardStyle={[styles.actionBtn, styles.actionPrimary]}
            >
              <Text style={[styles.actionText, styles.actionTextPrimary]}>
                Fill at {money(r.pricePerUnit, r.currency)}
              </Text>
            </PressScale>
            <PressScale
              onPress={() => setAnswering(answering === 'counter' ? null : 'counter')}
              style={styles.grow}
              cardStyle={styles.actionBtn}
            >
              <Text style={styles.actionText}>Counter</Text>
            </PressScale>
          </View>
        ) : null}

        {answerable && answering ? (
          <RequirementAnswerPanel
            requirement={r}
            mode={answering}
            onClose={() => setAnswering(null)}
            onDone={() => { setAnswering(null); void load(); }}
          />
        ) : null}
      </RequirementCard>

      {/* Terms the card has no room for. Blank ones are left out rather than
          printed as an em dash — an absent payment term is not a term. */}
      {/* What an export request asks of the seller. Nothing for any other. */}
      <ExportTerms r={r} />

      {r.paymentTerms || r.deliveryTerms ? (
        <View style={styles.card}>
          <Mono style={styles.eyebrow}>TERMS</Mono>
          {r.paymentTerms ? <Term label="Payment" value={PAYMENT_LABEL[r.paymentTerms] ?? r.paymentTerms} /> : null}
          {r.deliveryTerms ? <Term label="Delivery" value={r.deliveryTerms} /> : null}
        </View>
      ) : null}

      {isOwner ? (
        <View style={styles.card}>
          <Mono style={styles.eyebrow}>
            {offers.length === 0
              ? 'OFFERS'
              : `OFFERS · ${offers.length}${pending.length ? ` · ${pending.length} AWAITING YOU` : ''}`}
          </Mono>

          {offers.length === 0 ? (
            <Text style={styles.emptyOffers}>
              No offers yet. Sellers who can supply this see it on the demand board, and the closest have been told.
            </Text>
          ) : (
            offers.map((o, i) => {
              const unit = unitLabel(r.unit);
              // Their price against the one posted: the comparison a buyer makes
              // before deciding, done for them.
              const diff = o.pricePerUnit - r.pricePerUnit;
              const pct = r.pricePerUnit > 0 ? Math.round((Math.abs(diff) / r.pricePerUnit) * 100) : 0;
              return (
                <Appear key={o.id} index={i}>
                  <View style={[styles.offer, o.status === 'PENDING' && styles.offerNew]}>
                    <View style={styles.offerHead}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(o.farmer?.name ?? 'S')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.offerWho} numberOfLines={1}>{o.farmer?.name ?? 'A seller'}</Text>
                        <Text style={styles.offerMeta}>
                          {o.farmer?.trustScore != null ? `Trust ${Math.round(o.farmer.trustScore)} · ` : ''}{timeAgo(o.createdAt)}
                        </Text>
                      </View>
                      <Mono style={[styles.offerStatus, { color: OFFER_STATUS[o.status].color }]}>
                        ● {OFFER_STATUS[o.status].label}
                      </Mono>
                    </View>

                    <View style={styles.offerBox}>
                      <View style={{ flex: 1.3, minWidth: 0 }}>
                        <Mono style={styles.boxLabel}>THEY ASK</Mono>
                        <Text style={styles.offerPrice}>
                          {money(o.pricePerUnit, o.currency)}<Text style={styles.offerUnit}> /{unit}</Text>
                        </Text>
                        {o.kind === 'INSTANT' || diff === 0 ? (
                          <View style={[styles.verdict, styles.verdictGood]}>
                            <Text style={[styles.verdictText, styles.verdictTextGood]}>Your price</Text>
                          </View>
                        ) : (
                          <View style={[styles.verdict, diff > 0 ? styles.verdictHigh : styles.verdictGood]}>
                            <Text style={[styles.verdictText, diff > 0 ? styles.verdictTextHigh : styles.verdictTextGood]}>
                              {money(Math.abs(diff), o.currency)} ({pct}%) {diff > 0 ? 'above' : 'below'} yours
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.boxSide}>
                        <View>
                          <Mono style={styles.boxLabel}>QUANTITY</Mono>
                          <Text style={styles.boxVal}>{o.quantity.toLocaleString('en-IN')} {unit}</Text>
                        </View>
                        <View>
                          <Mono style={styles.boxLabel}>TOTAL</Mono>
                          <Text style={styles.boxVal}>{money(o.totalAmount, o.currency)}</Text>
                        </View>
                      </View>
                    </View>

                    {o.message ? <Text style={styles.offerMessage}>“{o.message}”</Text> : null}

                    {/* Only a PENDING counter is still a decision. An INSTANT fill
                        arrives already accepted: the deal closed when it was made. */}
                    {o.status === 'PENDING' ? (
                      <View style={styles.offerBtns}>
                        <PressScale
                          onPress={busy ? undefined : () => decide(o, true)}
                          style={styles.grow}
                          cardStyle={[styles.actionBtn, styles.actionPrimary, styles.offerBtnTall, busy === o.id && styles.dim]}
                        >
                          <View style={styles.btnRow}>
                            <IconCheck size={15} stroke={colors.textInverse} />
                            <Text style={[styles.actionText, styles.actionTextPrimary]}>
                              Accept {money(o.totalAmount, o.currency)}
                            </Text>
                          </View>
                        </PressScale>
                        <PressScale
                          onPress={busy ? undefined : () => decide(o, false)}
                          style={styles.reject}
                          cardStyle={[styles.actionBtn, styles.rejectBtn, styles.offerBtnTall, busy === o.id && styles.dim]}
                        >
                          <Text style={[styles.actionText, styles.rejectText]}>Decline</Text>
                        </PressScale>
                      </View>
                    ) : null}
                  </View>
                </Appear>
              );
            })
          )}
        </View>
      ) : null}

      {isOwner && r.status === 'OPEN' ? (
        <PressScale onPress={confirmClose} cardStyle={styles.withdraw}>
          <Text style={styles.withdrawText}>Withdraw this requirement</Text>
        </PressScale>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.termRow}>
      <Text style={styles.termLabel}>{label}</Text>
      <Text style={styles.termValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  body: { padding: 14, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 10 },

  termRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5 },
  termLabel: { fontFamily: font.sans, fontSize: 13, color: design.ink3 },
  termValue: { flex: 1, fontFamily: font.sansMed, fontSize: 13, color: design.ink, textAlign: 'right' },

  actions: { flexDirection: 'row', gap: 9 },
  actionBtn: {
    flex: 1,
    borderWidth: 1.3,
    borderColor: colors.forest,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.forest },
  actionText: { fontFamily: font.sansBold, fontSize: 13, color: colors.forest },
  actionTextPrimary: { color: colors.textInverse },
  dim: { opacity: 0.55 },

  emptyOffers: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3 },
  grow: { flex: 1 },
  offer: {
    borderWidth: 1, borderColor: design.line, borderRadius: 16,
    padding: 14, marginTop: 10, gap: 12, backgroundColor: design.paper,
  },
  offerNew: { borderColor: 'rgba(200,96,43,0.35)' },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  avatarText: { fontFamily: font.sansBold, fontSize: 15, color: colors.forest },
  offerWho: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  offerStatus: { fontSize: 9, letterSpacing: 0.6 },
  offerMeta: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 1 },
  offerBox: { flexDirection: 'row', gap: 12, backgroundColor: design.bg, borderRadius: 14, padding: 12 },
  boxLabel: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  offerPrice: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.5, color: design.ink, marginTop: 2 },
  offerUnit: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3 },
  boxSide: { flex: 1, gap: 8, borderLeftWidth: 1, borderLeftColor: design.line, paddingLeft: 12 },
  boxVal: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 2 },
  verdict: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
  verdictGood: { backgroundColor: design.mint },
  verdictHigh: { backgroundColor: 'rgba(200,96,43,0.12)' },
  verdictText: { fontFamily: font.sansSemi, fontSize: 11 },
  verdictTextGood: { color: colors.forest },
  verdictTextHigh: { color: colors.ember },
  offerMessage: {
    fontFamily: font.sans, fontStyle: 'italic', fontSize: 13, lineHeight: 19, color: design.ink2,
    borderLeftWidth: 2, borderLeftColor: design.mint, paddingLeft: 10,
  },
  offerBtns: { flexDirection: 'row', gap: 9 },
  offerBtnTall: { paddingVertical: 13, borderRadius: 13 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reject: { flex: 0.6 },
  rejectBtn: { borderColor: 'rgba(200,96,43,0.35)' },
  rejectText: { color: colors.ember },

  withdraw: { alignItems: 'center', paddingVertical: 14 },
  withdrawText: { fontFamily: font.sansSemi, fontSize: 13.5, color: colors.ember },

  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.error, padding: 16 },
});
