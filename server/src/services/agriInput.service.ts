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

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { canonicalState } from '../utils/indianStates';

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

export const CATEGORIES = [
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

// The same licence rule as data rather than as a query: which column each
// controlled category needs. SELLABLE stays the one that decides what a farmer
// sees; this only exists so the admin view can say WHICH licence a hidden row is
// waiting on. agriInput.admin.test.ts holds the two together against a real
// database, so a category gated in one and not the other fails there.
type LicenceColumn = 'seedLicence' | 'fertiliserLicence' | 'pesticideLicence';

export const REQUIRED_LICENCE: Record<AgriInputCategory, LicenceColumn | null> = {
  SEED: 'seedLicence',
  FERTILISER: 'fertiliserLicence',
  CROP_PROTECTION: 'pesticideLicence',
  ORGANIC: null,
  MICRONUTRIENT: null,
  SEEDLING: null,
};

export type LicenceKind = 'seed' | 'fertiliser' | 'pesticide';

const LICENCE_BADGE: Record<LicenceColumn, LicenceKind> = {
  seedLicence: 'seed',
  fertiliserLicence: 'fertiliser',
  pesticideLicence: 'pesticide',
};

const LICENCE_COLUMNS = Object.keys(LICENCE_BADGE) as LicenceColumn[];

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

  // One lead per account per product, held by a unique index rather than a
  // look-before-insert, so a double tap racing itself still writes one row. A
  // repeat gets the lead already on file and the number with it: they earned
  // the number the first time, and asking again must not put a second copy of
  // the same lead in front of the shop. This stops one account filling the
  // table; enquiryLimiter on the route is what stops it walking the catalogue.
  let enquiry;
  let created = true;
  try {
    enquiry = await prisma.agriInputEnquiry.create({
      data: {
        agriInputId,
        userId,
        packQuantity: input.packQuantity,
        acres: input.acres,
        message: input.message,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
    enquiry = await prisma.agriInputEnquiry.findUniqueOrThrow({
      where: { userId_agriInputId: { userId, agriInputId } },
    });
    created = false;
  }

  return {
    enquiry,
    // False on a repeat, so the controller answers 200 rather than 201.
    created,
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

// =============================================================================
// ADMIN — The whole catalogue, including what the licence gate hides
// =============================================================================
// Every read above sees the catalogue through SELLABLE, which is right for a
// farmer and left ops blind: on production a fresh load hides every seed,
// fertiliser and crop-protection row until someone enters a checked licence by
// hand (CLAUDE.md §10), and no screen showed which rows those were or what each
// one was waiting on.
//
// So these two skip the gate and report on it instead. Whether a row is live is
// decided by running SELLABLE itself over the page rather than re-deriving it,
// so this view cannot disagree with /inputs about what a farmer sees.
// hiddenBecause is only the explanation.
//
// Being ops does not open the two things the rest of this file keeps in: no
// contactPhone, and licences as booleans, never numbers.

const ADMIN_SUPPLIER = {
  ...SUPPLIER_PUBLIC,
  active: true,
  seedLicence: true,
  fertiliserLicence: true,
  pesticideLicence: true,
} as const;

// The include every admin product read uses, so a row read back after a write
// has exactly the shape the list gave it.
const ADMIN_ROW_INCLUDE = {
  supplier: { select: ADMIN_SUPPLIER },
  _count: { select: { enquiries: true } },
} as const;

type AdminRowSource = Prisma.AgriInputGetPayload<{ include: typeof ADMIN_ROW_INCLUDE }>;

// Everything standing between a row and /inputs, not just the first thing: a
// product taken off by hand at a shop with no licence needs both put right, and
// naming one would send someone to fix it and find nothing changed.
export function hiddenBecause(row: {
  active: boolean;
  category: AgriInputCategory;
  supplier: { active: boolean } & Record<LicenceColumn, string | null>;
}): string[] {
  const reasons: string[] = [];
  if (!row.active) reasons.push('Taken off the catalogue');
  if (!row.supplier.active) reasons.push('The shop is taken off the catalogue');
  const needed = REQUIRED_LICENCE[row.category];
  // `== null` rather than falsy, to match SELLABLE's `not: null` exactly.
  if (needed && row.supplier[needed] == null) {
    reasons.push(`No ${LICENCE_BADGE[needed]} licence on file for this shop`);
  }
  return reasons;
}

interface AdminCatalogueQuery {
  category?: AgriInputCategory;
  visibility?: 'live' | 'hidden';
  q?: string;
  limit: number;
  offset: number;
}

export async function listCatalogueForAdmin(query: AdminCatalogueQuery) {
  const and: Prisma.AgriInputWhereInput[] = [];

  if (query.category) and.push({ category: query.category });
  if (query.visibility === 'live') and.push(SELLABLE);
  if (query.visibility === 'hidden') and.push({ NOT: SELLABLE });

  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { composition: { contains: q, mode: 'insensitive' } },
        // Ops think in shops as often as in products: "what does Godavari have".
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const where: Prisma.AgriInputWhereInput = { AND: and };

  const [rows, total, allByCategory, liveByCategory] = await Promise.all([
    prisma.agriInput.findMany({
      where,
      // Grouped the way the category pills are, then alphabetical, so a page
      // reads like a shelf rather than in whatever order a loader inserted it.
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      skip: query.offset,
      take: query.limit,
      include: ADMIN_ROW_INCLUDE,
    }),
    prisma.agriInput.count({ where }),
    // The headline counts are the whole catalogue, whatever the filter, so the
    // numbers at the top do not change meaning as someone clicks around.
    prisma.agriInput.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.agriInput.groupBy({ by: ['category'], where: SELLABLE, _count: { _all: true } }),
  ]);

  const liveIds = new Set(
    (
      await prisma.agriInput.findMany({
        where: { AND: [{ id: { in: rows.map((r) => r.id) } }, SELLABLE] },
        select: { id: true },
      })
    ).map((r) => r.id)
  );

  const categories = CATEGORIES.map((id) => {
    const needs = REQUIRED_LICENCE[id];
    return {
      id,
      label: CATEGORY_LABEL[id],
      // Which licence the category needs, so the add-product form can warn
      // before saving instead of keeping its own copy of the rule.
      licence: needs ? LICENCE_BADGE[needs] : null,
      total: allByCategory.find((c) => c.category === id)?._count._all ?? 0,
      live: liveByCategory.find((c) => c.category === id)?._count._all ?? 0,
    };
  });

  return {
    inputs: rows.map((row) => toAdminRow(row, liveIds.has(row.id))),
    total,
    counts: {
      total: categories.reduce((n, c) => n + c.total, 0),
      live: categories.reduce((n, c) => n + c.live, 0),
    },
    categories,
  };
}

function toAdminRow({ _count, supplier, ...row }: AdminRowSource, live: boolean) {
  const reasons = live ? [] : hiddenBecause({ ...row, supplier });
  const { seedLicence, fertiliserLicence, pesticideLicence, ...shop } = supplier;
  return {
    ...row,
    live,
    // A hidden row always says something. An empty list here would mean
    // SELLABLE and REQUIRED_LICENCE have drifted apart, which the admin test
    // exists to catch, but the screen should not go quiet if it does.
    hiddenBecause: live ? [] : reasons.length > 0 ? reasons : ['Hidden by the catalogue rules'],
    enquiries: _count.enquiries,
    supplier: {
      ...shop,
      licences: licenceBadges({ seedLicence, fertiliserLicence, pesticideLicence }),
    },
  };
}

async function getAdminRow(id: string) {
  const [row, live] = await Promise.all([
    prisma.agriInput.findUnique({ where: { id }, include: ADMIN_ROW_INCLUDE }),
    prisma.agriInput.count({ where: { AND: [{ id }, SELLABLE] } }),
  ]);
  if (!row) throw new ApiError(404, 'Product not found');
  return toAdminRow(row, live > 0);
}

// Unpaginated on purpose: shops are added one at a time by a person, from the
// admin panel or the catalogue file, so this is a list somebody typed in rather
// than a table that grows by itself.
export async function listSuppliersForAdmin(only?: { id: string }) {
  const [suppliers, stocked, liveBySupplier] = await Promise.all([
    prisma.inputSupplier.findMany({
      where: only,
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
      select: { ...ADMIN_SUPPLIER, _count: { select: { inputs: true } } },
    }),
    // What each shop stocks, to work out which licences its own shelf needs.
    // A shop selling only compost needs none, and should not be told otherwise.
    prisma.agriInput.groupBy({
      by: ['supplierId', 'category'],
      where: { active: true, ...(only && { supplierId: only.id }) },
    }),
    prisma.agriInput.groupBy({
      by: ['supplierId'],
      where: only ? { AND: [{ supplierId: only.id }, SELLABLE] } : SELLABLE,
      _count: { _all: true },
    }),
  ]);

  return {
    suppliers: suppliers.map(({ _count, seedLicence, fertiliserLicence, pesticideLicence, ...shop }) => {
      const held: Record<LicenceColumn, string | null> = { seedLicence, fertiliserLicence, pesticideLicence };
      const missing = new Set<LicenceColumn>();
      for (const row of stocked) {
        if (row.supplierId !== shop.id) continue;
        const needed = REQUIRED_LICENCE[row.category];
        if (needed && held[needed] == null) missing.add(needed);
      }
      return {
        ...shop,
        licences: licenceBadges(held),
        // The licences this shop's own stock is waiting on. The one line on the
        // screen that says what to go and get. Walked in a fixed order because
        // groupBy returns rows in whatever order Postgres likes.
        missingLicences: LICENCE_COLUMNS.filter((c) => missing.has(c)).map((c) => LICENCE_BADGE[c]),
        products: _count.inputs,
        live: liveBySupplier.find((r) => r.supplierId === shop.id)?._count._all ?? 0,
      };
    }),
  };
}

async function getAdminSupplier(id: string) {
  const { suppliers } = await listSuppliersForAdmin({ id });
  if (!suppliers[0]) throw new ApiError(404, 'Shop not found');
  return suppliers[0];
}

// =============================================================================
// ADMIN WRITES — adding shops and products, and entering licences
// =============================================================================
// The catalogue used to reach the database only through the loader file (§7).
// These let ops add to it from the admin panel instead. Nothing here goes round
// SELLABLE: a product added to a shop with no seed licence is written, and stays
// hidden from farmers until the licence is on file, exactly like a loaded one.
//
// The rules a product has to satisfy live here rather than in the controller,
// so any future caller is bound by them too.

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// /inputs filters by exact crop name (`has`), so "cotton" typed here next to a
// catalogue's "Cotton" would make a second Cotton chip, and the new product
// would be missing from the first. A name the catalogue already uses is
// matched whatever its case; a new one is kept, with a capital.
async function canonicalCrops(names: string[]): Promise<string[]> {
  const rows = await prisma.agriInput.findMany({ select: { cropNames: true } });
  const known = new Map(rows.flatMap((r) => r.cropNames).map((c) => [c.toLowerCase(), c]));
  const out = names
    .map((n) => n.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((n) => known.get(n.toLowerCase()) ?? n.charAt(0).toUpperCase() + n.slice(1));
  return [...new Set(out)];
}

export interface AgriInputFields {
  title: string;
  category: AgriInputCategory;
  brand: string | null;
  cropNames: string[];
  packSize: string;
  pricePerPack: number;
  subsidised: boolean;
  composition: string | null;
  germinationPct: number | null;
  seedTreatment: string | null;
  dosagePerAcre: string | null;
  specs: string[];
  description: string | null;
}

// Checked on the product as it will be saved, not on the request, so an edit
// that changes only the category is held to the same rules as a new product.
function assertProductRules(p: AgriInputFields) {
  // A statutory MRP is a fertiliser thing (urea, DAP, MOP). On anything else the
  // "set by government" line /inputs prints under a subsidised row would be false.
  if (p.subsidised && p.category !== 'FERTILISER') {
    throw new ApiError(400, 'Only fertiliser carries a government-set price');
  }
  // These print as the seed label on /inputs. On a bag of urea they would read
  // as a germination guarantee it does not have.
  if (p.category !== 'SEED' && (p.germinationPct != null || p.seedTreatment != null)) {
    throw new ApiError(400, 'Germination and seed treatment are for seed only');
  }
  if (p.cropNames.length === 0) {
    throw new ApiError(400, 'Pick at least one crop: it is how farmers find a product');
  }
}

export async function createAgriInput(supplierId: string, fields: AgriInputFields) {
  const supplier = await prisma.inputSupplier.findUnique({
    where: { id: supplierId },
    select: { id: true, location: true, state: true },
  });
  if (!supplier) throw new ApiError(404, 'Shop not found');

  const data = {
    ...fields,
    cropNames: await canonicalCrops(fields.cropNames),
    pricePerPack: Math.round(fields.pricePerPack * 100) / 100,
  };
  assertProductRules(data);

  try {
    const created = await prisma.agriInput.create({
      data: {
        ...data,
        supplierId,
        // Where the product is sold is where the shop is. /inputs filters by
        // the product's own state, so it is copied rather than asked for twice.
        location: supplier.location,
        state: supplier.state,
      },
      select: { id: true },
    });
    return getAdminRow(created.id);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `This shop already lists "${fields.title}"`);
    }
    throw error;
  }
}

export async function updateAgriInput(
  id: string,
  patch: Partial<AgriInputFields> & { active?: boolean }
) {
  const existing = await prisma.agriInput.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Product not found');

  const { active, ...fieldPatch } = patch;
  const merged: AgriInputFields = {
    title: existing.title,
    category: existing.category,
    brand: existing.brand,
    cropNames: existing.cropNames,
    packSize: existing.packSize,
    pricePerPack: existing.pricePerPack,
    subsidised: existing.subsidised,
    composition: existing.composition,
    germinationPct: existing.germinationPct,
    seedTreatment: existing.seedTreatment,
    dosagePerAcre: existing.dosagePerAcre,
    specs: existing.specs,
    description: existing.description,
    ...fieldPatch,
  };
  if (fieldPatch.cropNames) merged.cropNames = await canonicalCrops(fieldPatch.cropNames);
  merged.pricePerPack = Math.round(merged.pricePerPack * 100) / 100;
  assertProductRules(merged);

  try {
    await prisma.agriInput.update({
      where: { id },
      data: { ...merged, ...(active !== undefined && { active }) },
    });
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `This shop already lists "${merged.title}"`);
    }
    throw error;
  }
  return getAdminRow(id);
}

export interface SupplierFields {
  name: string;
  location: string;
  state: string;
  contactPhone: string;
  contactEmail: string | null;
}

// A new shop starts unverified and unlicensed. Licences go in through
// setSupplierLicences, which is the one path that records who vouched for them.
export async function createSupplier(fields: SupplierFields) {
  // Checked here rather than only in the form's picker, because every product
  // at this shop inherits the spelling and /inputs files them under it.
  const state = canonicalState(fields.state);
  if (!state) throw new ApiError(400, 'Pick a state from the list');

  try {
    const created = await prisma.inputSupplier.create({ data: { ...fields, state }, select: { id: true } });
    return getAdminSupplier(created.id);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `A shop called "${fields.name}" is already listed in ${state}`);
    }
    throw error;
  }
}

