// =============================================================================
// Listing Service — Business Logic for Crop Listings
// =============================================================================
// WHY A SERVICE LAYER?
// Controllers handle HTTP concerns (parsing body, setting status codes).
// Services handle BUSINESS LOGIC (validation rules, database queries).
// This separation means you can reuse the same logic from:
//   - REST API controllers
//   - Socket.io event handlers (Phase 10)
//   - AI agent services (Phase 8)
// Without duplicating code.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

// --- Types for service inputs ---
interface CreateListingInput {
  farmerId: string;
  cropName: string;
  cropVariety?: string;
  quantity: number;
  unit?: string;
  qualityGrade: string;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency?: string;
  harvestDate?: string;
  expiryDate?: string;
  description?: string;
  images?: string[];
  labReportUrl?: string;
  organic?: boolean;
  location: string;
  country?: string;
  state: string;
  directSaleEnabled?: boolean;
  retailPricePerUnit?: number;
}

interface UpdateListingInput {
  cropName?: string;
  cropVariety?: string;
  quantity?: number;
  unit?: string;
  qualityGrade?: string;
  pricePerUnitMin?: number;
  pricePerUnitMax?: number;
  currency?: string;
  harvestDate?: string;
  expiryDate?: string;
  description?: string;
  images?: string[];
  labReportUrl?: string;
  organic?: boolean;
  location?: string;
  country?: string;
  state?: string;
  directSaleEnabled?: boolean;
  retailPricePerUnit?: number;
  // NOTE: `status` is deliberately NOT editable here. Listing status is owned by
  // the bid/auction/expiry flows; allowing a direct write would bypass the sale
  // state machine (e.g. flipping a live IN_AUCTION listing to SOLD).
}

interface ListingsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  farmerId?: string;
  status?: string;
}

// =============================================================================
// CREATE — Farmer posts a new crop listing
// =============================================================================
export async function createListing(userId: string, input: CreateListingInput) {
  // First, verify the user has a farmer profile
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId },
  });

  if (!farmerProfile) {
    throw new ApiError(400, 'Complete your farmer profile before creating listings');
  }

  // Validate price range
  if (input.pricePerUnitMin > input.pricePerUnitMax) {
    throw new ApiError(400, 'Minimum price cannot exceed maximum price');
  }

  if (input.pricePerUnitMin <= 0) {
    throw new ApiError(400, 'Price must be greater than zero');
  }

  if (input.directSaleEnabled && !(input.retailPricePerUnit && input.retailPricePerUnit > 0)) {
    throw new ApiError(400, 'Set a retail price per unit to enable direct sale to consumers');
  }

  // Retail can't undercut the bid floor — otherwise consumers could buy below a
  // price the normal bid path (and MSP guidance) would reject.
  if (input.directSaleEnabled && input.retailPricePerUnit! < input.pricePerUnitMin) {
    throw new ApiError(400, `Retail price cannot be below your floor price (${input.pricePerUnitMin})`);
  }

  const listing = await prisma.listing.create({
    data: {
      farmerId: farmerProfile.id,
      cropName: input.cropName,
      cropVariety: input.cropVariety || null,
      quantity: input.quantity,
      remainingQuantity: input.quantity,
      unit: (input.unit as any) || 'KG',
      qualityGrade: input.qualityGrade as any,
      pricePerUnitMin: input.pricePerUnitMin,
      pricePerUnitMax: input.pricePerUnitMax,
      currency: (input.currency as any) || 'INR',
      harvestDate: input.harvestDate ? new Date(input.harvestDate) : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      description: input.description || null,
      images: input.images || [],
      labReportUrl: input.labReportUrl || null,
      organic: input.organic || false,
      location: input.location,
      country: input.country || 'India',
      state: input.state,
      directSaleEnabled: input.directSaleEnabled || false,
      retailPricePerUnit: input.directSaleEnabled ? input.retailPricePerUnit : null,
    },
    include: {
      farmer: {
        include: { user: { select: { id: true, name: true, trustScore: true, avatar: true } } },
      },
    },
  });

  return listing;
}

