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

import { assertNoContactDetails } from '../utils/contactDetails';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { PUBLIC_SELLER_SELECT, nameOnlySellers } from './publicSeller';
import { parseFreightPayer } from '../utils/freight';

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
  freightPaidBy?: string;
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
  // Changing it moves only bids made from now on: each bid carries its own copy.
  freightPaidBy?: string;
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
  // CropBid is the point of contact: no phone, email or chat link in text the
  // other side reads (utils/contactDetails.ts).
  assertNoContactDetails(input.description, 'The description');
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
      freightPaidBy: parseFreightPayer(input.freightPaidBy) ?? 'FARMER',
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
        farmer: { select: PUBLIC_SELLER_SELECT },
        _count: { select: { bids: true } },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings: nameOnlySellers(listings),
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
      farmer: { select: PUBLIC_SELLER_SELECT },
      _count: { select: { bids: true } },
    },
  });

  if (!listing) {
    throw new ApiError(404, 'Listing not found');
  }

  return nameOnlySellers(listing);
}

// =============================================================================
// UPDATE — Farmer edits their own listing
// =============================================================================
export async function updateListing(listingId: string, userId: string, input: UpdateListingInput) {
  // CropBid is the point of contact: no phone, email or chat link in text the
  // other side reads (utils/contactDetails.ts).
  assertNoContactDetails(input.description, 'The description');
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

  const freightPaidBy = parseFreightPayer(input.freightPaidBy);

  // ONE TRANSACTION, the row locked first. Everything the edit depends on is
  // re-read under the lock and every field is written in one statement, so an
  // auction starting (its claim waits on this lock), a sale, or a failure
  // part way can never see half an edit: the lot carries either the old terms
  // or the complete new ones.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    const current = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
    if (current.status === 'SOLD' || current.status === 'EXPIRED') {
      throw new ApiError(400, `Cannot edit a ${current.status.toLowerCase()} listing`);
    }

    const freightChanges = !!freightPaidBy && freightPaidBy !== current.freightPaidBy;
    const quantityChanges = input.quantity !== undefined && input.quantity !== current.quantity;
    const unitChanges = !!input.unit && input.unit !== current.unit;
    const currencyChanges = !!input.currency && input.currency !== current.currency;

    // What an auction sells is fixed when it opens: bidders bid on that
    // quantity, in that unit and currency, on those delivery terms, and the
    // winner is billed for it. None of them may move mid-auction.
    if (current.status === 'IN_AUCTION' && (freightChanges || quantityChanges || unitChanges || currencyChanges)) {
      throw new ApiError(
        409,
        'Quantity, unit, currency and delivery terms cannot change while the lot is in a live auction.',
        'AUCTION_TERMS_LOCKED',
      );
    }

    // A deal already made on this lot reads its unit and currency from the
    // listing (neither Bid nor Transaction stores them), so changing either
    // would turn "6 quintals" into "6 kg" on a deal whose amount stays put.
    if ((unitChanges || currencyChanges) && (await tx.transaction.count({ where: { listingId } })) > 0) {
      throw new ApiError(
        409,
        'This lot already has deals, so its unit and currency cannot change. List the rest as a new lot instead.',
        'LOT_HAS_DEALS',
      );
    }

    // Reconcile direct-sale stock when the total quantity changes: preserve the
    // units already sold (quantity - remainingQuantity) and recompute what's
    // left, so remainingQuantity never drifts from the real available stock.
    const soldQuantity = current.quantity - current.remainingQuantity;
    const reconciledRemaining = quantityChanges ? Math.max(0, input.quantity! - soldQuantity) : undefined;

    return tx.listing.update({
      where: { id: listingId },
      data: {
        ...(freightChanges && { freightPaidBy }),
        ...(quantityChanges && { quantity: input.quantity, remainingQuantity: reconciledRemaining }),
        ...(unitChanges && { unit: input.unit as any }),
        ...(currencyChanges && { currency: input.currency as any }),
        ...(input.cropName && { cropName: input.cropName }),
        ...(input.cropVariety !== undefined && { cropVariety: input.cropVariety || null }),
        ...(input.qualityGrade && { qualityGrade: input.qualityGrade as any }),
        ...(input.pricePerUnitMin !== undefined && { pricePerUnitMin: input.pricePerUnitMin }),
        ...(input.pricePerUnitMax !== undefined && { pricePerUnitMax: input.pricePerUnitMax }),
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
  });
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
