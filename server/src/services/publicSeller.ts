// =============================================================================
// The public shape of a seller
// =============================================================================
// What anyone browsing the marketplace is allowed to see about whoever is
// selling. Private profile columns — bank details, APMC licence, FPO name, the
// internal userId, and the compliance fields a shop files with its application
// (FSSAI, GSTIN, address, minimum order value) — are absent on purpose. Those
// belong to the admin review queue, not a product card.
//
// WHY ITS OWN FILE
// This lived as two hand-maintained copies, one in listing.service and one in
// browse.service, each carrying a comment saying it mirrored the other. They
// drifted the moment one gained a field: the storefront could group lots by
// shop name, while the very same lot fetched through GET /listings/:id came
// back without one, so a cart row showed the owner's name where the shop page
// showed the shop's. One copy, imported twice, cannot do that.
// =============================================================================

export const PUBLIC_SELLER_SELECT = {
  id: true,
  state: true,
  country: true,
  organicCertified: true,
  certificationBody: true,
  verified: true,
  // Who the shopper is buying FROM. businessName is the consumer-facing
  // identity of a shop ("Ramji Sabji Bhandar"); a FARMER has none and is known
  // by their own name. sellerType additionally decides the delivery lane the
  // storefront sorts a seller into: a shop holds stock and can deliver today,
  // a farm picks to order and arrives the next morning.
  sellerType: true,
  businessName: true,
  shopType: true,
  user: { select: { id: true, name: true, trustScore: true, avatar: true, location: true } },
} as const;
