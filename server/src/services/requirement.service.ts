// =============================================================================
// Requirement Service — Business Logic for the Reverse Marketplace
// =============================================================================
// A BuyerRequirement is the mirror image of a Listing: instead of a farmer
// posting supply and buyers bidding on it, a buyer posts demand ("I want 500 qtl
// cotton at ₹7,000/qtl, delivered to Nagpur") and farmers respond.
//
// TWO RESPONSE PATHS:
//   INSTANT — the farmer takes the posted price. The deal closes immediately:
//             the offer is born ACCEPTED with its Listing/Bid/Transaction
//             materialised in the same DB transaction.
//   COUNTER — the farmer names their own price. The offer is born PENDING and
//             waits for the buyer to accept or reject.
//
// PARTIAL FILLS:
// A 500 qtl requirement can be met by 200 + 200 + 100 from three different
// farmers. `remainingQuantity` ticks down on every fill; at zero the requirement
// flips to FULFILLED and any still-pending offers expire.
//
// WHY EVERY MATCH BUILDS A SHADOW LISTING:
// Transaction.listingId and Transaction.bidId are both NOT NULL, so a fill has
// nothing to hang a Transaction off. Rather than make them nullable — which
// would ripple through bid, negotiation, socket, admin and analytics code — each
// fill materialises a one-shot Listing (born SOLD, flagged isRequirementFill)
// and a pre-ACCEPTED Bid, then calls the ordinary createTransaction(). This is
// the same trick createDirectPurchase uses to reuse the escrow pipeline, and it
// means Razorpay, delivery tracking, shipments and the Transactions page all
// work here with zero changes.
//
// CONCURRENCY:
// Both accept paths claim stock with a CONDITIONAL updateMany + `count === 0`
// check rather than a read-then-write, closing the TOCTOU race two simultaneous
// fills would otherwise hit. Both lock BuyerRequirement FIRST and
// RequirementOffer SECOND — a fixed lock order, so they can never deadlock
// against each other.
// =============================================================================

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { orderContactDefaults } from './bid.service';
import {
  notifyRequirementOffer,
  notifyRequirementFilled,
  notifyRequirementOfferAccepted,
  notifyRequirementOfferRejected,
  notifyRequirementClosed,
} from './notification.helpers';
import { createTransaction } from './transaction.service';

// --- Input types ---
export interface CreateRequirementInput {
  cropName: string;
  cropVariety?: string;
  quantity: number;
  unit?: 'KG' | 'QUINTAL' | 'TONNE';
  qualityGrade: 'A' | 'B' | 'C';
  pricePerUnit: number;
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  deliveryLocation: string;
  deliveryState: string;
  deliveryCountry?: string;
  neededBy?: string;
  description?: string;
  organic?: boolean;
  paymentTerms?: string;
  deliveryTerms?: string;
}

export type UpdateRequirementInput = Partial<CreateRequirementInput>;

