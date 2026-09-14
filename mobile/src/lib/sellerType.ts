// =============================================================================
// What kind of seller this is, and what to call their things
// =============================================================================
// `FarmerProfile` holds all three kinds of seller and `sellerType` says which
// (CLAUDE.md §4: read it as a SELLER profile). The app used to collapse that
// into one boolean, `role === 'FARMER'`, and label everything from it. A kirana
// store owner therefore saw "farmer" on their profile, "My Crops" in the tab
// bar, "My Farm" beside it, "Tell us about your farm" on the application, and
// "BUYERS TRUST YOU" over their trust score. Every one of those is wrong for
// somebody running a shop.
//
// THE DATABASE WAS ALWAYS RIGHT. `sellerType` is on the row and on the wire;
// only the client was throwing it away. So this is a labelling layer over a
// fact that already existed, not a new source of truth.
//
// A WHOLESALER IS NOT A FARM EITHER, and gets its own words rather than being
// folded into one of the other two.
// =============================================================================

import type { SellerType, User } from '../api/types';

/**
 * Every kind of buyer the server accepts.
 *
 * SEVEN, not the three that get talked about. The app's application form
 * offered only five of them and was missing WHOLESALER and SMALL_BUSINESS
 * entirely, so two valid kinds of buyer could not be selected at all and
 * anybody who was one had to pick something they were not.
 */
export const COMPANY_TYPES = [
  'RESTAURANT',
  'SMALL_BUSINESS',
  'WHOLESALER',
  'PROCESSOR',
  'FMCG',
  'EXPORTER',
  'RETAILER',
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

/** What a buyer of each kind is called on screen. */
export const COMPANY_LABEL: Record<CompanyType, string> = {
  RESTAURANT: 'Restaurant / café',
  SMALL_BUSINESS: 'Small business',
  WHOLESALER: 'Wholesaler',
  PROCESSOR: 'Processor',
  FMCG: 'FMCG',
  EXPORTER: 'Exporter',
  RETAILER: 'Retailer',
};

export interface SellerWords {
  /** The role pill, lower case: "local shop", "farmer", "wholesaler". */
  tag: string;
  /** Title case, for a subtitle or a sentence start. */
  noun: string;
  /** What their listings are, as a tab label: "My Crops", "My Stock". */
  stockTab: string;
  /** Their own dashboard, as a tab label: "My Farm", "My Shop". */
  homeTab: string;
  /** The thing they are describing on the application form. */
  place: string;
  /** The sell CTA on the storefront. */
  listCta: string;
  /** Over the trust meter. */
  trustLabel: string;
  /** The details card heading: "Your farm", "Your shop". */
  placeSection: string;
  /** What their catalogue is called on that card: "YOUR CROPS", "WHAT YOU STOCK". */
  stockLabel: string;
  /** The size field, which only a farm actually has. Null hides the row. */
  sizeLabel: string | null;
}

const WORDS: Record<SellerType, SellerWords> = {
  FARMER: {
    tag: 'farmer',
    noun: 'Farmer',
    stockTab: 'My Crops',
    homeTab: 'My Farm',
    place: 'farm',
    listCta: 'List your harvest',
    trustLabel: 'BUYERS TRUST YOU',
    placeSection: 'Your farm',
    stockLabel: 'YOUR CROPS',
    sizeLabel: 'FARM SIZE',
  },
  LOCAL_SHOP: {
    tag: 'local shop',
    noun: 'Local shop',
    // Not "My Crops": a kirana store sells rice and turmeric it did not grow.
    stockTab: 'My Stock',
    homeTab: 'My Shop',
    place: 'shop',
    listCta: 'Add to your shelf',
    trustLabel: 'SHOPPERS TRUST YOU',
    placeSection: 'Your shop',
    stockLabel: 'WHAT YOU STOCK',
    // A shop has no acreage. The row is hidden rather than shown as "not set",
    // which reads as something the owner forgot to fill in.
    sizeLabel: null,
  },
  WHOLESALER: {
    tag: 'wholesaler',
    noun: 'Wholesaler',
    stockTab: 'My Lots',
    homeTab: 'My Business',
    place: 'business',
    listCta: 'List a lot',
    trustLabel: 'BUYERS TRUST YOU',
    placeSection: 'Your business',
    stockLabel: 'WHAT YOU TRADE',
    sizeLabel: null,
  },
};

/**
 * The words for this account's kind of seller.
 *
 * Falls back to FARMER when the type is missing, which happens for profiles
 * written before the column existed. That is the right default: it is what
 * those rows actually are, and it is what the app said before this file.
 */
export function sellerWords(user: User | null | undefined): SellerWords {
  return WORDS[user?.farmerProfile?.sellerType ?? 'FARMER'];
}

/** The same, from a bare seller type. */
export function wordsFor(type: SellerType | null | undefined): SellerWords {
  return WORDS[type ?? 'FARMER'];
}

/**
 * The name a seller trades under.
 *
 * A shop is known by its business name and a farmer by their own, so a shop
 * whose profile shows the owner's name is showing the wrong identity to
 * everyone who buys from them.
 */
export function sellerDisplayName(user: User | null | undefined): string {
  return user?.farmerProfile?.businessName?.trim() || user?.name || '';
}

/**
 * The two pills on a profile header: what they are, and specifically what kind.
 *
 * TWO LEVELS, because the account model has two. "Seller" covers a farm, a
 * kirana store and a wholesaler, which want different words for everything
 * else in the app; "Buyer" covers seven company types. Collapsing that to one
 * label is what produced a shop owner whose profile said "farmer".
 *
 * `subtype` is null where there is nothing below the category: a household is
 * just a shopper, and an admin is just an admin.
 */
export function accountTags(user: User | null | undefined): { category: string; subtype: string | null } {
  if (!user) return { category: '', subtype: null };

  if (user.role === 'FARMER') {
    return { category: 'SELLER', subtype: sellerWords(user).tag };
  }
  if (user.role === 'BUYER') {
    const type = user.buyerProfile?.companyType as CompanyType | undefined;
    // A buyer with no company type on file is still a buyer; the second pill
    // just has nothing to say, and an empty one would be worse than none.
    return { category: 'BUYER', subtype: type ? COMPANY_LABEL[type].toLowerCase() : null };
  }
  if (user.role === 'ADMIN') return { category: 'ADMIN', subtype: null };
  return { category: 'SHOPPER', subtype: null };
}
