// =============================================================================
// resumeAfterLogin — finish what a guest started before they logged in
// =============================================================================
// A guest who taps ADD on a shop's page is asked to log in. Logging in swaps
// the guest navigator for the shopper's, which starts on Home, so without this
// the shop and the item were both lost. The shop page records what was tapped;
// the shopper's Home takes it once and reopens that shop, which adds the item.
//
// In memory, and short-lived: it only has to survive the sign-in, and a stale
// one must not send somebody to a shop they abandoned a while ago.
// =============================================================================

export interface PendingShopAdd {
  shopId: string;
  city: string;
  listingId: string;
}

const MAX_AGE_MS = 10 * 60 * 1000;

let pending: (PendingShopAdd & { at: number }) | null = null;

export function rememberShopAdd(next: PendingShopAdd): void {
  pending = { ...next, at: Date.now() };
}

export function forgetShopAdd(): void {
  pending = null;
}

/** The pending add, once: reading it clears it. Null when none or too old. */
export function takeShopAdd(): PendingShopAdd | null {
  const p = pending;
  pending = null;
  if (!p || Date.now() - p.at > MAX_AGE_MS) return null;
  return { shopId: p.shopId, city: p.city, listingId: p.listingId };
}