export interface RequirementFeedQuery {
  crop?: string;
  crops?: string[];
  state?: string;
  quality?: string;
  organic?: boolean;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// Counterparty-safe buyer shape. A farmer browsing the feed sees who they'd be
// dealing with — company, type, country, verification, trust — and nothing else.
// Excluded on purpose: BuyerProfile.taxId (a GST/EIN/VAT number, which has no
// business on a public feed), annualProcurementVolume (the buyer's negotiating
// position), and phone/email. Contact is released WITH the deal, via the
// Transactions page, which already exposes the buyer's phone to the seller and
// never the farmer's to the buyer. Mirrors PUBLIC_FARMER_SELECT in the
// listing/browse/bid services.
const PUBLIC_BUYER_SELECT = {
  id: true,
  name: true,
  trustScore: true,
  avatar: true,
  buyerProfile: {
    select: { companyName: true, companyType: true, country: true, verified: true },
  },
} as const;

// The offer-side mirror. RequirementOffer.farmer is a User (not a FarmerProfile),
// so this is the User-rooted twin of PUBLIC_FARMER_SELECT. No phone or email,
// ever — the farmer's number stays private even after the deal closes.
const PUBLIC_OFFER_FARMER_SELECT = {
  id: true,
  name: true,
  trustScore: true,
  avatar: true,
  farmerProfile: {
    select: {
      state: true,
      country: true,
      organicCertified: true,
      certificationBody: true,
      verified: true,
    },
  },
} as const;

// Whitelist sortable columns. `sort` comes straight from the query string and is
// used as a Prisma orderBy key; an unknown field makes Prisma throw and the
// endpoint 500s. Fall back to a safe default instead.
const SORTABLE_FIELDS = ['createdAt', 'pricePerUnit', 'quantity', 'remainingQuantity', 'neededBy'];

// Money is stored as a float, so a raw price × quantity can land on something
// like 1399999.9999999998. Round the snapshot to paise. The Transaction remains
// the money-of-record; this is the display/audit copy.
function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// Status names get interpolated straight into user-facing errors, and half of
// them start with a vowel (ACCEPTED, EXPIRED, OPEN) — "a expired offer" reads
// like a bug report. Pick the article from the word rather than hardcoding "a".
function statusPhrase(status: string): string {
  const word = status.toLowerCase();
  return `${'aeiou'.includes(word[0]!) ? 'an' : 'a'} ${word}`;
}

// The fields that define WHAT a farmer agreed to supply and WHERE. A pending
// offer is an answer to these; change any of them and the outstanding offers are
// answers to a different question, so they must not survive into a deal.
//
// Deliberately excluded:
//   quantity     — already reconciled against what's filled, and an offer names
//                  its own quantity, which is re-checked at accept time
//   pricePerUnit — a COUNTER offer names its own price, so the buyer's posted
//                  price is not what a pending offer agreed to (an INSTANT offer
//                  is born ACCEPTED and is never pending)
//   description  — prose for humans; it binds nothing
const MATERIAL_TERMS = [
  'cropName',
  'cropVariety',
  'unit',
  'qualityGrade',
  'organic',
  'deliveryLocation',
  'deliveryState',
  'deliveryCountry',
  'neededBy',
  'paymentTerms',
  'deliveryTerms',
] as const;

function materialTermsChanged(before: Record<string, any>, after: Record<string, any>): boolean {
  return MATERIAL_TERMS.some((field) => {
    const a = before[field];
    const b = after[field];
    // Dates need value comparison, not identity.
    if (a instanceof Date || b instanceof Date) {
      return (a as Date | null)?.getTime() !== (b as Date | null)?.getTime();
    }
    return a !== b;
  });
}

// =============================================================================
// SHARED — Guards reused across the response paths
// =============================================================================

// Everything a farmer must satisfy before they can respond to a requirement at
// all, whether they're filling it outright or countering. Written once so the
// two paths can't drift apart and start disagreeing about who may respond.
async function assertFarmerCanRespond(
  requirementId: string,
  farmerUserId: string,
  quantity: number,
) {
  const requirement = await prisma.buyerRequirement.findUnique({
    where: { id: requirementId },
  });

  if (!requirement) throw new ApiError(404, 'Requirement not found');
  if (requirement.status !== 'OPEN') {
    throw new ApiError(400, `Cannot respond to ${statusPhrase(requirement.status)} requirement`);
  }
  if (requirement.buyerId === farmerUserId) {
    throw new ApiError(400, 'You cannot fill your own requirement');
  }
  if (requirement.neededBy && requirement.neededBy < new Date()) {
    throw new ApiError(400, "This requirement's delivery date has passed");
  }
  if (quantity > requirement.remainingQuantity) {
    throw new ApiError(
      400,
      `Only ${requirement.remainingQuantity} ${requirement.unit.toLowerCase()} still needed`,
    );
  }

  // A FarmerProfile is a hard requirement, not a nicety: Listing.farmerId points
  // at FarmerProfile.id, and Transaction.farmerId is derived from it. Having the
  // FARMER role is not enough — onboarding is a separate step.
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId: farmerUserId },
    include: { user: { select: { id: true, name: true, location: true } } },
  });
  if (!farmerProfile) {
    throw new ApiError(400, 'Complete your farmer profile before responding to requirements');
  }

  return { requirement, farmerProfile };
}

// The buyer's delivery address always exists (both source columns are required),
// so in practice only the phone can be missing — and that's validated at
// requirement-creation time, making this an unreachable backstop rather than a
// routine failure. A farmer must never be blocked by a buyer's incomplete profile.
async function requirementOrderContact(requirement: { buyerId: string; deliveryLocation: string; deliveryState: string }) {
  const contact = await orderContactDefaults(requirement.buyerId, {
    deliveryAddress: [requirement.deliveryLocation, requirement.deliveryState]
      .filter(Boolean)
      .join(', '),
    contactPhone: undefined,
  });

  if (!contact.deliveryAddress || !contact.contactPhone) {
    throw new ApiError(400, "This buyer has no contact phone on file — the deal can't be opened.");
  }
  return contact;
}

interface MaterialiseParams {
  requirement: {
    id: string;
    buyerId: string;
    cropName: string;
    cropVariety: string | null;
    unit: 'KG' | 'QUINTAL' | 'TONNE';
    qualityGrade: 'A' | 'B' | 'C';
    currency: 'INR' | 'USD' | 'EUR' | 'GBP';
    organic: boolean;
    deliveryLocation: string;
    deliveryState: string;
    paymentTerms: string | null;
    deliveryTerms: string | null;
  };
  farmerProfile: { id: string; state: string; country: string; user: { location: string | null } };
  quantity: number;
  pricePerUnit: number;
  // The denomination the two parties actually agreed on, passed explicitly
  // rather than read back off the requirement. A COUNTER offer snapshots its own
  // currency at creation, and that snapshot — not whatever the requirement says
  // at accept time — is what the farmer offered in. Reading it from the
  // requirement would make the deal's correctness depend on the requirement's
  // currency being immutable, which is an invariant enforced somewhere else.
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  contact: { deliveryAddress: string | null; contactPhone: string | null };
  message?: string | null;
}