// =============================================================================
// GET ALL — Paginated listing retrieval
// =============================================================================
// WHY PAGINATION?
// Without it, fetching 10,000 listings in a single query would:
//   - Slow down the database
//   - Send megabytes of JSON to the client
//   - Crash mobile browsers
// Pagination sends 20 items at a time with metadata for the next page.
// =============================================================================
// Public listing endpoints must not broadcast a farmer's private profile
// (bank details, APMC license, FPO name, internal userId). Expose only the
// display fields the marketplace UI actually uses. Reused by getListings,
// getListingById, and mirrored in browse.service.
const PUBLIC_FARMER_SELECT = {
  id: true,
  state: true,
  country: true,
  organicCertified: true,
  certificationBody: true,
  verified: true,
  user: { select: { id: true, name: true, trustScore: true, avatar: true, location: true } },
} as const;

export async function getListings(query: ListingsQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;
  // Whitelist sortable columns. `sort` comes straight from the query string and
  // is used as a Prisma orderBy key; an unknown field makes Prisma throw and the
  // endpoint 500s. Fall back to a safe default instead.
  const SORTABLE_FIELDS = ['createdAt', 'pricePerUnitMin', 'pricePerUnitMax', 'quantity', 'harvestDate', 'expiryDate'];
  const sort = SORTABLE_FIELDS.includes(query.sort || '') ? (query.sort as string) : 'createdAt';
  const order = query.order === 'asc' ? 'asc' : 'desc';

  // Build where clause. Requirement fills are excluded everywhere: they are
  // one-shot SOLD rows that exist only to carry a buyer-requirement deal into
  // the Transaction pipeline, never inventory the farmer listed. Showing them
  // in /listings/my would put phantom lots in the farmer's own stock list.
  // getListingById deliberately does NOT filter, so deep links from a bid or
  // transaction still resolve.
  const where: any = { isRequirementFill: false };
  if (query.farmerId) where.farmerId = query.farmerId;
  if (query.status) where.status = query.status;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
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
// GET BY FARMER — A farmer's own listings
// =============================================================================
export async function getMyListings(userId: string, query: ListingsQuery) {
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId },
  });

  if (!farmerProfile) {
    throw new ApiError(400, 'Farmer profile not found');
  }

  return getListings({ ...query, farmerId: farmerProfile.id });
}

// =============================================================================
// GET ONE — Single listing with full details
// =============================================================================
export async function getListingById(id: string) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      farmer: { select: PUBLIC_FARMER_SELECT },
      _count: { select: { bids: true } },
    },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  return listing;
}

