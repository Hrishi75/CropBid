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

// Public browse/smart-match must not leak a farmer's private profile fields
// (bank details, APMC license, FPO name, internal userId) — expose only what
// the marketplace UI renders. Mirrors PUBLIC_FARMER_SELECT in listing.service.
const PUBLIC_FARMER_SELECT = {
  id: true,
  state: true,
  country: true,
  organicCertified: true,
  certificationBody: true,
  verified: true,
  user: { select: { id: true, name: true, trustScore: true, avatar: true, location: true } },
} as const;

interface BrowseQuery {
  // Filters
  crop?: string;
  crops?: string[]; // match any crop in this list (e.g. a "Fresh produce" category)
  state?: string;
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
        farmer: { select: PUBLIC_FARMER_SELECT },
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
      farmer: { select: PUBLIC_FARMER_SELECT },
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
