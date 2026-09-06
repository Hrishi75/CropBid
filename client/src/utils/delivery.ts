// =============================================================================
// Delivery lanes — how soon a shopper's order can actually arrive
// =============================================================================
// Retail has two genuinely different supply lines behind it, and pretending
// otherwise is what makes a storefront lie:
//
//   QUICK         A neighbourhood shop already holding the stock a few streets
//                 away. Someone can pick it up and bring it round the same day.
//
//   NEXT_MORNING  A farmer, who has to harvest, pack and send it in. That is a
//                 morning run, not an afternoon errand — and the produce is
//                 better for it, because it is picked for this order rather
//                 than pulled off a shelf it has been sitting on.
//
// The lane is DERIVED from who is selling, never stored. It is a function of
// SellerType and nothing else, so storing it would create a second copy that
// can disagree with the first. LOCAL_SHOP is documented in the schema as
// "Neighbourhood shop holding same-day stock", which is this distinction
// already written down; this file only gives it a name and shopper-facing copy.
//
// WHOLESALER sits with the farmer: a bulk seller is filling an order, not
// handing something over the counter, and promising a household two hours from
// one would be a promise nobody can keep.
// =============================================================================

import type { SellerType } from '../types';

export type DeliveryLane = 'QUICK' | 'NEXT_MORNING';

export interface LaneMeta {
  lane: DeliveryLane;
  /** Short badge, for a card corner. */
  badge: string;
  /** The heading a section of results sits under. */
  title: string;
  /** The promise, in full, for a shop page or a bill line. */
  promise: string;
  /** Why this lane is slower or faster — shown once per section, not per card. */
  rationale: string;
  color: string;
}

export const LANES: Record<DeliveryLane, LaneMeta> = {
  QUICK: {
    lane: 'QUICK',
    badge: 'Today',
    title: 'Quick delivery',
    promise: 'Arrives today',
    rationale:
      'Shops near you that already have it in stock. Someone brings it round the same day.',
    color: 'var(--cb-sage)',
  },
  NEXT_MORNING: {
    lane: 'NEXT_MORNING',
    badge: 'Tomorrow AM',
    title: 'Straight from the farm',
    promise: 'At your door tomorrow morning',
    rationale:
      'Picked for your order after you place it and sent in overnight, so it reaches you tomorrow morning. A day slower than a shop, and fresher for it.',
    color: 'var(--cb-wheat)',
  },
};

/**
 * Which lane a seller delivers on.
 *
 * Defaults to NEXT_MORNING when the seller is unknown — a cart row restored
 * from storage before this existed, say. Erring slow is the only safe default:
 * promising same-day and missing it is worse than promising tomorrow and
 * arriving today.
 */
export function laneFor(sellerType: SellerType | null | undefined): DeliveryLane {
  return sellerType === 'LOCAL_SHOP' ? 'QUICK' : 'NEXT_MORNING';
}

export function laneMeta(sellerType: SellerType | null | undefined): LaneMeta {
  return LANES[laneFor(sellerType)];
}