// Town and state are not editable. A licence is issued for one premises in one
// state, so a shop that moves is a new shop with its own licences, and the
// schema already treats a chain's branch in another state that way.
export async function updateSupplier(
  id: string,
  patch: Partial<Pick<SupplierFields, 'name' | 'contactPhone' | 'contactEmail'>> & { active?: boolean }
) {
  const existing = await prisma.inputSupplier.findUnique({ where: { id }, select: { state: true } });
  if (!existing) throw new ApiError(404, 'Shop not found');

  try {
    await prisma.inputSupplier.update({ where: { id }, data: patch });
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `A shop called "${patch.name}" is already listed in ${existing.state}`);
    }
    throw error;
  }
  return getAdminSupplier(id);
}

export type LicencePatch = Partial<Record<LicenceKind, string | null>>;

const LICENCE_COLUMN: Record<LicenceKind, LicenceColumn> = {
  seed: 'seedLicence',
  fertiliser: 'fertiliserLicence',
  pesticide: 'pesticideLicence',
};

// THE LICENCE COLUMN IS THE GATE. Whatever writes it decides what a farmer is
// told a shop may legally sell, and /inputs prints "holds a valid licence to
// sell this category, checked by CropBid" under every product it unlocks. So:
//
//   - Entering a licence needs the admin to say they have seen the document.
//     Clearing one does not: taking a claim down is always safe.
//   - The audit row is written in the same transaction as the licence, not
//     through recordAudit, which swallows its own failures. A licence with no
//     record of who vouched for it is exactly what must not exist.
//   - The audit row names which licences changed and who changed them, never
//     the numbers: an audit table that copies every licence number is a second
//     place to copy them from, and the number is on the shop row anyway.
export async function setSupplierLicences(
  adminId: string,
  supplierId: string,
  patch: LicencePatch,
  paperworkSeen: boolean
) {
  const kinds = (Object.keys(patch) as LicenceKind[]).filter((k) => patch[k] !== undefined);
  if (kinds.length === 0) throw new ApiError(400, 'No licence to change');

  const entered = kinds.filter((k) => patch[k] != null);
  const cleared = kinds.filter((k) => patch[k] == null);
  if (entered.length > 0 && !paperworkSeen) {
    throw new ApiError(400, 'Confirm you have seen the licence document before entering it');
  }

  const exists = await prisma.inputSupplier.count({ where: { id: supplierId } });
  if (!exists) throw new ApiError(404, 'Shop not found');

  const data: Partial<Record<LicenceColumn, string | null>> = {};
  for (const k of kinds) data[LICENCE_COLUMN[k]] = patch[k] ?? null;

  await prisma.$transaction([
    prisma.inputSupplier.update({ where: { id: supplierId }, data }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'admin.input_supplier.licences',
        entityType: 'InputSupplier',
        entityId: supplierId,
        metadata: { entered, cleared, paperworkSeen: entered.length > 0 },
      },
    }),
  ]);

  return getAdminSupplier(supplierId);
}
