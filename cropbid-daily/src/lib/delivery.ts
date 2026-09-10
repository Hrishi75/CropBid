// =============================================================================
// Delivery lanes — Quick and Fresh
// =============================================================================
// Retail has two genuinely different supply lines behind it, and pretending
// otherwise is what makes a storefront lie. Daily now names them, because a
// shopper has to be able to CHOOSE one rather than discover it per card:
//
//   QUICK   A neighbourhood shop already holding the stock a few streets away.
//           Someone picks it up and brings it round the same day.
//
//   FRESH   The morning mandi run, and a BATCH rather than a speed. Everything
//           ordered during one day is bought together at the next morning's
//           mandi and delivered that morning, so it reaches the shopper the day
//           it was traded rather than after sitting on a shelf. Slower than
//           Quick, and fresher for being slower. The cutoff is real: see
//           lib/freshWindow.ts.
//
// The trade is the whole point of showing both. Neither lane is the better one,
// so the picker presents them side by side rather than defaulting to one and
// burying the other.
//
// THE LANE IS DERIVED from who is selling, never stored. It is a function of
// SellerType and nothing else, so a stored copy could only disagree.
//
// NAMING: the web client calls this second lane NEXT_MORNING
// (client/src/utils/delivery.ts). Daily calls it FRESH because the word is on
// screen here, as a tab a shopper taps. If the web ever grows the same picker,
// the two should be reconciled rather than left as synonyms.
// =============================================================================

import type { SellerType } from '../api/types';
import { colors } from '../theme';

export type DeliveryLane = 'QUICK' | 'FRESH';

export interface LaneMeta {
  lane: DeliveryLane;
  /** The tab, and the heading a section sits under. One word. */
  title: string;
  /** Short badge, for a card corner. */
  badge: string;
  /** The promise, in full, for a shop page. */
  promise: string;
  /** Why this lane is slower or faster. Shown once, under the tabs. */
  rationale: string;
  color: string;
}

export const LANES: Record<DeliveryLane, LaneMeta> = {
  QUICK: {
    lane: 'QUICK',
    title: 'Quick',
    badge: 'Today',
    promise: 'Arrives today',
    rationale: 'Shops near you that already have it in stock, brought round the same day.',
    color: colors.sage,
  },
  FRESH: {
    lane: 'FRESH',
    title: 'Fresh',
    badge: 'Tomorrow AM',
    promise: 'From the mandi, at your door next morning',
    rationale: 'Order before midnight and it is bought at the next morning mandi and delivered that morning.',
    color: colors.wheat,
  },
};

/** The two lanes in the order the picker shows them. */
export const LANE_ORDER: DeliveryLane[] = ['QUICK', 'FRESH'];

/**
 * Which lane a seller delivers on.
 *
 * Defaults to FRESH when the seller is unknown. Erring slow is the only safe
 * default: promising same-day and missing it is worse than promising tomorrow
 * and arriving today.
 *
 * KNOWN MISMATCH, and it is in the data rather than here. FRESH is now sold as
 * the morning mandi run, but the schema has no mandi source: the only mandi in
 * it is a comment on the QUINTAL unit, and AGMARKNET supplies reference PRICES,
 * not stock. So this lane still resolves to whoever is not a LOCAL_SHOP, which
 * today means individual farm and wholesaler sellers. A card in the Fresh tab
 * can therefore read "Farm" underneath a promise that says mandi.
 *
 * Making the promise true needs a real source on the listing (a mandi id, or a
 * flag saying CropBid sourced this lot), not a rewording here.
 */
export function laneFor(sellerType: SellerType | null | undefined): DeliveryLane {
  return sellerType === 'LOCAL_SHOP' ? 'QUICK' : 'FRESH';
}

export function laneMeta(sellerType: SellerType | null | undefined): LaneMeta {
  return LANES[laneFor(sellerType)];
}

/** "Vegetable shop", "Kirana store". Falls back to the seller kind. */
export function shopTypeLabel(shopType: string | null, sellerType: SellerType): string {
  if (shopType) {
    const map: Record<string, string> = {
      vegetable: 'Vegetable shop',
      kirana: 'Kirana store',
      general: 'General store',
      fruit: 'Fruit shop',
      dairy: 'Dairy',
    };
    return map[shopType] ?? `${shopType[0].toUpperCase()}${shopType.slice(1)} shop`;
  }
  if (sellerType === 'FARMER') return 'Farm';
  if (sellerType === 'WHOLESALER') return 'Wholesaler';
  return 'Shop';
}
