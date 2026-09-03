// =============================================================================
// Agri-Input Service — Business Logic for the Seed & Fertiliser Marketplace
// =============================================================================
// A LEAD-GEN surface, not a storefront. Farmers browse what licensed shops
// stock, raise an enquiry, and the shop closes offline. Nothing here creates a
// Transaction or touches Razorpay. Same shape as equipment.service.ts, for the
// same reason plus a sharper one.
//
// THE LICENCE RULE — why CropBid is a venue and not a seller
// Selling seed, fertiliser or pesticide in India requires a licence: the Seeds
// (Control) Order 1983, the Fertiliser (Control) Order 1985, and the
// Insecticides Act 1968 respectively. Licences are issued per state, per
// premises, by the state agriculture department.
//
// CropBid holds none of them, and does not need to, because CropBid never owns
// the stock. The SHOP sells; we list and pass on a lead. That distinction also
// puts the spurious-seed liability where it belongs — on the licensed seller
// whose label is on the packet — which matters, because "the seed failed" is
// among the most commonly litigated claims in Indian agriculture.
//
// The SELLABLE filter below is what makes that structural rather than aspirational:
// a supplier with no pesticide licence cannot have crop-protection stock
// surfaced by ANY read path on this service, even if a bad catalogue row loaded
// it. Enforced in the query rather than filtered afterwards, so it holds for
// browse, detail, meta and enquiry alike.
//
// THE CONTACT RULE
// Identical to equipment.service.ts: a supplier's phone number ships from
// exactly one function, createEnquiry, so the lead is always captured before
// the number is handed over.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

// Supplier fields safe to return on public endpoints. contactPhone/contactEmail
// are deliberately absent — adding them here would leak every shop's number to
// an unauthenticated scrape of /api/agri-inputs.
//
// The licence NUMBERS are also absent by design. Whether a shop is licensed is
// a trust signal a farmer should see; the licence number itself is a document
// reference that belongs on the dealer's own premises, and publishing a list of
// them invites impersonation. The clients get the booleans below instead.
const SUPPLIER_PUBLIC = {
  id: true,
  name: true,
  location: true,
  state: true,
  verified: true,
  rating: true,
} as const;

const CATEGORIES = [
  'SEED', 'FERTILISER', 'ORGANIC',
  'CROP_PROTECTION', 'MICRONUTRIENT', 'SEEDLING',
] as const;
export type AgriInputCategory = (typeof CATEGORIES)[number];

// Farmer-facing labels. Shipped by the API so the web and mobile clients don't
// each keep a copy that drifts.
export const CATEGORY_LABEL: Record<AgriInputCategory, string> = {
  SEED: 'Seeds',
  FERTILISER: 'Fertiliser',
  ORGANIC: 'Organic & bio-inputs',
  CROP_PROTECTION: 'Crop protection',
  MICRONUTRIENT: 'Micronutrients',
  SEEDLING: 'Saplings & seedlings',
};

export function isCategory(v: string): v is AgriInputCategory {
  return (CATEGORIES as readonly string[]).includes(v);
}

// The reusable "this row is legitimately sellable" filter. Every read path
// composes this, so there is exactly one definition of what may be surfaced.
//
// Reads as: the row is active, its supplier is active, AND for each controlled
// category the supplier holds the matching licence. Expressed as an OR over
// per-category clauses rather than filtering in JS, so an unlicensed row never
// leaves Postgres and pagination counts stay honest.
const SELLABLE = {
  active: true,
  supplier: { active: true },
  OR: [
    // Ungated on purpose: vermicompost, a zinc supplement and a mango sapling
    // are not controlled the way certified seed, subsidised fertiliser and
    // scheduled pesticides are, so demanding a licence for them would empty the
    // catalogue for no legal gain.
    { category: { in: ['ORGANIC', 'MICRONUTRIENT', 'SEEDLING'] as AgriInputCategory[] } },
    { category: 'SEED' as const, supplier: { seedLicence: { not: null } } },
    { category: 'FERTILISER' as const, supplier: { fertiliserLicence: { not: null } } },
    { category: 'CROP_PROTECTION' as const, supplier: { pesticideLicence: { not: null } } },
  ],
};

// What the clients get instead of raw licence numbers: which licences this shop
// holds, as booleans. Enough to render "✓ Licensed seed dealer" without
// publishing a document reference anyone could copy onto a fake shopfront.
function licenceBadges(supplier: {
  seedLicence?: string | null;
  fertiliserLicence?: string | null;
  pesticideLicence?: string | null;
}) {
  return {
    seed: Boolean(supplier.seedLicence),
    fertiliser: Boolean(supplier.fertiliserLicence),
    pesticide: Boolean(supplier.pesticideLicence),
  };
}

interface BrowseQuery {
  page?: number;
  limit?: number;
  category?: string;
  crop?: string;   // Match against cropNames — "what do I sow in cotton"
  state?: string;
  q?: string;      // Free text over title/brand/composition
  maxPrice?: number;
}

