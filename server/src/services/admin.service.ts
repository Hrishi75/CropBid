// =============================================================================
// Admin Service — Platform Management & Overview
// =============================================================================
// Provides aggregated data for the admin dashboard plus management actions
// like viewing all users, suspending accounts, and overseeing transactions.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { createNotification } from './notification.service';
import { sendPartnerStatusEmail } from './email.service';
import { recordAudit } from './audit.service';

// =============================================================================
// PLATFORM STATS — Top-level numbers for the dashboard
// =============================================================================
export async function getPlatformStats() {
  const [
    totalUsers,
    totalFarmers,
    totalBuyers,
    activeListings,
    totalListings,
    totalBids,
    totalTransactions,
    escrowTransactions,
    completedTransactions,
    totalNegotiations,
    gmv,
    platformRevenue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'FARMER' } }),
    prisma.user.count({ where: { role: 'BUYER' } }),
    prisma.listing.count({ where: { status: 'ACTIVE' } }),
    prisma.listing.count(),
    prisma.bid.count(),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { paymentStatus: 'ESCROW' } }),
    prisma.transaction.count({ where: { paymentStatus: 'RELEASED' } }),
    prisma.negotiation.count(),
    prisma.transaction.aggregate({ _sum: { totalAmount: true } }),
    prisma.transaction.aggregate({
      where: { paymentStatus: 'RELEASED' },
      _sum: { platformFeeAmount: true },
    }),
  ]);

  return {
    users: { total: totalUsers, farmers: totalFarmers, buyers: totalBuyers },
    listings: { total: totalListings, active: activeListings },
    bids: { total: totalBids },
    transactions: {
      total: totalTransactions,
      inEscrow: escrowTransactions,
      completed: completedTransactions,
    },
    negotiations: { total: totalNegotiations },
    financial: {
      gmv: gmv._sum.totalAmount || 0,
      platformRevenue: platformRevenue._sum.platformFeeAmount || 0,
    },
  };
}

// =============================================================================
// LIST USERS — Paginated user list with search
// =============================================================================
export async function getUsers(search?: string, role?: string, limit = 20, offset = 0) {
  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (role && ['FARMER', 'BUYER', 'ADMIN'].includes(role)) {
    where.role = role;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        location: true,
        country: true,
        trustScore: true,
        suspended: true,
        avatar: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

// =============================================================================
// LIST ALL LISTINGS — Admin view with filters
// =============================================================================
export async function getAllListings(status?: string, limit = 20, offset = 0) {
  const where: any = {};
  if (status) where.status = status;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        farmer: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { bids: true } },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  return { listings, total };
}

// =============================================================================
// LIST ALL TRANSACTIONS — Admin view
// =============================================================================
// The bid is included for its fulfilment snapshot — deliveryAddress,
// contactPhone, and the agreed terms. Without it an admin can see that an
// order exists but not where to ship it or who to call, which is most of the
// reason to look at this screen at all. Those fields live on Bid rather than
// Transaction because they're captured at order time (see schema.prisma).
export async function getAllTransactions(paymentStatus?: string, limit = 20, offset = 0) {
  const where: any = {};
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        listing: true,
        farmer: { select: { id: true, name: true, phone: true } },
        buyer: { select: { id: true, name: true, phone: true } },
        bid: {
          select: {
            quantity: true,
            deliveryAddress: true,
            contactPhone: true,
            paymentTerms: true,
            deliveryTerms: true,
            isDirectPurchase: true,
          },
        },
        // Whether freight is already booked. Ops arranges every delivery now,
        // so this row is the queue: no shipment means nobody has booked it yet.
        shipment: { select: { id: true, status: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total };
}

// =============================================================================
// LIST EQUIPMENT ENQUIRIES — Admin view of inbound machinery leads
// =============================================================================
// Enquiries are leads, not deals: they never become a Transaction, so they're
// invisible on every other admin screen. The dealer's phone is included
// because working a lead means calling both sides.
export async function getEquipmentEnquiries(status?: string, limit = 20, offset = 0) {
  const where: any = {};
  if (status && ['NEW', 'CONTACTED', 'CLOSED'].includes(status)) {
    where.status = status;
  }

  const [enquiries, total] = await Promise.all([
    prisma.equipmentEnquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        equipment: {
          select: {
            id: true,
            title: true,
            category: true,
            dealer: { select: { name: true, contactPhone: true, state: true } },
          },
        },
        user: { select: { id: true, name: true, phone: true, email: true, location: true } },
      },
    }),
    prisma.equipmentEnquiry.count({ where }),
  ]);

  return { enquiries, total };
}

