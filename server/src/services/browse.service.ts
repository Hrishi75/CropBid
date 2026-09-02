// =============================================================================
// Browse & Smart Match Service
// =============================================================================
// WHY A SEPARATE SERVICE FROM listing.service?
// listing.service handles CRUD for farmers managing their own listings.
// browse.service handles the BUYER'S perspective — searching, filtering,
// and discovering listings across all farmers.
//
// Smart Match is a lightweight scoring algorithm (NOT AI) that ranks
// listings based on how well they match a buyer's profile and preferences.
// It's fast, transparent, and doesn't cost API calls.
// =============================================================================

import { prisma } from '../lib/prisma';
import { KG_PER_UNIT } from '../utils/units';
import { PUBLIC_SELLER_SELECT } from './publicSeller';


interface BrowseQuery {
  // Filters
  crop?: string;
  crops?: string[]; // match any crop in this list (e.g. a "Fresh produce" category)
  state?: string;
  // City/town. Used by the consumer storefront to keep retail orders local —
  // see the filter body for why this is city-level and not state-level.
  location?: string;
  country?: string;
  priceMin?: number;
  priceMax?: number;
  quality?: string;
  organic?: boolean;
  search?: string;
  directSale?: boolean; // Only listings open for consumer instant-buy, with stock left
  // Pagination
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// =============================================================================
// BROWSE — Filtered, paginated listing search
// =============================================================================
export async function browseListings(query: BrowseQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  // Build dynamic WHERE clause
  const where: any = {
    status: 'ACTIVE', // Only show active listings to buyers
  };

  if (query.crop) {
    where.cropName = { equals: query.crop, mode: 'insensitive' };
  } else if (query.crops && query.crops.length > 0) {
    // Category filter (e.g. "Fresh produce") — match any crop in the list.
    // Case-insensitive to mirror the single-crop filter above.
    where.cropName = { in: query.crops, mode: 'insensitive' };
  }

  if (query.state) {
    where.state = { equals: query.state, mode: 'insensitive' };
  }

  // City-level filter, for the retail channel.
  //
  // WHY CITY AND NOT STATE: a shopper buying 2 kg cannot be served from the
  // other end of their own state. Nashik and Nagpur are both Maharashtra and
  // 600 km apart — a state filter would put a Nagpur household's order on a
  // Nashik farm and the delivery would never happen. The unit economics of a
  // 2 kg order only work when the farm is local, so local is what this means.
  //
  // Exact match rather than `contains`: "Nashik" must not pull in a town that
  // merely has it as a substring, and a partial match is the kind of thing
  // that silently widens a radius nobody can then reason about.
  if (query.location) {
    where.location = { equals: query.location, mode: 'insensitive' };
  }

  if (query.country) {
    where.country = { equals: query.country, mode: 'insensitive' };
  }

  if (query.quality) {
    where.qualityGrade = query.quality;
  }

  if (query.organic !== undefined) {
    where.organic = query.organic;
  }

  if (query.directSale) {
    where.directSaleEnabled = true;
    where.remainingQuantity = { gt: 0 };
  }

  // Price range filter — matches if the listing's price range overlaps
  // with the buyer's desired range
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    where.AND = [];
    if (query.priceMin !== undefined) {
      // Listing's max price must be >= buyer's min (otherwise too cheap)
      where.AND.push({ pricePerUnitMax: { gte: query.priceMin } });
    }
    if (query.priceMax !== undefined) {
      // Listing's min price must be <= buyer's max (otherwise too expensive)
      where.AND.push({ pricePerUnitMin: { lte: query.priceMax } });
    }
  }

