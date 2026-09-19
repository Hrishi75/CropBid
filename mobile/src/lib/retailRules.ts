// =============================================================================
// retailRules: the delivery fee, as the server states it
// =============================================================================
// Free delivery from ₹200 of one shop's items, ₹30 below that. The numbers live
// in one place on the server (retailOrder.service RETAIL_DELIVERY) and are read
// from GET /browse/retail-rules, so the basket never keeps a copy that drifts.
//
// Fetched once per app run and shared between the cart and the checkout. A
// failure is not cached, so the next caller tries again.
//
// Mirrors client/src/utils/retailRules.ts.
// =============================================================================

import { useEffect, useState } from 'react';
import { retailRules } from '../api/endpoints';
import type { RetailRules } from '../api/types';

let cached: RetailRules | null = null;
let inFlight: Promise<RetailRules> | null = null;

function loadRules(): Promise<RetailRules> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = retailRules()
      .then((data) => {
        cached = data;
        return data;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/**
 * The delivery rules, or null while they load. `failed` is true when the fetch
 * did not come back, and the bill should say so rather than guess a fee.
 */
export function useRetailRules(): { rules: RetailRules | null; failed: boolean; retry: () => void } {
  const [rules, setRules] = useState<RetailRules | null>(cached);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cached) return;
    let on = true;
    loadRules()
      .then((r) => { if (on) { setRules(r); setFailed(false); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [attempt]);

  return { rules, failed, retry: () => setAttempt((n) => n + 1) };
}

/**
 * The fee one shop order pays, given its items total in rupees. Same rule as
 * the server's deliveryFeeFor(): strictly under the threshold pays.
 */
export function deliveryFeeFor(itemsTotal: number, rules: RetailRules): number {
  return itemsTotal < rules.freeDeliveryFrom ? rules.deliveryFee : 0;
}

/** Rounded to paise, exactly as the server rounds a shop order's total. */
export function toPaise(n: number): number {
  return Math.round(n * 100) / 100;
}
