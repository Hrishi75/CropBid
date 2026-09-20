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
//
// ONE ORDER PER SHOP, AND THE DELIVERY FEE WITH IT
// Each shop makes its own delivery run, so the basket is ordered, paid for and
// delivered one shop at a time. Under ₹200 of a shop's items that run costs the
// shopper ₹30; from ₹200 it is free. The lines are therefore grouped into
// SHOPS here, each with its own total and fee, and the bill is the sum of them.
//
// Each shop's total is worked out on exactly the server's basis: the live
// retail price times the quantity checkout will send, summed in the order the
// lines are sent, rounded to paise once. Rounding each row first and adding
// those up could land a paisa either side of ₹200 from the server, and show
// "Free" on an order that is then charged ₹30.
// =============================================================================

import { useEffect, useState } from 'react';
import api from '../../lib/axios';
import type { CartItem } from '../../context/CartContext';
import type { Listing, RetailRules, Unit } from '../../types';
import { formatWeight, fromKg, pricePerKg, toKg } from '../../utils/units';
import { laneFor } from '../../utils/delivery';
import type { DeliveryLane } from '../../utils/delivery';
import { sellerDisplayName } from '../../utils/partner';
import { deliveryFeeFor, toPaise, useRetailRules } from '../../utils/retailRules';

export interface CartLine {
  item: CartItem;
  /** Null when the lot could not be fetched at all (deleted, or the API failed). */
  listing: Listing | null;
  /**
   * Live retail price, per the LOT's unit — the number the server prices in.
   * Divide by KG_PER_UNIT (pricePerKg) before showing it to a shopper.
   * Falls back to the snapshot only so a line always renders.
   */
  price: number;
  /** Kilograms, matching CartItem.quantity. */
  quantity: number;
  /**
   * The unit the SERVER will read this line's quantity in — the live listing's,
   * falling back to the snapshot only until the check lands.
   *
   * It has to travel on the line rather than be read off `item` at each call
   * site. A seller can change an active listing's denomination while it sits in
   * a basket, and the snapshot then disagrees with the server by a factor of a
   * hundred or a thousand: converting 1 kg with a stale KG unit sends
   * quantity 1, which a listing since changed to QUINTAL reads as 100 kg.
   */
  unit: Unit;
  lineTotal: number;
  /**
   * The quantity in the LOT's own unit, exactly as checkout sends it. The
   * shop's total is `price × orderQuantity` summed, which is the server's own
   * sum, not the per-row display rounding in lineTotal.
   */
  orderQuantity: number;
  /** Who sells this line, which is the shop order it goes into. */
  sellerId: string;
  /** That seller as the shopper knows them: the shop's name, or the person's. */
  sellerName: string | null;
  /** Why this line cannot be ordered right now. Null means it can. */
  problem: string | null;
  /** True when the live price differs from the one the shopper last saw. */
  repriced: boolean;
  /**
   * When this line can arrive. Taken from the LIVE listing where the check has
   * landed, and from the snapshot before that, so the promise never flickers
   * from "tomorrow" to "today" mid-render.
   */
  lane: DeliveryLane;
}

/** One shop's share of the basket: one order, one delivery, one payment. */
export interface ShopGroup {
  sellerId: string;
  sellerName: string | null;
  lane: DeliveryLane;
  /** Every row from this shop, including any that cannot be ordered right now. */
  lines: CartLine[];
  /** The rows that go into this shop's order. */
  orderable: CartLine[];
  /** The orderable rows together, on the server's basis (see the file note). */
  itemsTotal: number;
  /** What this shop order pays for delivery. Null while the rules are unknown. */
  deliveryFee: number | null;
  /** How much more from this shop makes delivery free, in whole rupees. 0 when it already is. */
  toFreeDelivery: number;
}

