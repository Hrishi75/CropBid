// =============================================================================
// Admin Service — Platform Management & Overview
// =============================================================================
// Provides aggregated data for the admin dashboard plus management actions
// like viewing all users, suspending accounts, and overseeing transactions.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

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
export async function updateUser(userId: string, data: { trustScore?: number }) {
  const updateData: any = {};

  if (typeof data.trustScore === 'number') {
    updateData.trustScore = Math.max(0, Math.min(100, data.trustScore));
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
