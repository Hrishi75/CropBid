// =============================================================================
// Admin Service — Platform Management & Overview
// =============================================================================
// Provides aggregated data for the admin dashboard plus management actions
// like viewing all users, suspending accounts, and overseeing transactions.
// =============================================================================

import { prisma } from '../lib/prisma';

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
        farmer: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total };
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