// =============================================================================
// MATERIALISE DEAL — Turn an agreed fill into a real, payable transaction
// =============================================================================
// Written once and shared by BOTH accept paths (farmer fills instantly, buyer
// accepts a counter-offer) so the two can never drift. Always call this inside
// an existing prisma.$transaction: the stock claim and the payable record must
// commit or roll back together.
async function materialiseDeal(tx: Prisma.TransactionClient, p: MaterialiseParams) {
  const { requirement, farmerProfile } = p;
  const totalAmount = money(p.pricePerUnit * p.quantity);

  const listing = await tx.listing.create({
    data: {
      farmerId: farmerProfile.id, // FarmerProfile.id — the asymmetric FK
      cropName: requirement.cropName,
      cropVariety: requirement.cropVariety,
      quantity: p.quantity,
      remainingQuantity: 0, // born fully committed — this is not inventory
      unit: requirement.unit,
      qualityGrade: requirement.qualityGrade,
      // Not a range — one agreed number. min = max keeps the min <= max
      // invariant every other path assumes, and makes any range-rendering UI
      // print a single honest figure.
      pricePerUnitMin: p.pricePerUnit,
      pricePerUnitMax: p.pricePerUnit,
      currency: p.currency,
      directSaleEnabled: false,
      description:
        `Filled buyer requirement #${requirement.id.slice(-6).toUpperCase()} — ` +
        `${requirement.cropName}, deliver to ${requirement.deliveryLocation}, ${requirement.deliveryState}.`,
      images: [], // the client falls back to the stock crop photo
      organic: requirement.organic, // the farmer asserts they meet the ask
      // ORIGIN, not destination: logistics builds the pickup point from the
      // listing's location/state. Putting the buyer's delivery city here would
      // send the truck to collect from the wrong end of the country.
      location: farmerProfile.user.location || farmerProfile.state,
      state: farmerProfile.state,
      country: farmerProfile.country,
      status: 'SOLD',
      isRequirementFill: true,
    },
  });

  const bid = await tx.bid.create({
    data: {
      listingId: listing.id,
      buyerId: requirement.buyerId, // User.id — Bid.buyerId targets User
      bidPricePerUnit: p.pricePerUnit,
      quantity: p.quantity,
      totalAmount,
      currency: p.currency,
      message: p.message || null,
      deliveryAddress: p.contact.deliveryAddress,
      contactPhone: p.contact.contactPhone,
      paymentTerms: requirement.paymentTerms,
      deliveryTerms: requirement.deliveryTerms,
      isAgentBid: false,
      isDirectPurchase: false, // that flag means consumer retail, not this
      status: 'ACCEPTED', // pre-accepted, so createTransaction will take it
    },
  });

  const transaction = await createTransaction(bid.id, tx);
  return { listing, bid, transaction };
}

// Close a requirement out once its last unit is spoken for, and retire the
// offers that can never be accepted now. Returns the offers that were expired so
// the caller can notify those farmers AFTER the transaction commits.
async function settleIfFilled(tx: Prisma.TransactionClient, requirementId: string) {
  const fresh = await tx.buyerRequirement.findUniqueOrThrow({ where: { id: requirementId } });
  if (fresh.remainingQuantity > 0) return { fulfilled: false, expired: [] as { id: string; farmerId: string }[] };

  // Capture the pending offers BEFORE the bulk update, otherwise we lose track
  // of whom to notify.
  const expired = await tx.requirementOffer.findMany({
    where: { requirementId, status: 'PENDING' },
    select: { id: true, farmerId: true },
  });

  await tx.buyerRequirement.update({
    where: { id: requirementId },
    data: { status: 'FULFILLED' },
  });
  await tx.requirementOffer.updateMany({
    where: { requirementId, status: 'PENDING' },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });

  return { fulfilled: true, expired };
}

function notifyExpiredOffers(
  expired: { id: string; farmerId: string }[],
  cropName: string,
  requirementId: string,
) {
  for (const offer of expired) {
    notifyRequirementClosed(offer.farmerId, cropName, requirementId, offer.id).catch(() => {});
  }
}

