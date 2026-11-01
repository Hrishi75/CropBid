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

// =============================================================================
// Names only, outside the household storefront (2026-11-02)
// =============================================================================
// On the trade side the two parties see each other's own name and nothing
// else, CropBid being the point of contact (contactVisibility.ts). A
// wholesaler's firm name is the company name the rule hides, and the account's
// free-text `location` often holds a street address. A LOCAL_SHOP keeps both:
// households choose a shop by its name, which is the shop-first model
// (CLAUDE.md §3), and a shop's name is a storefront, not a way to reach it.
//
// Applied to whole responses rather than at each select, because the same
// select feeds both the storefront and the trade market. It walks the value
// and blanks the two fields on any seller profile that is not a shop.
export function nameOnlySellers<T>(value: T): T {
  return walk(value) as T;
}

function walk(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(walk);
  if (!v || typeof v !== 'object' || v instanceof Date) return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) out[k] = walk(val);
  if ('sellerType' in o && 'businessName' in o && o.sellerType !== 'LOCAL_SHOP') {
    out.businessName = null;
    if ('shopType' in o) out.shopType = null;
    const user = out.user as Record<string, unknown> | undefined;
    if (user && typeof user === 'object' && 'location' in user) out.user = { ...user, location: null };
  }
  return out;
}