// =============================================================================
// UPDATE ENQUIRY STATUS — Move a lead through the triage queue
// =============================================================================
export async function updateEnquiryStatus(enquiryId: string, status: string) {
  if (!['NEW', 'CONTACTED', 'CLOSED'].includes(status)) {
    throw new ApiError(400, 'Status must be NEW, CONTACTED, or CLOSED');
  }

  const enquiry = await prisma.equipmentEnquiry.findUnique({ where: { id: enquiryId } });
  if (!enquiry) throw new ApiError(404, 'Enquiry not found');

  return prisma.equipmentEnquiry.update({
    where: { id: enquiryId },
    data: { status: status as any },
    select: { id: true, status: true },
  });
}

// =============================================================================
// UPDATE USER — Admin can modify user details (trust score, verification)
// =============================================================================
export async function updateUser(userId: string, data: { trustScore?: number; suspended?: boolean }) {
  const updateData: any = {};

  if (typeof data.trustScore === 'number') {
    updateData.trustScore = Math.max(0, Math.min(100, data.trustScore));
  }

  if (typeof data.suspended === 'boolean') {
    if (data.suspended) {
      // Guard at the server boundary, not just in the UI: an admin must never be
      // suspendable, or a crafted request could lock every admin out of the
      // platform. The role check is what makes the hidden UI button meaningful.
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!target) {
        throw new ApiError(404, 'User not found');
      }
      if (target.role === 'ADMIN') {
        throw new ApiError(403, 'Admin accounts cannot be suspended');
      }
      updateData.suspended = true;
      // Suspending revokes the refresh token so any live session can't be renewed
      // and dies once the short-lived access token expires.
      updateData.refreshToken = null;
    } else {
      // Reinstating leaves the token null — the user simply logs in again.
      updateData.suspended = false;
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      trustScore: true,
      suspended: true,
    },
  });
}

// =============================================================================
// DELETE LISTING — Admin removes a listing from the market
// =============================================================================
// Bids and negotiations hanging off the listing cascade with it. Listings that
// already produced a transaction are financial history and can't be deleted —
// those are only removed by purgeDemoData.
export async function deleteListing(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { _count: { select: { transactions: true } } },
  });
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (listing._count.transactions > 0) {
    throw new ApiError(409, 'Listing has transactions attached and cannot be deleted');
  }

  await prisma.listing.delete({ where: { id: listingId } });
  return { id: listingId, cropName: listing.cropName };
}

// =============================================================================
// DELETE USER — Admin removes an account that never transacted
// =============================================================================
// Profiles, listings, bids, notifications, and agent config cascade with the
// user row. Negotiations that reference the user's agent config sit on OTHER
// users' bids, so they're cleared first to free the agent config's restrict
// FKs. Users with transactions are financial history — refuse.
export async function deleteUser(userId: string, actingAdminId: string) {
  if (userId === actingAdminId) {
    throw new ApiError(400, 'You cannot delete your own admin account');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'ADMIN') {
    throw new ApiError(403, 'Admin accounts cannot be deleted via the API');
  }

  const transactions = await prisma.transaction.count({
    where: { OR: [{ farmerId: userId }, { buyerId: userId }] },
  });
  if (transactions > 0) {
    throw new ApiError(409, 'User has transactions and cannot be hard-deleted');
  }

  await prisma.$transaction(async (tx) => {
    const agent = await tx.agentConfig.findUnique({ where: { userId } });
    if (agent) {
      await tx.negotiation.deleteMany({
        where: { OR: [{ farmerAgentId: agent.id }, { buyerAgentId: agent.id }] },
      });
    }
    await tx.user.delete({ where: { id: userId } });
  });

  return { id: userId, email: user.email };
}

