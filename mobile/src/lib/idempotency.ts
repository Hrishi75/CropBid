// =============================================================================
// Purchase keys — one reference per intended order
// =============================================================================
// /bids/direct-purchase spends stock and opens an escrow transaction in one
// shot, and the app cannot tell a request that failed from one that succeeded
// and lost its response on the way back. Both surface as an error, both leave
// the lot looking unbought, and pressing Buy again used to buy it twice.
//
// So the caller mints a key for the purchase it INTENDS and sends the same one
// on every retry of that intent. The server holds it in a unique column and
// answers a repeat with the order that already exists.
//
// A key belongs to one intent, not one tap: re-mint it when the quantity
// changes, and after a purchase actually goes through.
//
// Not crypto.randomUUID — Hermes does not ship it, and this is a collision
// guard, not a secret. Random plus a timestamp is ample for a handle whose
// whole lifetime is one checkout on one device.
// =============================================================================

// Matches the server's validation: url-safe, 8 to 64 characters.
export function mintPurchaseKey(): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `ck_${Date.now().toString(36)}${rand()}${rand()}`;
}