// =============================================================================
// UPDATE — Farmer edits their own listing
// =============================================================================
export async function updateListing(listingId: string, userId: string, input: UpdateListingInput) {
  // Find the listing and verify ownership
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { farmer: true },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  if (listing.farmer.userId !== userId) {
    throw new ApiError(403, 'You can only edit your own listings');
  }

  // Can't edit sold/expired listings
  if (listing.status === 'SOLD' || listing.status === 'EXPIRED') {
    throw new ApiError(400, `Cannot edit a ${listing.status.toLowerCase()} listing`);
  }

  // Validate price range if both are provided
  const minPrice = input.pricePerUnitMin ?? listing.pricePerUnitMin;
  const maxPrice = input.pricePerUnitMax ?? listing.pricePerUnitMax;
  if (minPrice > maxPrice) {
    throw new ApiError(400, 'Minimum price cannot exceed maximum price');
  }

  const directSaleEnabled = input.directSaleEnabled ?? listing.directSaleEnabled;
  const retailPrice = input.retailPricePerUnit ?? listing.retailPricePerUnit;
  if (directSaleEnabled && !(retailPrice && retailPrice > 0)) {
    throw new ApiError(400, 'Set a retail price per unit to enable direct sale to consumers');
  }
  // Retail can't undercut the (possibly just-updated) bid floor.
  if (directSaleEnabled && retailPrice! < minPrice) {
    throw new ApiError(400, `Retail price cannot be below your floor price (${minPrice})`);
  }

  // Reconcile direct-sale stock when the total quantity changes: preserve the
  // units already sold (quantity - remainingQuantity) and recompute what's left,
  // so remainingQuantity never drifts from the real available stock.
  const soldQuantity = listing.quantity - listing.remainingQuantity;
  const reconciledRemaining =
    input.quantity !== undefined ? Math.max(0, input.quantity - soldQuantity) : undefined;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(input.cropName && { cropName: input.cropName }),
      ...(input.cropVariety !== undefined && { cropVariety: input.cropVariety || null }),
      ...(input.quantity !== undefined && { quantity: input.quantity, remainingQuantity: reconciledRemaining }),
      ...(input.unit && { unit: input.unit as any }),
      ...(input.qualityGrade && { qualityGrade: input.qualityGrade as any }),
      ...(input.pricePerUnitMin !== undefined && { pricePerUnitMin: input.pricePerUnitMin }),
      ...(input.pricePerUnitMax !== undefined && { pricePerUnitMax: input.pricePerUnitMax }),
      ...(input.currency && { currency: input.currency as any }),
      ...(input.harvestDate !== undefined && { harvestDate: input.harvestDate ? new Date(input.harvestDate) : null }),
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }),
      // Editing the description invalidates its stored translations, so they
      // are cleared in the SAME write. Without this the listing would show a
      // Hindi buyer a translation of text the farmer has already replaced —
      // worse than showing them the new original, which is what a null falls
      // back to. The controller re-queues a translation right after.
      ...(input.description !== undefined && {
        description: input.description || null,
        descriptionEn: null,
        descriptionHi: null,
        descriptionMr: null,
        descriptionLang: null,
      }),
      ...(input.images && { images: input.images }),
      ...(input.labReportUrl !== undefined && { labReportUrl: input.labReportUrl || null }),
      ...(input.organic !== undefined && { organic: input.organic }),
      ...(input.location && { location: input.location }),
      ...(input.country && { country: input.country }),
      ...(input.state && { state: input.state }),
      ...(input.directSaleEnabled !== undefined && { directSaleEnabled: input.directSaleEnabled }),
      ...(input.retailPricePerUnit !== undefined && { retailPricePerUnit: input.retailPricePerUnit }),
    },
    include: {
      farmer: {
        include: { user: { select: { id: true, name: true, trustScore: true, avatar: true } } },
      },
    },
  });

  return updated;
}

// =============================================================================
// DELETE — Farmer removes their listing
// =============================================================================
export async function deleteListing(listingId: string, userId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { farmer: true },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  if (listing.farmer.userId !== userId) {
    throw new ApiError(403, 'You can only delete your own listings');
  }

  // Don't allow deletion if there are active bids or transactions
  const activeBids = await prisma.bid.count({
    where: { listingId, status: { in: ['PENDING', 'COUNTERED'] } },
  });

  if (activeBids > 0) {
    throw new ApiError(400, 'Cannot delete a listing with active bids. Reject the bids first.');
  }

  await prisma.listing.delete({ where: { id: listingId } });

  return { message: 'Listing deleted successfully' };
}

// =============================================================================
// ADD IMAGES — Upload images to an existing listing
// =============================================================================
export async function addImages(listingId: string, userId: string, imagePaths: string[]) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { farmer: true },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  if (listing.farmer.userId !== userId) {
    throw new ApiError(403, 'You can only add images to your own listings');
  }

  // Max 5 images total
  const totalImages = listing.images.length + imagePaths.length;
  if (totalImages > 5) {
    throw new ApiError(400, `Cannot exceed 5 images. Currently have ${listing.images.length}, trying to add ${imagePaths.length}.`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      images: [...listing.images, ...imagePaths],
    },
  });

  return updated;
}