// =============================================================================
// PURGE DEMO DATA — One-shot cleanup of seeded/test data
// =============================================================================
// Deletes ALL marketplace activity (shipments, transactions, negotiations,
// bids, listings, notifications) plus every user whose email ends in
// "@cropbid.test" — except the calling admin — and any extra emails passed
// explicitly. Real user ACCOUNTS survive; their listings/deals do not.
// Logistics partners and the waitlist are left untouched.
// Ordering matters: transactions restrict-FK onto listings/users, so activity
// rows go first, users last.
export async function purgeDemoData(actingAdminId: string, extraEmails: string[] = []) {
  const demoUserWhere = {
    id: { not: actingAdminId },
    OR: [
      { email: { endsWith: '@cropbid.test' } },
      ...(extraEmails.length > 0 ? [{ email: { in: extraEmails } }] : []),
    ],
  };

  const [shipments, transactions, negotiations, bids, listings, notifications, users] =
    await prisma.$transaction([
      prisma.shipment.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.negotiation.deleteMany(),
      prisma.bid.deleteMany(),
      prisma.listing.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.user.deleteMany({ where: demoUserWhere }),
    ]);

  return {
    deleted: {
      shipments: shipments.count,
      transactions: transactions.count,
      negotiations: negotiations.count,
      bids: bids.count,
      listings: listings.count,
      notifications: notifications.count,
      users: users.count,
    },
  };
}

// =============================================================================
// PARTNER APPLICATIONS — the approval queue
// =============================================================================
// Sellers (FarmerProfile) and buyers (BuyerProfile) apply through onboarding
// and wait in PartnerStatus.SUBMITTED. Admins work the queue here: list it,
// then approve / send back / reject. Every decision is audited and the
// applicant is notified in-app and (when they have an email) by mail.
//
// The two profile tables stay separate — merging them into one "applications"
// table would be a real migration for zero behaviour — so the queue is built
// by querying both and merging in memory. Fine at admin-queue scale: the hot
// filter (SUBMITTED/NEEDS_INFO) is served by the (status, submittedAt) index
// and the merged set is capped.

const PARTNER_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
type PartnerStatusValue = (typeof PARTNER_STATUSES)[number];

const APPLICANT_FIELDS = {
  select: { id: true, name: true, phone: true, email: true, location: true, country: true, createdAt: true, trustScore: true },
} as const;

export async function listPartnerApplications(status?: string, kind?: string, limit = 20, offset = 0) {
  const statusFilter = status && PARTNER_STATUSES.includes(status as PartnerStatusValue)
    ? { status: status as PartnerStatusValue }
    : {};

  // Cap what we pull from each table before merging. 500 per side is far past
  // any queue an admin will actually work through in one sitting.
  const CAP = 500;

  const [sellers, buyers] = await Promise.all([
    kind === 'BUYER' ? [] : prisma.farmerProfile.findMany({
      where: statusFilter,
      include: { user: APPLICANT_FIELDS },
      orderBy: { submittedAt: 'asc' },
      take: CAP,
    }),
    kind === 'SELLER' ? [] : prisma.buyerProfile.findMany({
      where: statusFilter,
      include: { user: APPLICANT_FIELDS },
      orderBy: { submittedAt: 'asc' },
      take: CAP,
    }),
  ]);

  const rows = [
    ...sellers.map((p) => ({ kind: 'SELLER' as const, ...p })),
    ...buyers.map((p) => ({ kind: 'BUYER' as const, ...p })),
  ].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

  return {
    applications: rows.slice(offset, offset + limit),
    total: rows.length,
  };
}

