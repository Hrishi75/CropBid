// A key that makes a purchase replayable rather than repeatable.
//
// Minted when a line goes into the basket and RE-minted whenever its quantity
// moves, so "1 kg of tomatoes" and "2 kg of tomatoes" are different purchases
// while a retry of either is the same one. A failed order leaves the line in
// the cart still carrying its key, so pressing Place order again replays that
// purchase instead of making a second.

export function mintPurchaseKey(): string {
  // Not a UUID library: this only has to be unique within one shopper's basket,
  // and the server treats it as an opaque string.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
