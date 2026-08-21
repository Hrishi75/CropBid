// =============================================================================
// cartLines — the basket, checked against what is actually for sale
// =============================================================================
// CartContext stores a snapshot taken when each lot went in. A basket outlives
// that snapshot: over a weekend a lot can sell out, be re-priced, be pulled
// from retail, or drop below the quantity the shopper picked. Billing a
// shopper off the snapshot would mean a total on screen that the server then
// refuses — the worst place to find out.
//
// So both the cart and the checkout run every row past GET /listings/:id
// before showing a price. What comes back is a LINE: the basket row, the live
// listing, the live line total, and — if it can no longer be bought — the one
// sentence explaining why. Unbuyable lines stay visible and are excluded from
// the bill, rather than disappearing and quietly changing the total.
//
// Fetched per-row because there is no by-ids endpoint, and a household basket
// is a handful of rows, not a page of them. allSettled, because one dead lot
// must not blank out the other four.
// =============================================================================

import { useEffect, useState } from 'react';
import api from '../../lib/axios';
import type { CartItem } from '../../context/CartContext';
import type { Listing } from '../../types';

export interface CartLine {
  item: CartItem;
  /** Null when the lot could not be fetched at all (deleted, or the API failed). */
  listing: Listing | null;
  /** Live retail price. Falls back to the snapshot only so a line always renders. */
  price: number;
  quantity: number;
  lineTotal: number;
  /** Why this line cannot be ordered right now. Null means it can. */
  problem: string | null;
  /** True when the live price differs from the one the shopper last saw. */
  repriced: boolean;
}

export interface CartTotals {
  lines: CartLine[];
  orderable: CartLine[];
  /** Sum of the orderable lines. Unbuyable rows never reach the bill. */
  itemsTotal: number;
  /** Charged to the shopper today: nothing. The grower delivers locally. */
  deliveryFee: number;
  toPay: number;
  currency: string;
  /** One order per lot — see the note in Checkout for why this is not one basket-wide order. */
  orderCount: number;
  loading: boolean;
  /** Re-runs the check. Used after an order is placed to reprice what is left. */
  reload: () => void;
}

// Everything that can stop one row from being ordered, answered once so the
// cart, the checkout and the place-order guard all give the same reason.
function problemWith(item: CartItem, listing: Listing | null, city: string): string | null {
  if (!listing) return 'This lot is no longer available.';
  if (!listing.directSaleEnabled || listing.retailPricePerUnit == null) {
    return 'This lot is sold in bulk only.';
  }
  if (listing.status !== 'ACTIVE') return 'Sold out.';
  if (listing.remainingQuantity <= 0) return 'Sold out.';
  if (city !== '' && listing.location.toLowerCase() !== city.toLowerCase()) {
    return `Ships from ${listing.location}, and you're in ${city} — too far for a fresh delivery.`;
  }
  if (item.quantity > listing.remainingQuantity) {
    return `Only ${listing.remainingQuantity} ${listing.unit.toLowerCase()} left — lower the quantity.`;
  }
  return null;
}

/**
 * Prices `items` against the live listings and returns the bill.
 *
 * `city` is the shopper's delivery city; pass '' to skip the locality check
 * (nothing does today — every consumer surface has a city by the time a basket
 * exists).
 */
export function useCartLines(items: CartItem[], city: string): CartTotals {
  // The result is stored WITH the set of lots it was fetched for, so "still
  // checking" is derived rather than set. That kills two problems at once: no
  // synchronous setState inside the effect (which cascades renders, and which
  // the lint rule rightly rejects), and no window where a removed lot's price
  // is still in the bill — changing the basket makes the tag stop matching,
  // which IS the loading state.
  const [fetched, setFetched] = useState<{ ids: string; map: Record<string, Listing | null> } | null>(null);
  const [nonce, setNonce] = useState(0);

  // Re-fetch when the SET of lots changes, not when a quantity does — stepping
  // 1 kg to 2 kg is arithmetic on data already in hand, and refetching on it
  // would put a network round trip behind every tap of the +.
  const ids = items.map((it) => it.listingId).join(',');

  useEffect(() => {
    // An empty basket has nothing to check and resolves below without a fetch.
    if (ids === '') return;

    let on = true;
    const wanted = ids.split(',');

    Promise.allSettled(wanted.map((id) => api.get(`/listings/${id}`)))
      .then((results) => {
        if (!on) return;
        const map: Record<string, Listing | null> = {};
        wanted.forEach((id, i) => {
          const r = results[i];
          map[id] = r.status === 'fulfilled' ? (r.value.data as Listing) : null;
        });
        setFetched({ ids, map });
      });

    return () => { on = false; };
  }, [ids, nonce]);

  // Null until THIS basket's own results have landed. A reload() keeps the
  // previous answer on screen while it refreshes — the prices are a few
  // seconds old, not unknown, and blanking the bill to re-show the same
  // numbers would be worse.
  const listings = ids === '' ? {} : fetched?.ids === ids ? fetched.map : null;
  const loading = listings === null;

  const lines: CartLine[] = items.map((item) => {
    const listing = listings?.[item.listingId] ?? null;
    // While the check is in flight the snapshot carries the row, and nothing is
    // marked unbuyable — a spinner-time "sold out" that resolves to "in stock"
    // is worse than a moment of stale price.
    const price = listing?.retailPricePerUnit ?? item.pricePerUnit;
    return {
      item,
      listing,
      price,
      quantity: item.quantity,
      lineTotal: Math.round(price * item.quantity * 100) / 100,
      problem: loading ? null : problemWith(item, listing, city),
      repriced: !loading && listing != null && listing.retailPricePerUnit != null
        && listing.retailPricePerUnit !== item.pricePerUnit,
    };
  });

  const orderable = lines.filter((l) => l.problem === null);
  const itemsTotal = orderable.reduce((sum, l) => sum + l.lineTotal, 0);

  return {
    lines,
    orderable,
    itemsTotal,
    // No delivery charge is levied on a retail order today: the grower brings
    // it in with the local round, and the platform's 2% is taken out of the
    // grower's settlement, not added to the shopper's bill. The bill says so
    // in words rather than showing a ₹0 line that looks like a placeholder.
    deliveryFee: 0,
    toPay: itemsTotal,
    currency: items[0]?.currency ?? 'INR',
    orderCount: orderable.length,
    loading,
    reload: () => setNonce((n) => n + 1),
  };
}