// =============================================================================
// CREATE REQUIREMENT — Buyer posts what they need
// =============================================================================
export async function createRequirement(buyerId: string, input: CreateRequirementInput) {
  const buyerProfile = await prisma.buyerProfile.findUnique({ where: { userId: buyerId } });
  if (!buyerProfile) {
    throw new ApiError(400, 'Complete your buyer profile before posting a requirement');
  }

  // Validate the contact phone HERE rather than at fill time. A farmer hitting
  // "Fill" should never be blocked by the buyer's incomplete profile — that's
  // not a problem they can fix, and it would look like the platform is broken.
  const buyer = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { phone: true },
  });
  if (!buyer?.phone) {
    throw new ApiError(
      400,
      'Add a phone number to your profile so farmers can reach you about this requirement.',
    );
  }

  if (input.pricePerUnit <= 0) throw new ApiError(400, 'Price must be greater than zero');
  if (input.quantity <= 0) throw new ApiError(400, 'Quantity must be greater than zero');

  const neededBy = input.neededBy ? new Date(input.neededBy) : null;
  if (neededBy) {
    if (Number.isNaN(neededBy.getTime())) throw new ApiError(400, 'Invalid needed-by date');
    if (neededBy < new Date()) throw new ApiError(400, 'Needed-by date must be in the future');
  }

  return prisma.buyerRequirement.create({
    data: {
      buyerId,
      cropName: input.cropName,
      cropVariety: input.cropVariety || null,
      quantity: input.quantity,
      remainingQuantity: input.quantity,
      unit: input.unit || 'QUINTAL',
      qualityGrade: input.qualityGrade,
      pricePerUnit: input.pricePerUnit,
      currency: input.currency || 'INR',
      deliveryLocation: input.deliveryLocation,
      deliveryState: input.deliveryState,
      deliveryCountry: input.deliveryCountry || 'India',
      neededBy,
      description: input.description || null,
      organic: input.organic ?? false,
      paymentTerms: input.paymentTerms || null,
      deliveryTerms: input.deliveryTerms || null,
    },
    include: { buyer: { select: PUBLIC_BUYER_SELECT } },
  });
}

