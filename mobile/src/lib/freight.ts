// =============================================================================
// Who pays for delivery on a trade deal: the words for it, in the app
// =============================================================================
// The rule and the arithmetic live on the server (server/src/utils/freight.ts),
// which sends each deal's shares worked out (Transaction.freight). This file
// is how the three terms read, the same as client/src/utils/freight.ts, plus
// the "deal made" note each side is shown once per deal.
// =============================================================================

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { FreightPayer, Transaction } from '../api/types';
import { money } from './format';

export const FREIGHT_OPTIONS: { value: FreightPayer; label: string; short: string }[] = [
  { value: 'FARMER', label: 'Seller pays delivery', short: 'Seller pays' },
  { value: 'SPLIT', label: 'Split delivery 50/50', short: 'Split 50/50' },
  { value: 'BUYER', label: 'Buyer pays delivery', short: 'Buyer pays' },
];

export function freightLabel(paidBy?: FreightPayer | null): string {
  return FREIGHT_OPTIONS.find((o) => o.value === (paidBy ?? 'FARMER'))!.label;
}

export function buyerPaysFreight(paidBy?: FreightPayer | null): boolean {
  return paidBy === 'BUYER' || paidBy === 'SPLIT';
}

/** What the buyer pays now: goods plus their share. Null while unquoted. */
export function buyerPayable(tx: Transaction): number | null {
  if (tx.retailOrder || !tx.freight) return tx.totalAmount;
  return tx.freight.buyerPays;
}

/** The "deal made" note for one side: what was agreed and what happens next. */
export function dealMadeText(tx: Transaction, side: 'BUYER' | 'SELLER'): { title: string; body: string } {
  const paidBy = tx.freight?.paidBy ?? tx.freightPaidBy ?? 'FARMER';
  const f = tx.freight;
  const head = `${tx.listing?.cropName ?? 'Deal'}: ${money(tx.totalAmount, tx.currency)}. Delivery: ${freightLabel(paidBy).toLowerCase()}. CropBid books the truck.`;
  let next: string;
  if (side === 'SELLER') {
    next = paidBy === 'FARMER'
      ? 'The buyer pays into escrow. The delivery charge comes out of your payout once the truck is booked.'
      : paidBy === 'SPLIT'
        ? 'CropBid prices the delivery; you and the buyer pay half each, yours from your payout. The buyer pays once it is quoted.'
        : 'CropBid prices the delivery and the buyer pays all of it with the goods.';
  } else if (paidBy === 'FARMER') {
    next = `Pay ${money(tx.totalAmount, tx.currency)} into escrow now. The seller pays the delivery.`;
  } else if (f?.awaitingQuote) {
    next = 'CropBid is pricing the delivery. We will tell you when it is in; then you pay the goods and your share together.';
  } else {
    next = `Pay ${money(f?.buyerPays ?? tx.totalAmount, tx.currency)}: the goods and your share of delivery, in one payment.`;
  }
  return {
    title: side === 'BUYER' ? 'The seller accepted your bid' : 'Deal made',
    body: `${head}\n\n${next}`,
  };
}

// Seen-once flags, on this device, in the same store as lib/prefs. Losing
// one only means the note shows once more.
const seenKey = (txId: string, userId: string) => `cropbid.dealMade.${userId}.${txId}`.replace(/[^A-Za-z0-9._-]/g, '_');

export async function dealMadeSeen(txId: string, userId: string): Promise<boolean> {
  const key = seenKey(txId, userId);
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) === '1'; } catch { return false; }
  }
  try { return (await SecureStore.getItemAsync(key)) === '1'; } catch { return false; }
}

export async function markDealMadeSeen(txId: string, userId: string): Promise<void> {
  const key = seenKey(txId, userId);
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, '1'); } catch { /* private mode */ }
    return;
  }
  try { await SecureStore.setItemAsync(key, '1'); } catch { /* locked keystore */ }
}
