// =============================================================================
// Who pays for delivery on a trade deal: the words for it
// =============================================================================
// The rule and the arithmetic live on the server (server/src/utils/freight.ts),
// which also sends each deal's shares worked out (Transaction.freight). This
// file is only how the three terms read, so the listing form, the bid form,
// the seller's bid card and the deal page all say the same thing.
// =============================================================================

import type { PaidBy } from '../types';

export const FREIGHT_OPTIONS: { value: PaidBy; label: string; short: string; hint: string }[] = [
  { value: 'FARMER', label: 'Seller pays delivery', short: 'Seller pays', hint: 'Taken from the seller’s payout once the truck is booked.' },
  { value: 'SPLIT', label: 'Split delivery 50/50', short: 'Split 50/50', hint: 'Half added to what the buyer pays, half taken from the seller’s payout.' },
  { value: 'BUYER', label: 'Buyer pays delivery', short: 'Buyer pays', hint: 'Added to what the buyer pays, on top of the goods.' },
];

export function freightLabel(paidBy: PaidBy | null | undefined): string {
  return FREIGHT_OPTIONS.find((o) => o.value === (paidBy ?? 'FARMER'))!.label;
}

export function freightShort(paidBy: PaidBy | null | undefined): string {
  return FREIGHT_OPTIONS.find((o) => o.value === (paidBy ?? 'FARMER'))!.short;
}

/** Whether the buyer owes anything towards delivery on these terms. */
export function buyerPaysFreight(paidBy: PaidBy | null | undefined): boolean {
  return paidBy === 'BUYER' || paidBy === 'SPLIT';
}