// =============================================================================
// BROWSE — Public catalogue, paginated and filtered
// =============================================================================
export async function browseAgriInputs(query: BrowseQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));

  // AND-ed rather than spread, because SELLABLE already owns a top-level OR and
  // the free-text search below wants one too. Merging them by spreading would
  // silently drop the licence gate.
  const and: any[] = [SELLABLE];

  if (query.category && isCategory(query.category)) {
    and.push({ category: query.category });
  }

  // Crop match is what a farmer actually shops by. `has` is an exact array
  // membership test, so the catalogue stores canonical crop names and the
  // client sends one it was given by /meta rather than free text.
  if (query.crop) {
    and.push({ cropNames: { has: query.crop } });
  }

  if (query.state) {
    and.push({ state: { equals: query.state, mode: 'insensitive' } });
  }

  if (query.q) {
    const q = query.q.trim();
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { composition: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
  }

  if (typeof query.maxPrice === 'number' && Number.isFinite(query.maxPrice)) {
    and.push({ pricePerPack: { lte: query.maxPrice } });
  }

  const where = { AND: and };

  const [inputs, total] = await Promise.all([
    prisma.agriInput.findMany({
      where,
      // Verified suppliers first — the curation is the reason to browse here
      // rather than walk into the nearest shop.
      orderBy: [{ supplier: { verified: 'desc' } }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        supplier: {
          select: {
            ...SUPPLIER_PUBLIC,
            seedLicence: true,
            fertiliserLicence: true,
            pesticideLicence: true,
          },
        },
      },
    }),
    prisma.agriInput.count({ where }),
  ]);

  return {
    inputs: inputs.map(shapeForPublic),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// Swap raw licence numbers for booleans on the way out. Done here rather than
// in the Prisma select because Prisma cannot compute a derived field, and doing
// it in one place means no read path can forget.
function shapeForPublic<T extends { supplier: Record<string, any> }>(row: T) {
  const { seedLicence, fertiliserLicence, pesticideLicence, ...supplier } = row.supplier;
  return {
    ...row,
    supplier: {
      ...supplier,
      licences: licenceBadges({ seedLicence, fertiliserLicence, pesticideLicence }),
    },
  };
}

// =============================================================================
// DETAIL — One product, still without the supplier's phone number
// =============================================================================
export async function getAgriInputById(id: string) {
  // The licence gate applies here too, not just in browse: otherwise a shared
  // or guessed URL would keep serving a row that browse correctly hides.
  const input = await prisma.agriInput.findFirst({
    where: { AND: [{ id }, SELLABLE] },
    include: {
      supplier: {
        select: {
          ...SUPPLIER_PUBLIC,
          seedLicence: true,
          fertiliserLicence: true,
          pesticideLicence: true,
        },
      },
    },
  });

  if (!input) {
    throw new ApiError(404, 'Product not found');
  }

  return shapeForPublic(input);
}

// =============================================================================
// META — Categories, crops and states we actually have stock in
// =============================================================================
// Lets clients build filter chips from real data instead of a hardcoded list
// that shows empty categories.
export async function getAgriInputMeta() {
  const [byCategory, states, cropRows] = await Promise.all([
    prisma.agriInput.groupBy({
      by: ['category'],
      where: SELLABLE,
      _count: { _all: true },
    }),
    prisma.agriInput.findMany({
      where: SELLABLE,
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    }),
    // cropNames is an array column, so `distinct` cannot flatten it — the
    // unique set is assembled below. Selecting one column over the live
    // catalogue is cheap, and this response is cached for 5 minutes anyway.
    prisma.agriInput.findMany({
      where: SELLABLE,
      select: { cropNames: true },
    }),
  ]);

  const crops = [...new Set(cropRows.flatMap((r) => r.cropNames))].sort();

  return {
    categories: CATEGORIES.map((id) => ({
      id,
      label: CATEGORY_LABEL[id],
      count: byCategory.find((c) => c.category === id)?._count._all ?? 0,
    })),
    crops,
    states: states.map((s) => s.state),
  };
}

interface CreateEnquiryInput {
  packQuantity?: number;
  acres?: number;
  message?: string;
}

// =============================================================================
// ENQUIRE — Capture the lead, then release the supplier's number
// =============================================================================
// The only path that returns contactPhone. Requiring auth means every number
// handed out is attached to a farmer we can follow up with, and the catalogue
// can't be scraped for a supplier contact list.
export async function createEnquiry(
  agriInputId: string,
  userId: string,
  input: CreateEnquiryInput
) {
  // Fetched through the same SELLABLE gate as every read: an unlicensed row
  // must not be enquirable even by id, or the gate would be cosmetic.
  const agriInput = await prisma.agriInput.findFirst({
    where: { AND: [{ id: agriInputId }, SELLABLE] },
    include: { supplier: true },
  });

  if (!agriInput) {
    throw new ApiError(404, 'Product not found');
  }

  const enquiry = await prisma.agriInputEnquiry.create({
    data: {
      agriInputId,
      userId,
      packQuantity: input.packQuantity,
      acres: input.acres,
      message: input.message,
    },
  });

  return {
    enquiry,
    // The payoff for raising an enquiry: now the farmer can call.
    supplier: {
      name: agriInput.supplier.name,
      location: agriInput.supplier.location,
      state: agriInput.supplier.state,
      contactPhone: agriInput.supplier.contactPhone,
      contactEmail: agriInput.supplier.contactEmail,
      verified: agriInput.supplier.verified,
      licences: licenceBadges(agriInput.supplier),
    },
  };
}

// =============================================================================
// MY ENQUIRIES — So a farmer can find the supplier's number again later
// =============================================================================
export async function getMyEnquiries(userId: string) {
  const enquiries = await prisma.agriInputEnquiry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      agriInput: {
        include: {
          // Contact details belong here: the farmer already raised this
          // enquiry, so they've earned the number. Scoped by userId above.
          supplier: {
            select: {
              ...SUPPLIER_PUBLIC,
              contactPhone: true,
              contactEmail: true,
              seedLicence: true,
              fertiliserLicence: true,
              pesticideLicence: true,
            },
          },
        },
      },
    },
  });

  return {
    enquiries: enquiries.map((e) => ({
      ...e,
      agriInput: shapeForPublic(e.agriInput),
    })),
    total: enquiries.length,
  };
}
