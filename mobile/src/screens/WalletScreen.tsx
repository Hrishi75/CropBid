// =============================================================================
// WalletScreen — the credit balance, and where it came from
// =============================================================================
// 1 CREDIT IS 1 RUPEE. No exchange rate, no bonus multiplier, no expiry, so the
// screen never has to explain a conversion. If credits ever stop being rupees,
// that is a pricing decision and this screen will need a lot more copy.
//
// WHAT IT SAYS THAT MOST WALLETS DO NOT: credits cannot pay for an order yet.
// The server has `spend()` and nothing calls it, because paying with credits
// changes escrow, refunds and the fee basis. A wallet that quietly implied
// otherwise would take real money for something that does not work, so the
// state is on the screen, above the top-up button, in plain words.
//
// The statement is the ledger, not a derived summary. Every row carries the
// balance straight after it, so a row is readable on its own without adding up
// everything above it.
// =============================================================================

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import RazorpayCheckout, { type CheckoutOrder, type Handshake } from '../components/RazorpayCheckout';
import { Mono } from '../components/buyerKit';
import { IconWallet } from '../components/icons';
import { PressScale } from '../components/motion';
import {
  createWalletTopup,
  fetchWallet,
  verifyWalletTopup,
  walletEntries,
} from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Wallet, WalletEntry } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { money, timeAgo } from '../lib/format';
import { colors, design, font, radius, spacing } from '../theme';

/**
 * The amounts offered as one tap.
 *
 * Round numbers a household actually thinks in, and the smallest is the
 * server's own floor so a preset can never be rejected by the endpoint behind
 * it. A custom field takes anything between the floor and the ceiling.
 */
const PRESETS = [100, 250, 500, 1000, 2000];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [starting, setStarting] = useState(false);
  // Non-null opens the Razorpay modal.
  const [order, setOrder] = useState<CheckoutOrder | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Together, because a balance without its statement is half a screen and
      // two spinners landing at different times reads as a glitch.
      const [w, page] = await Promise.all([fetchWallet(), walletEntries()]);
      setWallet(w);
      setEntries(page.entries);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your wallet.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // On focus, not just on mount: coming back from a top-up must show the money.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function startTopup(amount: number) {
    if (starting) return;
    setStarting(true);
    try {
      const created = await createWalletTopup(amount);
      // Shaped for the checkout modal.
      setOrder({
        orderId: created.orderId,
        // Razorpay's own field is paise, and that is what checkout.js expects.
        amount: Math.round(created.amount * 100),
        currency: created.currency,
        keyId: created.keyId,
      });
    } catch (e) {
      Alert.alert(t('Could not start the top-up'), errorMessage(e, 'Please try again.'));
    } finally {
      setStarting(false);
    }
  }

  function onCustom() {
    const value = Number(custom);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(t('Enter an amount'), t('Type how much you want to add.'));
      return;
    }
    // Checked here for a quick answer, and again on the server, which is the
    // one that counts. The limits come from the API rather than being repeated
    // as constants that can drift out of step with it.
    const min = wallet?.limits.min ?? 100;
    const max = wallet?.limits.max ?? 50_000;
    if (value < min || value > max) {
      Alert.alert(
        t('Outside the limits'),
        `${t('Add between')} ₹${min} ${t('and')} ₹${max.toLocaleString('en-IN')}.`,
      );
      return;
    }
    setCustom('');
    void startTopup(value);
  }

  const currency = wallet?.currency ?? user?.currency ?? 'INR';

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.sage}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Balance, on the brand's dark green. It is the one number the
                screen exists for, so nothing competes with it. */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <IconWallet size={16} stroke={colors.sage2} />
                <Mono style={styles.heroLabel}>{t('CREDIT BALANCE')}</Mono>
              </View>
              <Text style={styles.balance}>
                {loading && wallet == null ? '···' : money(wallet?.balance ?? 0, currency)}
              </Text>
              {/* Said once, here, because it is the fact that changes what a
                  shopper would do next. */}
              <Text style={styles.heroNote}>
                {wallet?.canSpend
                  ? t('Use your credits at checkout.')
                  : t('Credits sit here for now. Paying with them at checkout is not switched on yet.')}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => { setLoading(true); void load(); }}>
                  <Text style={styles.retry}>{t('Try again')}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.section}>
              <Mono style={styles.sectionLabel}>{t('ADD CREDITS')}</Mono>
              <View style={styles.presets}>
                {PRESETS.map((amount) => (
                  <PressScale
                    key={amount}
                    onPress={() => void startTopup(amount)}
                    scaleTo={0.95}
                    style={styles.presetSlot}
                    cardStyle={styles.preset}
                  >
                    <Text style={styles.presetText}>₹{amount.toLocaleString('en-IN')}</Text>
                  </PressScale>
                ))}
              </View>

              <View style={styles.customRow}>
                <TextInput
                  value={custom}
                  onChangeText={(v) => setCustom(v.replace(/[^0-9]/g, ''))}
                  placeholder={t('Other amount')}
                  placeholderTextColor={design.ink3}
                  keyboardType="number-pad"
                  style={styles.customInput}
                />
                <Pressable
                  onPress={onCustom}
                  disabled={starting || custom === ''}
                  style={({ pressed }) => [
                    styles.addBtn,
                    (starting || custom === '') && styles.addBtnOff,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.addBtnText}>{starting ? t('Opening…') : t('Add')}</Text>
                </Pressable>
              </View>

              <Text style={styles.limits}>
                {wallet
                  ? `${t('Between')} ₹${wallet.limits.min} ${t('and')} ₹${wallet.limits.max.toLocaleString('en-IN')} ${t('per top-up')}. 1 ${t('credit')} = ₹1.`
                  : ' '}
              </Text>
            </View>

            <View style={styles.historyHead}>
              <Mono style={styles.sectionLabel}>{t('HISTORY')}</Mono>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('Nothing yet')}</Text>
              <Text style={styles.emptyBody}>
                {t('Every top-up and every spend shows up here, newest first.')}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <EntryRow entry={item} currency={currency} />}
      />

      {/* The same WebView checkout an order uses, pointed at the wallet's own
          verify. The amount credited is read from Razorpay server-side, so
          nothing this screen sends decides how much lands. */}
      <RazorpayCheckout<{ balance: number; currency: string }>
        order={order}
        prefill={{ name: user?.name, email: user?.email ?? undefined, contact: user?.phone ?? undefined }}
        verify={(h: Handshake) => verifyWalletTopup({
          razorpayOrderId: h.razorpay_order_id,
          razorpayPaymentId: h.razorpay_payment_id,
          razorpaySignature: h.razorpay_signature,
        })}
        onPaid={(result) => {
          setOrder(null);
          // Paint the new balance immediately, then refetch for the statement.
          setWallet((w) => (w ? { ...w, balance: result.balance } : w));
          void load();
        }}
        onClose={(err) => {
          setOrder(null);
          // A dismissal is not a failure, so only a real message is shown. But
          // reload either way: the payment may have gone through and only the
          // verify leg failed, and the balance is the thing that settles it.
          if (err) Alert.alert(t('Top-up'), err);
          void load();
        }}
      />
    </View>
  );
}

