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

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { canonicalState } from '../utils/indianStates';

// Dealer fields safe to return on public endpoints. contactPhone/contactEmail
// are deliberately absent — adding them here would leak every dealer's number
// to an unauthenticated scrape of /api/equipment.
// The one definition of "a farmer can see this": the machine is on, and so is
// its dealer. Browse, detail, meta and the admin view all compose it, so the
// panel cannot disagree with /equipment about what is live. Unlike the inputs
// catalogue there is no licence in it: hiring out a rotavator is not a licensed
// trade the way selling certified seed is (CLAUDE.md section 10).
const VISIBLE = { active: true, dealer: { active: true } } as const;

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
export const CATEGORIES = [
  'TRACTOR', 'TILLAGE', 'HARVESTER', 'IRRIGATION',
  'SPRAYER', 'THRESHER', 'POWER', 'TOOLS',
] as const;
export type EquipmentCategory = (typeof CATEGORIES)[number];

export const MODES = ['SALE', 'RENT', 'BOTH'] as const;
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
  const where: any = { ...VISIBLE };

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
    where: { id, ...VISIBLE },
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
      where: VISIBLE,
      _count: { _all: true },
    }),
    prisma.equipment.findMany({
      where: VISIBLE,
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

  // One lead per account, per machine, per intent, held by a unique index
  // rather than a look-before-insert, so a double tap racing itself still
  // writes one row. A repeat gets the lead already on file and the number with
  // it: they earned the number the first time, and asking again must not put a
  // second copy of the same lead in front of the dealer. The same shape as
  // /inputs (agriInput.service createEnquiry). This stops one account filling
  // the table; equipmentEnquiryLimiter on the route is what stops it walking
  // the catalogue.
  //
  // A repeat does NOT overwrite the dates or message on file. The dealer may
  // already have called about the first one, and silently changing what they
  // were told would leave the lead saying something the farmer and the dealer
  // never discussed. New dates are a new conversation, which the phone number
  // they now hold is for.
  let enquiry;
  let created = true;
  try {
    enquiry = await prisma.equipmentEnquiry.create({
      data: {
        equipmentId,
        userId,
        intent: input.intent,
        message: input.message,
        rentFrom,
        rentTo,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
    enquiry = await prisma.equipmentEnquiry.findUniqueOrThrow({
      where: { userId_equipmentId_intent: { userId, equipmentId, intent: input.intent } },
    });
    created = false;
  }

  return {
    enquiry,
    // False on a repeat, so the controller answers 200 rather than 201.
    created,
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

// =============================================================================
// ADMIN — the catalogue as ops see it, and writing to it
// =============================================================================
// Machinery reached the database through prisma/seedEquipment.ts alone, so
// adding a dealer or a machine meant editing a file and waiting for a deploy,
// while seeds and fertiliser had been addable from the panel since #150. These
// are the same shape as the ones in agriInput.service.ts, minus the licence
// gate, which has no equivalent here: what an admin sees live is what
// /equipment shows, by VISIBLE above.
//
// THE CONTACT RULE STILL HOLDS. A dealer's phone number leaves the server from
// createEnquiry alone. None of the reads below carry it, the edit form starts
// blank and blank means keep, so a panel listing forty dealers is not a contact
// list. Same rule, same reason, as the inputs panel (CLAUDE.md section 10).

const ADMIN_DEALER = { ...DEALER_PUBLIC, active: true } as const;

const ADMIN_ROW_INCLUDE = {
  dealer: { select: ADMIN_DEALER },
  _count: { select: { enquiries: true } },
} as const;

type AdminRowSource = Prisma.EquipmentGetPayload<{ include: typeof ADMIN_ROW_INCLUDE }>;

// Every reason, not the first one. A machine taken off at a dealer who is also
// taken off needs both put right, and naming one would send someone to fix it
// and find nothing changed.
export function hiddenBecause(row: { active: boolean; dealer: { active: boolean } }): string[] {
  const reasons: string[] = [];
  if (!row.active) reasons.push('Taken off the catalogue');
  if (!row.dealer.active) reasons.push('The dealer is taken off the catalogue');
  return reasons;
}

interface AdminCatalogueQuery {
  category?: EquipmentCategory;
  visibility?: 'live' | 'hidden';
  q?: string;
  limit: number;
  offset: number;
}

export async function listCatalogueForAdmin(query: AdminCatalogueQuery) {
  const and: Prisma.EquipmentWhereInput[] = [];

  if (query.category) and.push({ category: query.category });
  if (query.visibility === 'live') and.push(VISIBLE);
  if (query.visibility === 'hidden') and.push({ NOT: VISIBLE });

  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { modelName: { contains: q, mode: 'insensitive' } },
        // Ops think in dealers as often as in machines: "what does Agrimech have".
        { dealer: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const where: Prisma.EquipmentWhereInput = { AND: and };

  const [rows, total, allByCategory, liveByCategory] = await Promise.all([
    prisma.equipment.findMany({
      where,
      // Grouped the way the category pills are, then alphabetical, so a page
      // reads like a yard rather than in whatever order a loader inserted it.
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      skip: query.offset,
      take: query.limit,
      include: ADMIN_ROW_INCLUDE,
    }),
    prisma.equipment.count({ where }),
    // The headline counts are the whole catalogue, whatever the filter, so the
    // numbers at the top do not change meaning as someone clicks around.
    prisma.equipment.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.equipment.groupBy({ by: ['category'], where: VISIBLE, _count: { _all: true } }),
  ]);

  return {
    equipment: rows.map(toAdminRow),
    total,
    counts: {
      total: allByCategory.reduce((n, c) => n + c._count._all, 0),
      live: liveByCategory.reduce((n, c) => n + c._count._all, 0),
    },
    categories: CATEGORIES.map((id) => ({
      id,
      label: CATEGORY_LABEL[id],
      total: allByCategory.find((c) => c.category === id)?._count._all ?? 0,
      live: liveByCategory.find((c) => c.category === id)?._count._all ?? 0,
    })),
  };
}

// Live is derived from the row rather than asked of the database again: the
// rule is VISIBLE, and both its halves are selected here.
function toAdminRow({ _count, ...row }: AdminRowSource) {
  const reasons = hiddenBecause(row);
  return {
    ...row,
    live: reasons.length === 0,
    hiddenBecause: reasons,
    enquiries: _count.enquiries,
  };
}

async function getAdminRow(id: string) {
  const row = await prisma.equipment.findUnique({ where: { id }, include: ADMIN_ROW_INCLUDE });
  if (!row) throw new ApiError(404, 'Machine not found');
  return toAdminRow(row);
}

// Unpaginated on purpose: dealers are added one at a time by a person, from the
// panel or the catalogue file, so this is a list somebody typed in rather than
// a table that grows by itself.
export async function listDealersForAdmin(only?: { id: string }) {
  const [dealers, liveByDealer] = await Promise.all([
    prisma.equipmentDealer.findMany({
      where: only,
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
      select: { ...ADMIN_DEALER, _count: { select: { equipment: true } } },
    }),
    prisma.equipment.groupBy({
      by: ['dealerId'],
      where: only ? { AND: [{ dealerId: only.id }, VISIBLE] } : VISIBLE,
      _count: { _all: true },
    }),
  ]);

  return {
    dealers: dealers.map(({ _count, ...dealer }) => ({
      ...dealer,
      machines: _count.equipment,
      live: liveByDealer.find((r) => r.dealerId === dealer.id)?._count._all ?? 0,
    })),
  };
}

async function getAdminDealer(id: string) {
  const { dealers } = await listDealersForAdmin({ id });
  if (!dealers[0]) throw new ApiError(404, 'Dealer not found');
  return dealers[0];
}

// =============================================================================
// ADMIN WRITES — adding dealers and machines, and the claims about a dealer
// =============================================================================
// The rules a machine has to satisfy live here rather than in the controller,
// so any future caller is bound by them too.

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const money = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

export interface EquipmentFields {
  title: string;
  category: EquipmentCategory;
  brand: string | null;
  modelName: string | null;
  condition: 'NEW' | 'USED';
  yearMade: number | null;
  mode: EquipmentMode;
  salePrice: number | null;
  rentPricePerDay: number | null;
  rentPricePerHour: number | null;
  securityDeposit: number | null;
  powerHp: number | null;
  specs: string[];
  description: string | null;
}

// Checked on the machine as it will be saved, not on the request, so an edit
// that only switches SALE to RENT is held to the same rules as a new machine.
//
// The pricing rules are the ones /equipment already assumes: it filters a sale
// search on salePrice and a hire search on the day rate falling back to the
// hourly one, so a machine offered for something it has no price for is a row
// that can never be found by the farmer looking for it.
function assertMachineRules(m: EquipmentFields) {
  const rentable = m.mode === 'RENT' || m.mode === 'BOTH';
  const sellable = m.mode === 'SALE' || m.mode === 'BOTH';
  const rentRate = m.rentPricePerDay ?? m.rentPricePerHour;

  if (sellable && !(m.salePrice != null && m.salePrice > 0)) {
    throw new ApiError(400, 'A machine offered for sale needs a sale price');
  }
  if (!sellable && m.salePrice != null) {
    throw new ApiError(400, 'A hire-only machine has no sale price');
  }
  if (rentable && !(rentRate != null && rentRate > 0)) {
    throw new ApiError(400, 'A machine offered for hire needs a day rate or an hourly rate');
  }
  if (!rentable && (m.rentPricePerDay != null || m.rentPricePerHour != null || m.securityDeposit != null)) {
    throw new ApiError(400, 'A sale-only machine has no rent rates or deposit');
  }
  // A year on a machine sold as new reads as a model year to one person and an
  // age to another, and the schema keeps it for the used ones.
  if (m.yearMade != null) {
    const nextYear = new Date().getFullYear() + 1;
    if (!Number.isInteger(m.yearMade) || m.yearMade < 1950 || m.yearMade > nextYear) {
      throw new ApiError(400, `Year made should be between 1950 and ${nextYear}`);
    }
  }
  for (const [label, value] of [
    ['Sale price', m.salePrice],
    ['Day rate', m.rentPricePerDay],
    ['Hourly rate', m.rentPricePerHour],
    ['Deposit', m.securityDeposit],
    ['Horsepower', m.powerHp],
  ] as const) {
    if (value != null && !(value > 0)) throw new ApiError(400, `${label} must be more than zero`);
  }
}

const priced = (fields: EquipmentFields): EquipmentFields => ({
  ...fields,
  salePrice: money(fields.salePrice),
  rentPricePerDay: money(fields.rentPricePerDay),
  rentPricePerHour: money(fields.rentPricePerHour),
  securityDeposit: money(fields.securityDeposit),
});

export async function createEquipment(dealerId: string, fields: EquipmentFields) {
  const dealer = await prisma.equipmentDealer.findUnique({
    where: { id: dealerId },
    select: { id: true, location: true, state: true },
  });
  if (!dealer) throw new ApiError(404, 'Dealer not found');

  const data = priced(fields);
  assertMachineRules(data);

  try {
    const created = await prisma.equipment.create({
      data: {
        ...data,
        dealerId,
        // Where a machine is, is where its dealer is. /equipment filters on the
        // machine's own state, so it is copied rather than asked for twice.
        location: dealer.location,
        state: dealer.state,
      },
      select: { id: true },
    });
    return getAdminRow(created.id);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `This dealer already lists "${fields.title}"`);
    }
    throw error;
  }
}

export async function updateEquipment(
  id: string,
  patch: Partial<EquipmentFields> & { active?: boolean }
) {
  const existing = await prisma.equipment.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Machine not found');

  const { active, ...fieldPatch } = patch;
  const merged: EquipmentFields = priced({
    title: existing.title,
    category: existing.category as EquipmentCategory,
    brand: existing.brand,
    modelName: existing.modelName,
    condition: existing.condition as 'NEW' | 'USED',
    yearMade: existing.yearMade,
    mode: existing.mode as EquipmentMode,
    salePrice: existing.salePrice,
    rentPricePerDay: existing.rentPricePerDay,
    rentPricePerHour: existing.rentPricePerHour,
    securityDeposit: existing.securityDeposit,
    powerHp: existing.powerHp,
    specs: existing.specs,
    description: existing.description,
    ...fieldPatch,
  });
  assertMachineRules(merged);

  try {
    await prisma.equipment.update({
      where: { id },
      data: { ...merged, ...(active !== undefined && { active }) },
    });
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `This dealer already lists "${merged.title}"`);
    }
    throw error;
  }
  return getAdminRow(id);
}

export interface DealerFields {
  name: string;
  location: string;
  state: string;
  contactPhone: string;
  contactEmail: string | null;
}

// A new dealer starts unverified and not empanelled. Those two go in through
// setDealerClaims, which is the one path that records who vouched for them.
export async function createDealer(fields: DealerFields) {
  // Checked here rather than only in the form's picker, because every machine
  // at this dealer inherits the spelling and /equipment files them under it.
  const state = canonicalState(fields.state);
  if (!state) throw new ApiError(400, 'Pick a state from the list');

  try {
    const created = await prisma.equipmentDealer.create({
      data: { ...fields, state },
      select: { id: true },
    });
    return getAdminDealer(created.id);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `A dealer called "${fields.name}" is already listed in ${state}`);
    }
    throw error;
  }
}

// Town and state ARE editable here, unlike a licensed input shop, where a
// licence covers one premises and a shop that moves is a new shop. Nothing
// about a machinery dealer is tied to an address that way. The move carries
// their machines with it in the same transaction, because /equipment files a
// machine under its own state and a dealer whose yard moved to Nashik must not
// still be answering Pune searches.
export async function updateDealer(
  id: string,
  patch: Partial<DealerFields> & { active?: boolean }
) {
  const existing = await prisma.equipmentDealer.findUnique({
    where: { id },
    select: { location: true, state: true },
  });
  if (!existing) throw new ApiError(404, 'Dealer not found');

  const data: Partial<DealerFields> & { active?: boolean } = { ...patch };
  if (patch.state !== undefined) {
    const state = canonicalState(patch.state);
    if (!state) throw new ApiError(400, 'Pick a state from the list');
    data.state = state;
  }

  const moved = (data.state ?? existing.state) !== existing.state
    || (data.location ?? existing.location) !== existing.location;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.equipmentDealer.update({ where: { id }, data });
      if (moved) {
        await tx.equipment.updateMany({
          where: { dealerId: id },
          data: { location: data.location ?? existing.location, state: data.state ?? existing.state },
        });
      }
    });
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new ApiError(409, `A dealer called "${patch.name}" is already listed in ${data.state ?? existing.state}`);
    }
    throw error;
  }
  return getAdminDealer(id);
}