  // Full-text search across crop name, variety, description, location
  if (query.search) {
    where.OR = [
      { cropName: { contains: query.search, mode: 'insensitive' } },
      { cropVariety: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
      { location: { contains: query.search, mode: 'insensitive' } },
      { state: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  // Sort configuration
  const sortField = query.sort || 'createdAt';
  const sortOrder = query.order || 'desc';
  const orderBy: any = { [sortField]: sortOrder };

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        farmer: { select: PUBLIC_SELLER_SELECT },
        _count: { select: { bids: true } },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

// =============================================================================
// SMART MATCH — Score listings against a buyer's profile
// =============================================================================
// HOW SCORING WORKS:
// Each listing gets a 0-100 score based on weighted criteria:
//   - Crop preference match:   35 points (buyer's preferred crops)
//   - Geographic proximity:    25 points (same state/country)
//   - Price competitiveness:   20 points (lower price = higher score)
//   - Farmer trust score:      10 points (higher trust = higher score)
//   - Quality grade:           10 points (grade A > B > C)
//
// WHY NOT AI FOR THIS?
// Smart match runs on EVERY page load. Using Gemini API here would be:
//   - Slow (500ms+ per request vs <10ms for scoring)
//   - Expensive (thousands of API calls per day)
//   - Opaque (users can't understand why items are ranked)
// Simple scoring is fast, free, and explainable.
// =============================================================================

interface SmartMatchContext {
  preferredCrops: string[];
  buyerState?: string;
  buyerCountry?: string;
  maxPrice?: number;
}

export async function smartMatch(context: SmartMatchContext, limitResults: number = 10) {
  // Fetch active listings with farmer info
  const listings = await prisma.listing.findMany({
    where: { status: 'ACTIVE' },
    include: {
      farmer: { select: PUBLIC_SELLER_SELECT },
      _count: { select: { bids: true } },
    },
    take: 200, // Score top 200, return top N
  });

  // Score each listing
  const scored = listings.map((listing) => {
    let score = 0;

    // 1. Crop match (35 points)
    if (context.preferredCrops.length > 0) {
      const cropMatch = context.preferredCrops.some(
        (crop) => crop.toLowerCase() === listing.cropName.toLowerCase()
      );
      if (cropMatch) score += 35;
    }

    // 2. Geographic proximity (25 points)
    if (context.buyerCountry && listing.country === context.buyerCountry) {
      score += 10; // Same country
      if (context.buyerState && listing.state === context.buyerState) {
        score += 15; // Same state (bonus)
      }
    }

    // 3. Price competitiveness (20 points)
    // Lower midpoint price = higher score
    if (context.maxPrice) {
      const midPrice = (listing.pricePerUnitMin + listing.pricePerUnitMax) / 2;
      if (midPrice <= context.maxPrice) {
        const priceRatio = 1 - midPrice / context.maxPrice;
        score += Math.round(priceRatio * 20);
      }
    } else {
      score += 10; // No price preference = neutral score
    }

    // 4. Trust score (10 points)
    const trustScore = listing.farmer?.user?.trustScore || 50;
    score += Math.round((trustScore / 100) * 10);

    // 5. Quality grade (10 points)
    const qualityPoints: Record<string, number> = { A: 10, B: 6, C: 3 };
    score += qualityPoints[listing.qualityGrade] || 0;

    return { ...listing, matchScore: Math.min(100, score) };
  });

  // Sort by score descending, return top N
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, limitResults);
}

// =============================================================================
// AVAILABLE FILTERS — Dynamic filter options from current data
// =============================================================================
// WHY DYNAMIC?
// If we hardcode filter options, we'd show "Coffee" even if no one lists
// coffee. Dynamic filters only show options that have actual listings,
// giving buyers a realistic view of what's available.
// =============================================================================
// =============================================================================
// RETAIL CITIES — where the shop can actually deliver from
// =============================================================================
// Powers the consumer storefront's city picker. Only cities with live
// direct-sale stock are returned, so a shopper can never pick their way into an
// empty shelf — the same rule the requirement feed's filters follow.
//
// Deliberately NOT every city with a listing: a town with only bulk lots cannot
// serve a household, and offering it would promise a shop that isn't there.
export async function getRetailCities() {
  const rows = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      directSaleEnabled: true,
      remainingQuantity: { gt: 0 },
    },
    select: { location: true, state: true },
    distinct: ['location'],
    orderBy: { location: 'asc' },
  });

  return rows.map((r) => ({ city: r.location, state: r.state }));
}

export async function getAvailableFilters() {
  const [crops, states, countries] = await Promise.all([
    prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { cropName: true },
      distinct: ['cropName'],
      orderBy: { cropName: 'asc' },
    }),
    prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    }),
    prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { country: true },
      distinct: ['country'],
      orderBy: { country: 'asc' },
    }),
  ]);

  return {
    crops: crops.map((c) => c.cropName),
    states: states.map((s) => s.state),
    countries: countries.map((c) => c.country),
    qualities: ['A', 'B', 'C'],
    units: ['KG', 'QUINTAL', 'TONNE'],
  };
}

// =============================================================================
// RETAIL SHOPS — the consumer storefront's top level
// =============================================================================
// A household does not shop the way a processor sources. A buyer wants the
// cheapest tonne of onion wherever it is; a shopper wants to know which
// counters near them are open, and then what is on each. So the retail surface
// is SHOP-FIRST: city, then shop, then that shop's stock, then the order.
//
// That also sidesteps the thing that blocks an aggregated, one-card-per-product
// storefront: with no canonical product catalogue, "Tomato" from four sellers
// is four unrelated rows with four spellings, four grades and four prices, and
// merging them into one card means inventing a match nobody verified. Grouping
// by the seller needs no such invention. The grouping key is a real foreign
// key, and the price differences the shopper sees between shops are the point,
// not noise to be averaged away.
//
// A "shop" here is any approved seller with live retail stock — a LOCAL_SHOP
// trading under a business name, or a FARMER selling under their own. The
// display name is the only thing that differs.
// =============================================================================

// Everything a lot needs to be sellable to a household, in one place so the
// shop list, the shop page and the city picker cannot drift apart.
const RETAIL_STOCK = {
  status: 'ACTIVE',
  directSaleEnabled: true,
  remainingQuantity: { gt: 0 },
} as const;

/** The name a shopper sees. A shop trades as its business name; a farmer as themselves. */
function displayName(seller: { businessName: string | null; user: { name: string } }): string {
  return seller.businessName?.trim() || seller.user.name;
}

