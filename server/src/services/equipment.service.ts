// =============================================================================
// Equipment Service — Business Logic for the Machinery Marketplace
// =============================================================================
// A LEAD-GEN surface, not a storefront. Farmers browse what dealers stock,
// raise an enquiry, and the dealer closes offline. Nothing here creates a
// Transaction or touches Razorpay — high-ticket machinery brings warranty,
// servicing and returns problems that have no business sitting next to a
// perishable-produce flow.
//
// THE CONTACT RULE
// A dealer's phone number is the valuable part of this catalogue. Browse and
// detail responses therefore expose only name/location/rating/verified —
// `contactPhone` is returned by exactly one function, createEnquiry, so the
// lead is always captured before the number is handed over. This mirrors how
// farmer contact details are withheld from counterparties elsewhere in the
// codebase; see DEALER_PUBLIC below.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

// Dealer fields safe to return on public endpoints. contactPhone/contactEmail
// are deliberately absent — adding them here would leak every dealer's number
// to an unauthenticated scrape of /api/equipment.
const DEALER_PUBLIC = {
  id: true,
  name: true,
  location: true,
  state: true,
  verified: true,
  rating: true,
  smamEmpanelled: true,
} as const;

// Mirrors the Prisma enums. Kept as plain string unions so controllers can
// validate query strings without importing generated types.
const CATEGORIES = [
  'TRACTOR', 'TILLAGE', 'HARVESTER', 'IRRIGATION',
  'SPRAYER', 'THRESHER', 'POWER', 'TOOLS',
] as const;
export type EquipmentCategory = (typeof CATEGORIES)[number];

const MODES = ['SALE', 'RENT', 'BOTH'] as const;
export type EquipmentMode = (typeof MODES)[number];

// Farmer-facing labels. The API ships these alongside results so the web and
// mobile clients don't each keep their own copy that drifts.
export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  TRACTOR: 'Tractors & tillers',
  TILLAGE: 'Tillage & ploughing',
  HARVESTER: 'Harvesters & reapers',
  IRRIGATION: 'Pumps, pipes & irrigation',
  SPRAYER: 'Sprayers',
  THRESHER: 'Threshers & shellers',
  POWER: 'Motors & engines',
  TOOLS: 'Tools & attachments',
};

export function isCategory(v: string): v is EquipmentCategory {
  return (CATEGORIES as readonly string[]).includes(v);
}

interface BrowseQuery {
  page?: number;
  limit?: number;
  category?: string;
  mode?: string;   // SALE or RENT — a BOTH listing matches either
  state?: string;
  q?: string;      // Free text over title/brand/model
  maxPrice?: number;
}

