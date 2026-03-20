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
  status?: string;
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

  const listing = await prisma.listing.create({
    data: {
      farmerId: farmerProfile.id,
      cropName: input.cropName,
      cropVariety: input.cropVariety || null,
      quantity: input.quantity,
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
export async function getListings(query: ListingsQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;
  const sort = query.sort || 'createdAt';
  const order = query.order || 'desc';

  // Build where clause
  const where: any = {};
  if (query.farmerId) where.farmerId = query.farmerId;
  if (query.status) where.status = query.status;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        farmer: {
          include: { user: { select: { id: true, name: true, trustScore: true, avatar: true } } },
        },
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
      farmer: {
        include: { user: { select: { id: true, name: true, trustScore: true, avatar: true, location: true } } },
      },
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

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(input.cropName && { cropName: input.cropName }),
      ...(input.cropVariety !== undefined && { cropVariety: input.cropVariety || null }),
      ...(input.quantity && { quantity: input.quantity }),
      ...(input.unit && { unit: input.unit as any }),
      ...(input.qualityGrade && { qualityGrade: input.qualityGrade as any }),
      ...(input.pricePerUnitMin !== undefined && { pricePerUnitMin: input.pricePerUnitMin }),
      ...(input.pricePerUnitMax !== undefined && { pricePerUnitMax: input.pricePerUnitMax }),
      ...(input.currency && { currency: input.currency as any }),
      ...(input.harvestDate !== undefined && { harvestDate: input.harvestDate ? new Date(input.harvestDate) : null }),
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.images && { images: input.images }),
      ...(input.labReportUrl !== undefined && { labReportUrl: input.labReportUrl || null }),
      ...(input.organic !== undefined && { organic: input.organic }),
      ...(input.location && { location: input.location }),
      ...(input.country && { country: input.country }),
      ...(input.state && { state: input.state }),
      ...(input.status && { status: input.status as any }),
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