export interface CartTotals {
  lines: CartLine[];
  orderable: CartLine[];
  /** The basket by shop, quick-delivery shops first. */
  shops: ShopGroup[];
  /** Sum of the orderable lines. Unbuyable rows never reach the bill. */
  itemsTotal: number;
  /** Every shop's delivery fee together. Null while the rules are unknown. */
  deliveryFee: number | null;
  /** How many shops in this bill are paying for delivery. */
  shopsPayingDelivery: number;
  toPay: number | null;
  currency: string;
  /** One order per shop. See the note in Checkout. */
  orderCount: number;
  rules: RetailRules | null;
  /**
   * The delivery rules could not be fetched. The bill says so rather than
   * guess a fee, and checkout waits until they arrive.
   */
  rulesFailed: boolean;
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
  // Both sides in kilograms: the basket row is kg, the listing's stock is in
  // whatever the farmer sells in. Comparing them raw would call a 2 kg order
  // short against a 30-quintal lot, or pass an order a hundred times the stock.
  const stockKg = toKg(listing.remainingQuantity, listing.unit);
  if (item.quantity > stockKg) {
    return `Only ${formatWeight(stockKg)} left — lower the quantity.`;
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
  const { rules, failed: rulesFailed, retry: retryRules } = useRetailRules();

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
  const loading = listings === null || (rules === null && !rulesFailed);

  const lines: CartLine[] = items.map((item) => {
    const listing = listings?.[item.listingId] ?? null;
    // While the check is in flight the snapshot carries the row, and nothing is
    // marked unbuyable — a spinner-time "sold out" that resolves to "in stock"
    // is worse than a moment of stale price.
    const price = listing?.retailPricePerUnit ?? item.pricePerUnit;
    // Live unit wins over the snapshot, for the same reason the live price does.
    const unit = listing?.unit ?? item.unit;
    return {
      item,
      listing,
      price,
      quantity: item.quantity,
      // price is per the lot's unit, quantity is kg. Converting the price
      // rather than the quantity keeps this identical to the server's own
      // retailPricePerUnit × quantity, so the bill on screen is the bill charged.
      lineTotal: Math.round(pricePerKg(price, unit) * item.quantity * 100) / 100,
      problem: listings === null ? null : problemWith(item, listing, city),
      repriced: listings !== null && listing != null && listing.retailPricePerUnit != null
        && listing.retailPricePerUnit !== item.pricePerUnit,
      lane: laneFor(listing?.farmer?.sellerType ?? item.sellerType),
      unit,
      orderQuantity: fromKg(item.quantity, unit),
      // The live listing's seller wins, then the snapshot's. A row saved before
      // the snapshot carried one, whose lot could not be fetched either, is
      // unorderable anyway, and gets a group of its own rather than a guess.
      sellerId: listing?.farmerId ?? item.sellerId ?? `lot:${item.listingId}`,
      sellerName: sellerDisplayName(listing?.farmer) ?? item.farmerName,
    };
  });

  const shops = groupByShop(lines, rules);
  const orderable = lines.filter((l) => l.problem === null);
  const itemsTotal = shops.reduce((sum, g) => sum + g.itemsTotal, 0);
  const deliveryFee = rules ? shops.reduce((sum, g) => sum + (g.deliveryFee ?? 0), 0) : null;

  return {
    lines,
    orderable,
    shops,
    itemsTotal,
    deliveryFee,
    shopsPayingDelivery: shops.filter((g) => (g.deliveryFee ?? 0) > 0).length,
    toPay: deliveryFee === null ? null : toPaise(itemsTotal + deliveryFee),
    currency: items[0]?.currency ?? 'INR',
    orderCount: shops.filter((g) => g.orderable.length > 0).length,
    rules,
    rulesFailed,
    loading,
    reload: () => {
      setNonce((n) => n + 1);
      if (rulesFailed) retryRules();
    },
  };
}

// The basket as shops, each with its own total and fee. Quick-delivery shops
// come first, because a basket spanning both lanes arrives in two deliveries
// and the one coming today is the one to read about first; within a lane, the
// order the shopper added them in.
function groupByShop(lines: CartLine[], rules: RetailRules | null): ShopGroup[] {
  const groups = new Map<string, CartLine[]>();
  for (const line of lines) {
    const group = groups.get(line.sellerId);
    if (group) group.push(line);
    else groups.set(line.sellerId, [line]);
  }

  const shops = [...groups.entries()].map(([sellerId, shopLines]): ShopGroup => {
    const orderable = shopLines.filter((l) => l.problem === null);
    const itemsTotal = toPaise(orderable.reduce((sum, l) => sum + l.price * l.orderQuantity, 0));
    const deliveryFee = rules && orderable.length > 0 ? deliveryFeeFor(itemsTotal, rules) : rules ? 0 : null;
    return {
      sellerId,
      sellerName: shopLines.find((l) => l.sellerName)?.sellerName ?? null,
      lane: shopLines[0].lane,
      lines: shopLines,
      orderable,
      itemsTotal,
      deliveryFee,
      toFreeDelivery: rules && deliveryFee ? Math.ceil(rules.freeDeliveryFrom - itemsTotal) : 0,
    };
  });

  const laneRank = (lane: DeliveryLane) => (lane === 'QUICK' ? 0 : 1);
  return shops.sort((a, b) => laneRank(a.lane) - laneRank(b.lane));
}
