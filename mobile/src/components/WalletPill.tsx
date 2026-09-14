// =============================================================================
// WalletPill — the credit balance, in the storefront header
// =============================================================================
// Sits beside the language pill. Shows the balance and opens the wallet.
//
// SIGNED-IN ONLY, and it renders nothing otherwise rather than showing ₹0 to a
// stranger. A zero balance on an account that does not exist is not a fact
// about anything, and it invites a tap that can only end at a login wall.
//
// It shows the last known balance while refetching, so switching back to Home
// does not blink the number away and back. There is no push channel for a
// balance, so it refetches on focus: a top-up finished on the wallet screen has
// to be visible here the moment the shopper returns, and polling for something
// that changes a few times a year would be waste.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { PressScale } from './motion';
import { IconWallet } from './icons';
import { fetchWallet } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, design, font } from '../theme';

/**
 * A balance, short enough for a header.
 *
 * Thousands become "1.2k" because the pill sits next to a wordmark and a
 * language chip on a 375pt screen, and "₹12,500" pushes the row into a wrap.
 * Below 1000 it is exact, and paise are dropped: a header is a glance, and the
 * wallet screen has the precise figure.
 */
export function shortBalance(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    // One decimal, but not a trailing ".0": 5k reads better than 5.0k.
    return `₹${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `₹${Math.floor(value)}`;
}

export function WalletPill() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      fetchWallet()
        .then((w) => { if (!cancelled) setBalance(w.balance); })
        // Left as it was. A header chip is not the place to report a failed
        // fetch, and blanking a balance that was on screen a second ago reads
        // as the money having gone somewhere.
        .catch(() => {});
      return () => { cancelled = true; };
    }, [user]),
  );

  if (!user) return null;

  return (
    <PressScale onPress={() => nav.navigate('Wallet')} scaleTo={0.92} cardStyle={styles.pill}>
      <View style={styles.row}>
        <IconWallet size={13} stroke={colors.forest} />
        {/* An em space, not a number, until the first fetch lands. A "₹0" that
            turns into "₹500" half a second later is a worse lie than a gap. */}
        <Text style={styles.text}>{balance == null ? ' ' : shortBalance(balance)}</Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: design.paper,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  text: { fontFamily: font.sansSemi, fontSize: 12, color: design.ink },
});
