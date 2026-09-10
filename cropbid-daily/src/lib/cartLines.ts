// =============================================================================
// cartLines — the basket, checked against what is actually for sale
// =============================================================================
// CartContext stores a snapshot taken when each lot went in. A basket outlives
// that snapshot: over a weekend a lot can sell out, be re-priced, be pulled
// from retail, or drop below the amount the shopper picked. Billing off the
// snapshot would mean a total on screen that the server then refuses, which is
// the worst possible place to find out.
//
// So the cart re-fetches every row before showing a price. What comes back is a
// LINE: the basket row, the live listing, the live line total, and one sentence
// explaining why it cannot be bought if it cannot. UNBUYABLE LINES STAY VISIBLE
// and are excluded from the bill, rather than vanishing and quietly changing
// the total under the shopper.
//
// Fetched per row because there is no by-ids endpoint and a household basket is
// a handful of rows. allSettled, because one dead lot must not blank the rest.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { fetchListing } from '../api/endpoints';
import type { CartItem } from '../context/CartContext';
import type { Listing, Unit } from '../api/types';
import { pricePerKg, toKg } from './units';

export interface CartLine {
  item: CartItem;
  /** Null when the lot could not be fetched at all (deleted, or the API failed). */
  listing: Listing | null;
  /** Kilograms, matching CartItem.quantity. */
  quantity: number;
  /** Live price per KILOGRAM. */
  perKg: number;
  /** perKg x quantity, rounded to whole rupees the way the bill shows it. */
  total: number;
  /**
   * The unit the SERVER will read this line's quantity in: the LIVE listing's,
   * falling back to the snapshot only until the check lands.
   *
   * It has to travel on the line rather than be read off `item` at the call
   * site. A seller can change an active listing's denomination while it sits in
   * a basket, and the snapshot then disagrees with the server by a factor of a
   * hundred: converting 1 kg with a stale KG unit sends quantity 1, which a
   * listing since changed to QUINTAL reads as 100 kg.
   */
  unit: Unit;
  /** Null when the line is fine. A sentence when it is not. */
  problem: string | null;
}

export interface Bill {
  lines: CartLine[];
  /** Only the lines that can actually be ordered. */
  orderable: CartLine[];
  subtotal: number;
  currency: string;
  loading: boolean;
  reload: () => void;
}

function checkLine(item: CartItem, listing: Listing | null): CartLine {
  const unit = listing?.unit ?? item.unit;
  const livePrice = listing?.retailPricePerUnit ?? item.pricePerUnit;
  const perKg = pricePerKg(livePrice, unit);
  const total = Math.round(perKg * item.quantity);

  let problem: string | null = null;
  if (!listing) {
    problem = 'No longer available';
  } else if (listing.retailPricePerUnit == null) {
    problem = 'This shop stopped selling it by the kilo';
  } else if (toKg(listing.remainingQuantity, unit) < item.quantity) {
    const left = toKg(listing.remainingQuantity, unit);
    problem = left <= 0 ? 'Sold out' : `Only ${left} kg left`;
  }

  return { item, listing, quantity: item.quantity, perKg, total, unit, problem };
}

export function useBill(items: CartItem[]): Bill {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Keyed on the ids and amounts rather than the array identity, so a re-render
  // that hands back an equal array does not refetch the whole basket.
  const signature = items.map((i) => `${i.listingId}:${i.quantity}`).join('|');

  useEffect(() => {
    let cancelled = false;

    if (items.length === 0) {
      setLines([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const results = await Promise.allSettled(items.map((i) => fetchListing(i.listingId)));
      if (cancelled) return;
      setLines(
        items.map((item, idx) => {
          const r = results[idx];
          return checkLine(item, r.status === 'fulfilled' ? r.value : null);
        }),
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, nonce]);

  const orderable = lines.filter((l) => l.problem === null);
  const subtotal = orderable.reduce((sum, l) => sum + l.total, 0);
  const currency = lines[0]?.listing?.currency ?? lines[0]?.item.currency ?? 'INR';

  return { lines, orderable, subtotal, currency, loading, reload };
}