export type DealerClaim = 'verified' | 'smamEmpanelled';
export type ClaimPatch = Partial<Record<DealerClaim, boolean>>;

// BOTH OF THESE ARE CLAIMS CROPBID MAKES TO A FARMER, which is why they are
// their own endpoint rather than two more fields on the edit form. `verified`
// puts a badge on the dealer and sorts them to the top of every search;
// `smamEmpanelled` says a farmer can claim a government subsidy through them,
// which is a thing they will act on and be out of pocket over if it is wrong.
//
// Same rules as a licence on the inputs side (agriInput.setSupplierLicences):
//
//   - Setting one needs the admin to say they have checked. Clearing one does
//     not: taking a claim down is always safe.
//   - The audit row is written in the same transaction, not through
//     recordAudit, which swallows its own failures. A badge with no record of
//     who vouched for it is exactly what must not exist.
export async function setDealerClaims(
  adminId: string,
  dealerId: string,
  patch: ClaimPatch,
  checked: boolean
) {
  const claims = (Object.keys(patch) as DealerClaim[]).filter((c) => patch[c] !== undefined);
  if (claims.length === 0) throw new ApiError(400, 'No claim to change');

  const set = claims.filter((c) => patch[c] === true);
  const cleared = claims.filter((c) => patch[c] === false);
  if (set.length > 0 && !checked) {
    throw new ApiError(400, 'Confirm you have checked this dealer before making the claim');
  }

  const exists = await prisma.equipmentDealer.count({ where: { id: dealerId } });
  if (!exists) throw new ApiError(404, 'Dealer not found');

  await prisma.$transaction([
    prisma.equipmentDealer.update({ where: { id: dealerId }, data: patch }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'admin.equipment_dealer.claims',
        entityType: 'EquipmentDealer',
        entityId: dealerId,
        metadata: { set, cleared, checked: set.length > 0 },
      },
    }),
  ]);

  return getAdminDealer(dealerId);
}