// Tab badges for the queue page: how many applications sit in each status,
// across both tables.
export async function getPartnerCounts() {
  const [sellerGroups, buyerGroups] = await Promise.all([
    prisma.farmerProfile.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.buyerProfile.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const s of PARTNER_STATUSES) counts[s] = 0;
  for (const g of [...sellerGroups, ...buyerGroups]) {
    counts[g.status] = (counts[g.status] || 0) + g._count._all;
  }
  return counts;
}

interface ReviewInput {
  kind: 'SELLER' | 'BUYER';
  profileId: string;
  action: 'APPROVE' | 'REQUEST_INFO' | 'REJECT' | 'SUSPEND' | 'REINSTATE';
  note?: string;
  adminId: string;
}

// Which statuses each action may act on. Guards against double-clicks and two
// admins working the same row: the second decision hits a 409, not a silent
// overwrite of the first.
const ACTION_RULES: Record<ReviewInput['action'], { from: PartnerStatusValue[]; to: PartnerStatusValue; needsNote: boolean }> = {
  APPROVE:      { from: ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'], to: 'APPROVED',   needsNote: false },
  REQUEST_INFO: { from: ['SUBMITTED', 'UNDER_REVIEW'],               to: 'NEEDS_INFO', needsNote: true },
  REJECT:       { from: ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'], to: 'REJECTED',   needsNote: true },
  SUSPEND:      { from: ['APPROVED'],                                to: 'SUSPENDED',  needsNote: true },
  REINSTATE:    { from: ['SUSPENDED'],                               to: 'APPROVED',   needsNote: false },
};

const DECISION_COPY: Record<PartnerStatusValue, { title: string; message: (note?: string) => string }> = {
  APPROVED: {
    title: 'Application approved — you are live',
    message: () => 'Welcome to CropBid. Your partner dashboard is now unlocked.',
  },
  NEEDS_INFO: {
    title: 'Your application needs one more thing',
    message: (note) => note || 'A reviewer needs more information. Open your application to see what is missing.',
  },
  REJECTED: {
    title: 'Application declined',
    message: (note) => note || 'Your application was declined. You can edit and resubmit it.',
  },
  SUSPENDED: {
    title: 'Your partner account is suspended',
    message: (note) => note || 'An admin has suspended your partner account. Contact support.',
  },
  SUBMITTED: { title: '', message: () => '' },     // never sent
  UNDER_REVIEW: { title: '', message: () => '' },  // never sent
};

export async function reviewPartnerApplication(input: ReviewInput) {
  const rule = ACTION_RULES[input.action];
  if (!rule) throw new ApiError(400, 'Unknown review action');
  if (rule.needsNote && !input.note?.trim()) {
    throw new ApiError(400, 'A note to the applicant is required for this action');
  }

  const table = input.kind === 'SELLER' ? prisma.farmerProfile : prisma.buyerProfile;
  const profile = await (table as typeof prisma.farmerProfile).findUnique({
    where: { id: input.profileId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!profile) throw new ApiError(404, 'Application not found');
  if (!rule.from.includes(profile.status as PartnerStatusValue)) {
    throw new ApiError(409, `Cannot ${input.action.toLowerCase().replace('_', ' ')} an application in status ${profile.status}`);
  }

  // Apply the decision against the EXACT status that was just read and
  // reviewed, not merely against the set this action allows. The read-then-write version made the 409 promised
  // by ACTION_RULES decorative: two admins clicking at once, or an applicant
  // resubmitting mid-review, both validate the same old status and then write
  // by profile id, so the last write silently buries the first one.
  //
  // `rule.from` is too loose to be the guard: REQUEST_INFO's destination sits
  // inside APPROVE's allowed set, so two overlapping decisions would both pass
  // it and the later one would still bury the earlier. Pinning the exact
  // observed value also catches an applicant resubmitting mid-review — the row
  // moves to SUBMITTED, which rule.from would have waved through, approving
  // fields nobody looked at.
  // The decision and the role promotion commit TOGETHER or not at all.
  //
  // They were two separate writes, which left a hole: if the promotion failed
  // after the profile went APPROVED, the applicant was approved without the
  // role, and a retry could not repair it because APPROVE no longer accepts an
  // already-APPROVED row. The reviewer's only remaining move was the database.
  const claimed = await prisma.$transaction(async (tx) => {
    const table = input.kind === 'SELLER' ? tx.farmerProfile : tx.buyerProfile;

    const decided = await (table as typeof prisma.farmerProfile).updateMany({
      where: { id: input.profileId, status: profile.status },
      data: {
        status: rule.to,
        statusNote: rule.needsNote ? input.note!.trim() : null,
        reviewedAt: new Date(),
        reviewedById: input.adminId,
        // Approval doubles as the legacy verified badge.
        ...(rule.to === 'APPROVED' ? { verified: true } : {}),
      },
    });
    if (decided.count === 0) return decided;

    // APPROVAL IS WHAT GRANTS THE ROLE.
    //
    // An applicant fills the form from a signed-in CONSUMER account, so
    // approving them has to promote them or they sit approved and still a
    // shopper, holding a profile they cannot use. Admin-only by construction:
    // the route above is requireRole('ADMIN').
    //
    // Scoped to a row still at CONSUMER so it can never demote an ADMIN or flip
    // an approved seller into a buyer if someone files both applications. A
    // zero count there is NOT a failure: it means the account already holds a
    // partner role, which is the ordinary resubmission and second-application
    // case, and the approval itself still stands.
    if (rule.to === 'APPROVED') {
      await tx.user.updateMany({
        where: { id: profile.user.id, role: 'CONSUMER' },
        data: { role: input.kind === 'SELLER' ? 'FARMER' : 'BUYER' },
      });
    }

    return decided;
  });
  if (claimed.count === 0) {
    // Somebody moved the row between the read above and this write. Re-read so
    // the message names the status it actually lost to, not the stale one.
    const now = await (table as typeof prisma.farmerProfile).findUnique({
      where: { id: input.profileId },
      select: { status: true },
    });
    throw new ApiError(409, `Cannot ${input.action.toLowerCase().replace('_', ' ')} an application in status ${now?.status ?? 'UNKNOWN'}`);
  }
  const updated = await (table as typeof prisma.farmerProfile).findUnique({
    where: { id: input.profileId },
  });

  await recordAudit({
    actorId: input.adminId,
    actorRole: 'ADMIN',
    action: `partner.application.${input.action.toLowerCase()}`,
    entityType: input.kind === 'SELLER' ? 'FarmerProfile' : 'BuyerProfile',
    entityId: input.profileId,
    metadata: { from: profile.status, to: rule.to, note: input.note?.trim() || null },
  });

  const copy = DECISION_COPY[rule.to];
  if (copy.title) {
    // Best-effort, like the email below it. The decision is already committed
    // by this point, so throwing here would hand the admin an error for a
    // review that did in fact go through — and their retry would now hit the
    // 409 above, leaving the row correct but the screen insisting otherwise.
    // A logged failure plus the email is the better half of that trade.
    await createNotification({
      userId: profile.user.id,
      type: 'PARTNER_APPLICATION',
      title: copy.title,
      message: copy.message(input.note?.trim()),
      data: { status: rule.to },
    }).catch((err) => console.error('[partner] decision notification failed:', err?.message || err));
    if (profile.user.email) {
      // Fire-and-forget: a mail outage must never block the review action.
      sendPartnerStatusEmail(profile.user.email, {
        name: profile.user.name,
        // Safe: copy.title is only non-empty for the four actionable states.
        status: rule.to as 'APPROVED' | 'NEEDS_INFO' | 'REJECTED' | 'SUSPENDED',
        note: input.note?.trim(),
      }).catch((err) => console.error('[partner] status email failed:', err?.message || err));
    }
  }

  return updated;
}

// =============================================================================
// NEEDS ATTENTION — the ops triage queue
// =============================================================================
// What ops has to do something about, derived from state rather than from a
// worklist table. Nothing here is a stored flag, so an item cannot get stuck
// "open" after the underlying thing was handled, and it cannot be lost if the
// notification that announced it failed to send.
//
// One source today: deals with no shipment. CropBid arranges the freight on
// every deal (CLAUDE.md §2a), so an unbooked deal is unstarted work. Disputes
// and KYC failures belong here too when those states exist; add them as more
// queries into the same shape rather than inventing a triage table.
export async function getAttentionItems(limit = 20) {
  const awaitingTransport = await prisma.transaction.findMany({
    where: {
      shipment: null,
      // A cancelled or refunded deal is not freight waiting to move.
      paymentStatus: { notIn: ['REFUNDED'] },
    },
    orderBy: { createdAt: 'asc' }, // oldest first: that is the one aging
    take: limit,
    include: {
      listing: { select: { cropName: true, unit: true } },
      farmer: { select: { name: true } },
      buyer: { select: { name: true } },
      bid: { select: { quantity: true, deliveryAddress: true } },
    },
  });

  const now = Date.now();

  return awaitingTransport.map((tx) => {
    const ageHours = Math.floor((now - tx.createdAt.getTime()) / 3_600_000);
    return {
      type: 'NEEDS TRANSPORT',
      id: `#T-${tx.id.slice(-6).toUpperCase()}`,
      desc: `${tx.listing.cropName} · ${tx.bid?.quantity ?? '—'} ${tx.listing.unit.toLowerCase()} · ${tx.farmer.name} → ${tx.buyer.name}`,
      // Real elapsed time, not an invented SLA target. We have not committed to
      // a booking window anywhere, so claiming one on an ops screen would be
      // making up a promise the business has not made.
      sla: ageHours < 1 ? 'just now' : ageHours < 24 ? `${ageHours}h ago` : `${Math.floor(ageHours / 24)}d ago`,
      cta: 'Book transport',
      href: `/admin/logistics/book/${tx.id}`,
      transactionId: tx.id,
      createdAt: tx.createdAt,
    };
  });
}