// =============================================================================
// BROWSE — Public catalogue, paginated and filtered
// =============================================================================
export async function browseEquipment(query: BrowseQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));

  // Only live rows from live dealers. A deactivated dealer takes their whole
  // catalogue down with them — otherwise we'd hand out leads nobody answers.
  const where: any = { active: true, dealer: { active: true } };

  if (query.category && isCategory(query.category)) {
    where.category = query.category;
  }

  // A BOTH listing satisfies a SALE filter and a RENT filter alike, so we match
  // on [requested, BOTH] rather than equality.
  if (query.mode === 'SALE' || query.mode === 'RENT') {
    where.mode = { in: [query.mode, 'BOTH'] };
  }

  if (query.state) {
    where.state = { equals: query.state, mode: 'insensitive' };
  }

  if (query.q) {
    const q = query.q.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { modelName: { contains: q, mode: 'insensitive' } },
      ];
    }
  }

  // Price ceiling applies to whichever rate the farmer is shopping on: day rate
  // when they asked for rentals, sale price otherwise. Filtering sale price on
  // a RENT search would silently drop every rent-only row (salePrice is null).
  //
  // A rental may be priced by the day, by the hour, or both, and the clients
  // lead with the day rate and fall back to the hourly one. The ceiling has to
  // test whichever rate the farmer actually sees, so an hourly-only machine is
  // judged on its hourly rate rather than vanishing on a null day rate. Nested
  // under AND because the free-text search above already owns `where.OR`.
  if (typeof query.maxPrice === 'number' && Number.isFinite(query.maxPrice)) {
    if (query.mode === 'RENT') {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { rentPricePerDay: { lte: query.maxPrice } },
            { rentPricePerDay: null, rentPricePerHour: { lte: query.maxPrice } },
          ],
        },
      ];
    } else {
      where.salePrice = { lte: query.maxPrice };
    }
  }

  const [equipment, total] = await Promise.all([
    prisma.equipment.findMany({
      where,
      // Verified dealers first — the curation is the reason to browse here
      // rather than on a classifieds site.
      orderBy: [{ dealer: { verified: 'desc' } }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: { dealer: { select: DEALER_PUBLIC } },
    }),
    prisma.equipment.count({ where }),
  ]);

  return {
    equipment,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// =============================================================================
// DETAIL — One machine, still without the dealer's phone number
// =============================================================================
export async function getEquipmentById(id: string) {
  // A deactivated dealer takes their catalogue down here too, not just in
  // browse — otherwise a shared or guessed URL keeps serving stock nobody will
  // answer for. Filtered in the query rather than checked afterwards, so
  // `active` never has to join DEALER_PUBLIC and leak into the response.
  const equipment = await prisma.equipment.findFirst({
    where: { id, active: true, dealer: { active: true } },
    include: { dealer: { select: DEALER_PUBLIC } },
  });

  if (!equipment) {
    throw new ApiError(404, 'Equipment not found');
  }

  return equipment;
}

// =============================================================================
// META — Categories and the states we actually have stock in
// =============================================================================
// Lets clients build filter chips from real data instead of a hardcoded list
// that shows empty categories.
export async function getEquipmentMeta() {
  const [byCategory, states] = await Promise.all([
    prisma.equipment.groupBy({
      by: ['category'],
      where: { active: true, dealer: { active: true } },
      _count: { _all: true },
    }),
    prisma.equipment.findMany({
      where: { active: true, dealer: { active: true } },
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    }),
  ]);

  return {
    categories: CATEGORIES.map((id) => ({
      id,
      label: CATEGORY_LABEL[id],
      count: byCategory.find((c) => c.category === id)?._count._all ?? 0,
    })),
    states: states.map((s) => s.state),
  };
}

interface CreateEnquiryInput {
  intent: 'SALE' | 'RENT';
  message?: string;
  rentFrom?: string;
  rentTo?: string;
}

// =============================================================================
// ENQUIRE — Capture the lead, then release the dealer's number
// =============================================================================
// This is the only path that returns contactPhone. Requiring auth to reach it
// means every number handed out is attached to a farmer we can follow up with,
// and the catalogue can't be scraped for a dealer contact list.
export async function createEnquiry(
  equipmentId: string,
  userId: string,
  input: CreateEnquiryInput
) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: { dealer: true },
  });

  if (!equipment || !equipment.active || !equipment.dealer.active) {
    throw new ApiError(404, 'Equipment not found');
  }

  // A SALE-only machine can't be hired and vice versa. `mode: BOTH` accepts
  // either intent, which is why intent is required rather than inferred.
  if (equipment.mode !== 'BOTH' && equipment.mode !== input.intent) {
    const offered = equipment.mode === 'SALE' ? 'sale' : 'hire';
    throw new ApiError(400, `This machine is listed for ${offered} only`);
  }

  // Rental dates are advisory — we hold no availability calendar, the dealer
  // confirms on the call. Still worth rejecting a backwards range so the lead
  // reaching the dealer makes sense.
  let rentFrom: Date | undefined;
  let rentTo: Date | undefined;

  if (input.intent === 'RENT') {
    rentFrom = input.rentFrom ? new Date(input.rentFrom) : undefined;
    rentTo = input.rentTo ? new Date(input.rentTo) : undefined;

    if (rentFrom && Number.isNaN(rentFrom.getTime())) {
      throw new ApiError(400, 'Invalid rental start date');
    }
    if (rentTo && Number.isNaN(rentTo.getTime())) {
      throw new ApiError(400, 'Invalid rental end date');
    }
    if (rentFrom && rentTo && rentTo < rentFrom) {
      throw new ApiError(400, 'Rental end date must be after the start date');
    }
  }

  const enquiry = await prisma.equipmentEnquiry.create({
    data: {
      equipmentId,
      userId,
      intent: input.intent,
      message: input.message,
      rentFrom,
      rentTo,
    },
  });

  return {
    enquiry,
    // The payoff for raising an enquiry: now the farmer can call.
    dealer: {
      name: equipment.dealer.name,
      location: equipment.dealer.location,
      state: equipment.dealer.state,
      contactPhone: equipment.dealer.contactPhone,
      contactEmail: equipment.dealer.contactEmail,
      verified: equipment.dealer.verified,
      smamEmpanelled: equipment.dealer.smamEmpanelled,
    },
  };
}

// =============================================================================
// MY ENQUIRIES — So a farmer can find the dealer's number again later
// =============================================================================
export async function getMyEnquiries(userId: string) {
  const enquiries = await prisma.equipmentEnquiry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      equipment: {
        include: {
          // Contact details belong here: the farmer already raised this
          // enquiry, so they've earned the number. Scoped by userId above.
          dealer: {
            select: { ...DEALER_PUBLIC, contactPhone: true, contactEmail: true },
          },
        },
      },
    },
  });

  return { enquiries, total: enquiries.length };
}