export interface RetailShopQuery {
  /** City the shopper is buying in. Required: retail never crosses cities. */
  city: string;
}

/**
 * The shops with something on the shelf in `city`, each with a summary of what
 * they are holding.
 *
 * One query, grouped in memory rather than with groupBy: the summary needs the
 * seller's identity AND a price range AND the distinct crops, which is three
 * aggregates over a join that Prisma's groupBy cannot express in one shot. A
 * city's live retail stock is tens of rows, not thousands, so the cost of
 * reading them and folding them here is far below a second round trip.
 */
export async function listRetailShops(query: RetailShopQuery) {
  const listings = await prisma.listing.findMany({
    where: {
      ...RETAIL_STOCK,
      location: { equals: query.city, mode: 'insensitive' },
    },
    select: {
      cropName: true,
      retailPricePerUnit: true,
      unit: true,
      currency: true,
      organic: true,
      images: true,
      location: true,
      state: true,
      updatedAt: true,
      farmer: { select: PUBLIC_SELLER_SELECT },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const byShop = new Map<string, {
    id: string;
    name: string;
    sellerType: string;
    shopType: string | null;
    city: string;
    state: string;
    verified: boolean;
    trustScore: number;
    itemCount: number;
    crops: string[];
    organicCount: number;
    currency: string;
    /** Cheapest per-kilo price on the shelf, so a card can say "from ₹16/kg". */
    fromPricePerKg: number | null;
    /** First image found, for the card. */
    image: string | null;
    lastRestockedAt: Date;
  }>();

  for (const l of listings) {
    const seller = l.farmer;
    const existing = byShop.get(seller.id);

    // Prices are stored per the seller's own unit; the retail surface is
    // per-kilo, so normalize before comparing across shops. Otherwise a
    // quintal-denominated lot looks a hundred times dearer than a kg one.
    const perKg = l.retailPricePerUnit == null
      ? null
      : l.retailPricePerUnit / KG_PER_UNIT[l.unit];

    if (!existing) {
      byShop.set(seller.id, {
        id: seller.id,
        name: displayName(seller),
        sellerType: seller.sellerType,
        shopType: seller.shopType,
        // The city the STOCK is in, not wherever the owner's profile says
        // they live. Listing.location is the column the city picker reads and
        // the only one guaranteed to be set.
        city: l.location,
        state: l.state,
        verified: seller.verified,
        trustScore: seller.user.trustScore,
        itemCount: 1,
        crops: [l.cropName],
        organicCount: l.organic ? 1 : 0,
        currency: l.currency,
        fromPricePerKg: perKg,
        image: l.images[0] ?? null,
        lastRestockedAt: l.updatedAt,
      });
      continue;
    }

    existing.itemCount += 1;
    if (!existing.crops.includes(l.cropName)) existing.crops.push(l.cropName);
    if (l.organic) existing.organicCount += 1;
    if (perKg != null && (existing.fromPricePerKg == null || perKg < existing.fromPricePerKg)) {
      existing.fromPricePerKg = perKg;
    }
    if (existing.image == null && l.images[0]) existing.image = l.images[0];
  }

  // Shops holding more get shown first: a counter with one sad lot of okra is
  // a worse first impression than one with twelve things on it.
  return [...byShop.values()].sort((a, b) =>
    b.itemCount - a.itemCount || a.name.localeCompare(b.name));
}

/**
 * One shop and everything it currently has on the shelf.
 *
 * `city` is checked rather than assumed: a shop page reached by a shared link
 * must not become a way to order across cities that the shelf itself refuses.
 * Pass '' to skip the check (nothing does today).
 */
export async function getRetailShop(sellerId: string, city: string) {
  const seller = await prisma.farmerProfile.findUnique({
    where: { id: sellerId },
    select: PUBLIC_SELLER_SELECT,
  });
  if (!seller) return null;

  // The city filter lives on the LISTINGS, not the owner's profile. A seller's
  // profile city is optional and can differ from where their stock actually
  // sits, and it is the stock that has to be deliverable.
  const listings = await prisma.listing.findMany({
    where: {
      ...RETAIL_STOCK,
      farmerId: sellerId,
      ...(city !== '' ? { location: { equals: city, mode: 'insensitive' as const } } : {}),
    },
    include: { farmer: { select: PUBLIC_SELLER_SELECT } },
    orderBy: { updatedAt: 'desc' },
  });

  // A shop with nothing on the shelf in this city is not a shop the shopper
  // can buy from, so it reads the same as one that does not exist.
  if (listings.length === 0) return null;

  return {
    shop: {
      id: seller.id,
      name: displayName(seller),
      sellerType: seller.sellerType,
      shopType: seller.shopType,
      city: listings[0].location,
      state: listings[0].state,
      verified: seller.verified,
      trustScore: seller.user.trustScore,
      organicCertified: seller.organicCertified,
      certificationBody: seller.certificationBody,
      itemCount: listings.length,
    },
    listings,
  };
}