// =============================================================================
// FEED — Filtered, paginated requirement search for farmers
// =============================================================================
export async function getRequirementFeed(query: RequirementFeedQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = {
    status: 'OPEN',
    remainingQuantity: { gt: 0 },
    // There is no scheduler in this codebase to sweep past-deadline rows, so the
    // feed enforces the deadline lazily. Both accept paths re-check it.
    OR: [{ neededBy: null }, { neededBy: { gte: new Date() } }],
  };

  if (query.crop) {
    where.cropName = { equals: query.crop, mode: 'insensitive' };
  } else if (query.crops && query.crops.length > 0) {
    where.cropName = { in: query.crops, mode: 'insensitive' };
  }

  if (query.state) where.deliveryState = { equals: query.state, mode: 'insensitive' };
  if (query.quality) where.qualityGrade = query.quality;
  if (query.organic !== undefined) where.organic = query.organic;

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    where.pricePerUnit = {};
    if (query.priceMin !== undefined) where.pricePerUnit.gte = query.priceMin;
    if (query.priceMax !== undefined) where.pricePerUnit.lte = query.priceMax;
  }

  // `OR` is already used above for the deadline, so the search terms go under
  // AND to avoid clobbering it — a stale requirement must stay hidden even when
  // its crop name matches the search.
  if (query.search) {
    where.AND = [
      {
        OR: [
          { cropName: { contains: query.search, mode: 'insensitive' } },
          { cropVariety: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { deliveryLocation: { contains: query.search, mode: 'insensitive' } },
          { deliveryState: { contains: query.search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const sort = SORTABLE_FIELDS.includes(query.sort || '') ? (query.sort as string) : 'createdAt';
  const order = query.order === 'asc' ? 'asc' : 'desc';

  const [requirements, total] = await Promise.all([
    prisma.buyerRequirement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        buyer: { select: PUBLIC_BUYER_SELECT },
        _count: { select: { offers: true } },
      },
    }),
    prisma.buyerRequirement.count({ where }),
  ]);

  return {
    requirements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

// Dynamic filter options — only show crops and states that actually have open
// requirements, so a farmer never filters their way into an empty result.
export async function getFeedFilters() {
  const [crops, states] = await Promise.all([
    prisma.buyerRequirement.findMany({
      where: { status: 'OPEN' },
      select: { cropName: true },
      distinct: ['cropName'],
      orderBy: { cropName: 'asc' },
    }),
    prisma.buyerRequirement.findMany({
      where: { status: 'OPEN' },
      select: { deliveryState: true },
      distinct: ['deliveryState'],
      orderBy: { deliveryState: 'asc' },
    }),
  ]);

  return {
    crops: crops.map((c) => c.cropName),
    states: states.map((s) => s.deliveryState),
    qualities: ['A', 'B', 'C'],
    units: ['KG', 'QUINTAL', 'TONNE'],
  };
}

// =============================================================================
// GET BY ID — Role-aware detail view
// =============================================================================
export async function getRequirementById(id: string, userId: string, role: string) {
  const requirement = await prisma.buyerRequirement.findUnique({
    where: { id },
    include: { buyer: { select: PUBLIC_BUYER_SELECT } },
  });
  if (!requirement) throw new ApiError(404, 'Requirement not found');

  const isOwner = requirement.buyerId === userId;

  // A farmer must NEVER see competitors' offers — that would hand them the exact
  // price to undercut. They see only their own. The owning buyer (and admins)
  // see everything, because comparing offers is the whole point of the inbox.
  const offers = await prisma.requirementOffer.findMany({
    where: isOwner || role === 'ADMIN' ? { requirementId: id } : { requirementId: id, farmerId: userId },
    include: {
      farmer: { select: PUBLIC_OFFER_FARMER_SELECT },
      bid: { select: { id: true, transaction: { select: { id: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { ...requirement, offers };
}

// =============================================================================
// ACCEPT NOW — Farmer fills at the buyer's posted price
// =============================================================================
export async function acceptRequirementNow(
  requirementId: string,
  farmerUserId: string,
  input: { quantity: number; message?: string },
) {
  const { requirement, farmerProfile } = await assertFarmerCanRespond(
    requirementId,
    farmerUserId,
    input.quantity,
  );
  const contact = await requirementOrderContact(requirement);

  const result = await prisma.$transaction(async (tx) => {
    // CLAIM the stock with a conditional updateMany, not a read-then-write. Two
    // farmers racing for the last 100 qtl would both pass the pre-check above;
    // here the second blocks on the row lock, re-evaluates against the committed
    // row, gets count 0, and bails. remainingQuantity can never go negative.
    const claim = await tx.buyerRequirement.updateMany({
      where: { id: requirement.id, status: 'OPEN', remainingQuantity: { gte: input.quantity } },
      data: { remainingQuantity: { decrement: input.quantity } },
    });
    if (claim.count === 0) {
      throw new ApiError(
        409,
        'This requirement no longer has that quantity open — another farmer just filled it.',
      );
    }

    const settled = await settleIfFilled(tx, requirement.id);

    const deal = await materialiseDeal(tx, {
      requirement,
      farmerProfile,
      quantity: input.quantity,
      pricePerUnit: requirement.pricePerUnit,
      // An instant fill takes the requirement exactly as posted, and the offer
      // row below snapshots the same value in the same transaction.
      currency: requirement.currency,
      contact,
      message: input.message,
    });

    const offer = await tx.requirementOffer.create({
      data: {
        requirementId: requirement.id,
        farmerId: farmerUserId,
        kind: 'INSTANT',
        quantity: input.quantity,
        pricePerUnit: requirement.pricePerUnit,
        totalAmount: money(requirement.pricePerUnit * input.quantity),
        currency: requirement.currency,
        message: input.message || null,
        status: 'ACCEPTED',
        respondedAt: new Date(),
        listingId: deal.listing.id,
        bidId: deal.bid.id,
      },
      include: { farmer: { select: PUBLIC_OFFER_FARMER_SELECT } },
    });

    return { offer, ...deal, expired: settled.expired };
  });

  // Best-effort, after commit — the deal is already real either way.
  notifyRequirementFilled(
    requirement.buyerId,
    farmerProfile.user.name,
    requirement.cropName,
    input.quantity,
    requirement.unit,
    requirement.id,
    result.offer.id,
    result.transaction.id,
  ).catch(() => {});
  notifyExpiredOffers(result.expired, requirement.cropName, requirement.id);

  return result;
}

// =============================================================================
// CREATE OFFER — Farmer counters with their own price
// =============================================================================
export async function createOffer(
  requirementId: string,
  farmerUserId: string,
  input: { quantity: number; pricePerUnit: number; message?: string },
) {
  // Same gate as the instant path, deliberately: fail here rather than hand the
  // buyer an offer that turns out to be unfillable when they accept it.
  const { requirement, farmerProfile } = await assertFarmerCanRespond(
    requirementId,
    farmerUserId,
    input.quantity,
  );

  // One live offer per farmer per requirement, mirroring the one-active-bid rule
  // for listings. Enforced here rather than with a partial unique index because
  // Prisma can't express a filtered index, so the next migrate would drop it.
  const existing = await prisma.requirementOffer.findFirst({
    where: { requirementId, farmerId: farmerUserId, status: 'PENDING' },
  });
  if (existing) {
    throw new ApiError(
      400,
      "You already have an offer awaiting this buyer's decision. Withdraw it first.",
    );
  }

  // A price ABOVE the buyer's posted price is explicitly allowed — that is the
  // entire point of countering. No transaction needed: a counter claims nothing.
  const offer = await prisma.requirementOffer.create({
    data: {
      requirementId,
      farmerId: farmerUserId,
      kind: 'COUNTER',
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      totalAmount: money(input.pricePerUnit * input.quantity),
      currency: requirement.currency,
      message: input.message || null,
      status: 'PENDING',
    },
    include: { farmer: { select: PUBLIC_OFFER_FARMER_SELECT } },
  });

  notifyRequirementOffer(
    requirement.buyerId,
    farmerProfile.user.name,
    requirement.cropName,
    input.pricePerUnit,
    requirement.currency,
    requirement.unit,
    requirement.id,
    offer.id,
  ).catch(() => {});

  return offer;
}

// =============================================================================
// ACCEPT OFFER — Buyer takes a farmer's counter-offer
// =============================================================================
export async function acceptOffer(offerId: string, buyerUserId: string) {
  const offer = await prisma.requirementOffer.findUnique({
    where: { id: offerId },
    include: { requirement: true },
  });

  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.requirement.buyerId !== buyerUserId) {
    throw new ApiError(403, 'You can only accept offers on your own requirements');
  }
  if (offer.status !== 'PENDING') {
    throw new ApiError(400, `Cannot accept ${statusPhrase(offer.status)} offer`);
  }
  if (offer.requirement.status !== 'OPEN') {
    throw new ApiError(400, `Cannot accept offers on ${statusPhrase(offer.requirement.status)} requirement`);
  }

  // The farmer could have deleted their profile between offering and now. That
  // error must name the farmer's side, not blame the buyer for their own click.
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId: offer.farmerId },
    include: { user: { select: { id: true, name: true, location: true } } },
  });
  if (!farmerProfile) {
    throw new ApiError(400, "This farmer hasn't completed their profile, so the deal can't be opened.");
  }

  const contact = await requirementOrderContact(offer.requirement);

  const result = await prisma.$transaction(async (tx) => {
    // Requirement FIRST, offer SECOND — the same lock order acceptRequirementNow
    // uses, so the two accept paths can never deadlock against each other.
    const claim = await tx.buyerRequirement.updateMany({
      where: { id: offer.requirementId, status: 'OPEN', remainingQuantity: { gte: offer.quantity } },
      data: { remainingQuantity: { decrement: offer.quantity } },
    });
    if (claim.count === 0) {
      throw new ApiError(
        409,
        'This requirement no longer has enough open quantity for this offer — another fill went through first. Reject it, or ask the farmer to revise.',
      );
    }

    const claimedOffer = await tx.requirementOffer.updateMany({
      where: { id: offer.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    if (claimedOffer.count === 0) throw new ApiError(409, 'This offer is no longer pending.');

    const settled = await settleIfFilled(tx, offer.requirementId);

    const deal = await materialiseDeal(tx, {
      requirement: offer.requirement,
      farmerProfile,
      quantity: offer.quantity,
      pricePerUnit: offer.pricePerUnit,
      // The offer's own snapshot, taken when the farmer submitted it — not the
      // requirement's current value. price, quantity and currency then all come
      // from the same agreement rather than two points in time.
      currency: offer.currency,
      contact,
      message: offer.message,
    });

    const updated = await tx.requirementOffer.update({
      where: { id: offer.id },
      data: { listingId: deal.listing.id, bidId: deal.bid.id },
      include: { farmer: { select: PUBLIC_OFFER_FARMER_SELECT } },
    });

    // This offer was flipped to ACCEPTED above, before settleIfFilled ran, so it
    // is already outside the PENDING sweep. Filtering is belt-and-braces against
    // anyone reordering these two steps: never tell the winner they lost.
    return { offer: updated, ...deal, expired: settled.expired.filter((e) => e.id !== offer.id) };
  });

  notifyRequirementOfferAccepted(
    offer.farmerId,
    offer.requirement.cropName,
    offer.pricePerUnit,
    offer.requirement.currency,
    offer.requirement.unit,
    offer.requirementId,
    offer.id,
    result.transaction.id,
  ).catch(() => {});
  notifyExpiredOffers(result.expired, offer.requirement.cropName, offer.requirementId);

  return result;
}

// =============================================================================
// REJECT OFFER — Buyer declines
// =============================================================================
export async function rejectOffer(offerId: string, buyerUserId: string) {
  const offer = await prisma.requirementOffer.findUnique({
    where: { id: offerId },
    include: { requirement: true },
  });

  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.requirement.buyerId !== buyerUserId) {
    throw new ApiError(403, 'You can only reject offers on your own requirements');
  }
  if (offer.status !== 'PENDING') {
    throw new ApiError(400, `Cannot reject ${statusPhrase(offer.status)} offer`);
  }

  // Conditional claim, not a bare update: the status check above is a read, and
  // acceptOffer can commit between that read and this write. An unconditional
  // update would then flip an ACCEPTED offer — one that already has a Listing,
  // Bid and payable Transaction behind it — back to REJECTED, hiding a real deal
  // from both parties.
  const claimed = await prisma.requirementOffer.updateMany({
    where: { id: offerId, status: 'PENDING' },
    data: { status: 'REJECTED', respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiError(409, 'This offer is no longer pending — it may have just been accepted.');
  }

  const updated = await prisma.requirementOffer.findUniqueOrThrow({
    where: { id: offerId },
    include: { farmer: { select: PUBLIC_OFFER_FARMER_SELECT } },
  });

  notifyRequirementOfferRejected(
    offer.farmerId,
    offer.requirement.cropName,
    offer.requirementId,
    offer.id,
  ).catch(() => {});

  return updated;
}

// =============================================================================
// WITHDRAW OFFER — Farmer pulls out before the buyer decides
// =============================================================================
export async function withdrawOffer(offerId: string, farmerUserId: string) {
  const offer = await prisma.requirementOffer.findUnique({ where: { id: offerId } });

  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.farmerId !== farmerUserId) {
    throw new ApiError(403, 'You can only withdraw your own offers');
  }
  if (offer.status === 'ACCEPTED') {
    throw new ApiError(400, 'Cannot withdraw an accepted offer');
  }
  if (offer.status !== 'PENDING') {
    throw new ApiError(400, `Cannot withdraw ${statusPhrase(offer.status)} offer`);
  }

  // Marked WITHDRAWN rather than hard-deleted (which is what withdrawing a bid
  // does): the row can carry listing/bid FKs, and "offered then pulled out" is a
  // trust signal worth keeping in the farmer's history.
  //
  // Conditional claim for the same reason rejectOffer uses one, and this is the
  // likelier race of the two: withdrawing is the FARMER's action while accepting
  // is the BUYER's, so the two genuinely run at once. Losing it means the farmer
  // sees WITHDRAWN while a payable Transaction sits behind the offer.
  const claimed = await prisma.requirementOffer.updateMany({
    where: { id: offerId, status: 'PENDING' },
    data: { status: 'WITHDRAWN', respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiError(
      409,
      'This offer is no longer pending — the buyer may have just accepted it. Refresh to see the deal.',
    );
  }

  return prisma.requirementOffer.findUniqueOrThrow({ where: { id: offerId } });
}

// =============================================================================
// UPDATE REQUIREMENT — Buyer edits an open requirement
// =============================================================================
export async function updateRequirement(
  id: string,
  buyerId: string,
  input: UpdateRequirementInput,
) {
  const existing = await prisma.buyerRequirement.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Requirement not found');
  if (existing.buyerId !== buyerId) {
    throw new ApiError(403, 'You can only edit your own requirements');
  }
  if (existing.status !== 'OPEN') {
    throw new ApiError(400, `Cannot edit ${statusPhrase(existing.status)} requirement`);
  }

  const neededBy = input.neededBy !== undefined ? (input.neededBy ? new Date(input.neededBy) : null) : undefined;
  if (neededBy) {
    if (Number.isNaN(neededBy.getTime())) throw new ApiError(400, 'Invalid needed-by date');
    if (neededBy < new Date()) throw new ApiError(400, 'Needed-by date must be in the future');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Take the row lock BEFORE reading the quantities. Under READ COMMITTED a
    // concurrent fill and a quantity edit would otherwise clobber each other:
    // the edit would compute `filled` from a stale row and write back a
    // remainingQuantity that silently un-does someone's committed fill.
    const lock = await tx.buyerRequirement.updateMany({
      where: { id, status: 'OPEN' },
      data: { updatedAt: new Date() },
    });
    if (lock.count === 0) {
      throw new ApiError(409, 'This requirement is no longer open for edits.');
    }

    const current = await tx.buyerRequirement.findUniqueOrThrow({ where: { id } });
    const filled = current.quantity - current.remainingQuantity;

    let remainingQuantity: number | undefined;
    if (input.quantity !== undefined) {
      if (input.quantity <= 0) throw new ApiError(400, 'Quantity must be greater than zero');
      if (input.quantity < filled) {
        throw new ApiError(
          400,
          `You've already had ${filled} ${current.unit.toLowerCase()} filled — quantity can't go below that.`,
        );
      }
      remainingQuantity = Math.max(0, input.quantity - filled);
    }
    if (input.pricePerUnit !== undefined && input.pricePerUnit <= 0) {
      throw new ApiError(400, 'Price must be greater than zero');
    }

    const updated = await tx.buyerRequirement.update({
      where: { id },
      data: {
        cropName: input.cropName,
        cropVariety: input.cropVariety,
        quantity: input.quantity,
        remainingQuantity,
        unit: input.unit,
        qualityGrade: input.qualityGrade,
        pricePerUnit: input.pricePerUnit,
        deliveryLocation: input.deliveryLocation,
        deliveryState: input.deliveryState,
        deliveryCountry: input.deliveryCountry,
        neededBy,
        description: input.description,
        organic: input.organic,
        paymentTerms: input.paymentTerms,
        deliveryTerms: input.deliveryTerms,
      },
      include: { buyer: { select: PUBLIC_BUYER_SELECT } },
    });

    // A pending offer agreed to supply a specific crop, at a specific grade, to
    // a specific place. If the buyer has changed any of that, accepting the offer
    // later would mint a Listing/Bid/Transaction from the NEW terms while keeping
    // the farmer's OLD quantity and price — binding them to a deal they never
    // offered. Retire those offers instead; the farmer can re-offer against the
    // requirement as it now stands.
    let staleExpired: { id: string; farmerId: string }[] = [];
    if (materialTermsChanged(current, updated)) {
      staleExpired = await tx.requirementOffer.findMany({
        where: { requirementId: id, status: 'PENDING' },
        select: { id: true, farmerId: true },
      });
      await tx.requirementOffer.updateMany({
        where: { requirementId: id, status: 'PENDING' },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      });
    }

    // Shrinking the quantity down to exactly what's already filled closes it.
    // staleExpired already swept every PENDING row, so the two lists never
    // overlap — settleIfFilled finds nothing left to expire when it ran.
    const settled = await settleIfFilled(tx, id);

    return { updated, expired: [...staleExpired, ...settled.expired] };
  });

  // Best-effort, after commit — never from inside the transaction, or a rollback
  // would leave farmers told their offer expired when it didn't.
  notifyExpiredOffers(result.expired, result.updated.cropName, id);

  return result.updated;
}

// =============================================================================
// CLOSE REQUIREMENT — Buyer withdraws it before it fills
// =============================================================================
export async function closeRequirement(id: string, buyerId: string) {
  const existing = await prisma.buyerRequirement.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Requirement not found');
  if (existing.buyerId !== buyerId) {
    throw new ApiError(403, 'You can only close your own requirements');
  }
  if (existing.status !== 'OPEN') {
    throw new ApiError(400, `Cannot close ${statusPhrase(existing.status)} requirement`);
  }

  const { requirement, expired } = await prisma.$transaction(async (tx) => {
    const claim = await tx.buyerRequirement.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CLOSED' },
    });
    if (claim.count === 0) throw new ApiError(409, 'This requirement is no longer open.');

    const pending = await tx.requirementOffer.findMany({
      where: { requirementId: id, status: 'PENDING' },
      select: { id: true, farmerId: true },
    });
    await tx.requirementOffer.updateMany({
      where: { requirementId: id, status: 'PENDING' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });

    const updated = await tx.buyerRequirement.findUniqueOrThrow({
      where: { id },
      include: { buyer: { select: PUBLIC_BUYER_SELECT } },
    });
    return { requirement: updated, expired: pending };
  });

  notifyExpiredOffers(expired, requirement.cropName, id);
  return requirement;
}

// =============================================================================
// LIST ENDPOINTS
// =============================================================================
export async function getMyRequirements(
  buyerId: string,
  query: { status?: string; page?: number; limit?: number },
) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = { buyerId };
  if (query.status) where.status = query.status;

  const [requirements, total] = await Promise.all([
    prisma.buyerRequirement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        // Filtered count so the card can badge "3 offers waiting" rather than
        // counting rejected and expired ones the buyer has already dealt with.
        _count: { select: { offers: { where: { status: 'PENDING' } } } },
      },
    }),
    prisma.buyerRequirement.count({ where }),
  ]);

  return {
    requirements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

export async function getOffersForRequirement(requirementId: string, buyerId: string) {
  const requirement = await prisma.buyerRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) throw new ApiError(404, 'Requirement not found');
  if (requirement.buyerId !== buyerId) {
    throw new ApiError(403, 'You can only view offers on your own requirements');
  }

  return prisma.requirementOffer.findMany({
    where: { requirementId },
    include: {
      farmer: { select: PUBLIC_OFFER_FARMER_SELECT },
      bid: { select: { id: true, transaction: { select: { id: true, paymentStatus: true, deliveryStatus: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMyOffers(farmerUserId: string, status?: string) {
  const where: any = { farmerId: farmerUserId };
  if (status) where.status = status;

  return prisma.requirementOffer.findMany({
    where,
    include: {
      requirement: { include: { buyer: { select: PUBLIC_BUYER_SELECT } } },
      bid: { select: { id: true, transaction: { select: { id: true, paymentStatus: true, deliveryStatus: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
