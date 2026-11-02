// =============================================================================
// Who pays for delivery on a trade deal
// =============================================================================
// CropBid books the carrier on every trade deal (CLAUDE.md §2a). Who PAYS for
// it is a term of the deal, agreed before the seller accepts:
//
//   FARMER  the seller pays it all (the default, and every deal before this)
//   SPLIT   half each, always 50/50
//   BUYER   the buyer pays it all
//
// The seller sets it on the listing; a buyer's bid can propose different
// terms, and accepting the bid accepts them. The bid carries its own copy, so a
// seller editing the listing later cannot change what a pending bid offered.
//
// The amount is not known when the deal closes: ops quote it first. A buyer
// with a share pays the goods and their share in ONE payment, so the buyer
// cannot pay until the quote is in, and the quote cannot change once the buyer
// has opened that payment or a carrier is booked.
//
// Delivery never enters the 2% fee basis. The fee is on the goods.
// =============================================================================

import { ApiError } from './ApiError';

export const FREIGHT_PAYERS = ['FARMER', 'SPLIT', 'BUYER'] as const;
export type FreightPayer = (typeof FREIGHT_PAYERS)[number];

// A ceiling on a typed-in quote, so a slipped key cannot put a crore on a bill.
export const MAX_FREIGHT_QUOTE = 500_000;

/** Undefined when absent; a 400 when present and not one of the three. */
export function parseFreightPayer(value: unknown): FreightPayer | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (FREIGHT_PAYERS as readonly string[]).includes(value)) {
    return value as FreightPayer;
  }
  throw new ApiError(400, 'Delivery terms must be FARMER (seller pays), SPLIT (half each) or BUYER (buyer pays)');
}

/** Whether the buyer owes anything towards delivery on these terms. */
export function buyerPaysFreight(paidBy: string): boolean {
  return paidBy === 'BUYER' || paidBy === 'SPLIT';
}

/**
 * Each side's share of a quote, in rupees to the paisa. The buyer's half is
 * rounded and the seller takes the rest, so the two always add up to the quote.
 */
export function freightShares(paidBy: string, quote: number | null | undefined): { buyer: number; seller: number } {
  const total = Math.round((quote ?? 0) * 100) / 100;
  if (paidBy === 'BUYER') return { buyer: total, seller: 0 };
  if (paidBy === 'SPLIT') {
    const buyer = Math.round(total * 50) / 100;
    return { buyer, seller: Math.round((total - buyer) * 100) / 100 };
  }
  return { buyer: 0, seller: total };
}

/** What the buyer pays for a trade deal: the goods plus their share of delivery. */
export function buyerPayable(tx: { totalAmount: number; freightPaidBy: string; freightQuote: number | null }): number {
  return Math.round((tx.totalAmount + freightShares(tx.freightPaidBy, tx.freightQuote).buyer) * 100) / 100;
}