function EntryRow({ entry, currency }: { entry: WalletEntry; currency: string }) {
  const added = entry.amount >= 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowNote} numberOfLines={1}>
          {entry.note ?? LABEL[entry.type]}
        </Text>
        <Mono style={styles.rowMeta}>
          {timeAgo(entry.createdAt)} · {LABEL[entry.type]}
        </Mono>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, added ? styles.added : styles.taken]}>
          {added ? '+' : '−'}{money(Math.abs(entry.amount), currency)}
        </Text>
        {/* The running total, so a row does not need the rows above it. */}
        <Mono style={styles.rowBalance}>{money(entry.balanceAfter, currency)}</Mono>
      </View>
    </View>
  );
}

const LABEL: Record<WalletEntry['type'], string> = {
  TOPUP: 'Added',
  SPEND: 'Spent',
  REFUND: 'Refunded',
  ADJUSTMENT: 'Adjusted',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },

  hero: {
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroLabel: { fontSize: 10, letterSpacing: 1.2, color: colors.sage2 },
  balance: { fontFamily: font.sansBold, fontSize: 40, color: colors.surface, letterSpacing: -1, marginTop: 6 },
  heroNote: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: colors.sage2, marginTop: spacing.sm },

  errorBox: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  errorText: { fontFamily: font.sans, fontSize: 14, color: colors.ember },
  retry: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest, textDecorationLine: 'underline', marginTop: 4 },

  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  sectionLabel: { fontSize: 10, letterSpacing: 1.2, color: design.ink3, marginBottom: spacing.md },
  // The statement needs air above it, or the last preset and the first row read as one block.
  historyHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xs },

  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // An even three-per-row grid. Content-width pills packed 4 then 1, so the
  // last one sat alone against the left edge under three neighbours of three
  // different widths, which reads as a layout that broke rather than a choice.
  presetSlot: { flexBasis: '31%', flexGrow: 1 },
  preset: {
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingVertical: 11, alignItems: 'center', backgroundColor: design.paper,
  },
  presetText: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },

  customRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  customInput: {
    flex: 1,
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 46,
    fontFamily: font.sans, fontSize: 15, color: design.ink,
  },
  addBtn: {
    backgroundColor: colors.forest, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, height: 46,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  limits: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: spacing.sm },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: design.lineLight,
  },
  rowLeft: { flex: 1, paddingRight: spacing.md },
  rowNote: { fontFamily: font.sansMed, fontSize: 14.5, color: design.ink },
  rowMeta: { fontSize: 11, color: design.ink3, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowAmount: { fontFamily: font.sansSemi, fontSize: 15 },
  added: { color: colors.sage },
  taken: { color: design.ink },
  rowBalance: { fontSize: 11, color: design.ink3, marginTop: 2 },

  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  emptyTitle: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  emptyBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3, marginTop: 4 },
});
