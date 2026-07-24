// =============================================================================
// Analytics Service — Data Aggregation for Charts
// =============================================================================
// WHY SERVER-SIDE AGGREGATION?
// Instead of sending raw data to the client and aggregating there:
//   1. Less data over the wire (send 12 monthly totals, not 1000 transactions)
//   2. Database is optimized for aggregation (GROUP BY, SUM, COUNT)
//   3. No risk of exposing individual records to wrong users
//
// CHART DATA FORMATS:
// All endpoints return arrays ready for Recharts consumption:
//   [{ name: "Jan", value: 42 }, { name: "Feb", value: 65 }, ...]
// =============================================================================

import { prisma } from '../lib/prisma';

// =============================================================================
// FARMER ANALYTICS — Revenue, listings, bid stats
// =============================================================================
export async function getFarmerAnalytics(userId: string) {
  const farmerProfile = await prisma.farmerProfile.findUnique({
    where: { userId },
  });

  if (!farmerProfile) return null;

  // Get all transactions where this user is the farmer
  const transactions = await prisma.transaction.findMany({
    where: { farmerId: userId },
    select: {
      totalAmount: true,
      platformFeeAmount: true,
      paymentStatus: true,
      createdAt: true,
      listing: { select: { cropName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Get listing stats. Requirement fills are excluded: they're synthetic SOLD
  // rows behind buyer-requirement deals, so counting them would inflate
  // totalListings, cropDistribution and listingStatuses with lots the farmer
  // never actually listed. The revenue figures above intentionally DO include
  // those deals — the money is real, only the listing is a carrier.
  const listings = await prisma.listing.findMany({
    where: { farmerId: farmerProfile.id, isRequirementFill: false },
    select: {
      status: true,
      cropName: true,
      createdAt: true,
      _count: { select: { bids: true } },
    },
  });

  // Get bid stats on farmer's listings
  const bids = await prisma.bid.findMany({
    where: { listing: { farmerId: farmerProfile.id } },
    select: { status: true, bidPricePerUnit: true, createdAt: true },
  });

  // --- Monthly revenue chart ---
  const monthlyRevenue = aggregateByMonth(
    transactions.filter(t => t.paymentStatus === 'RELEASED'),
    (t) => t.totalAmount - t.platformFeeAmount
  );

  // --- Crop distribution (pie chart) ---
  const cropCounts: Record<string, number> = {};
  listings.forEach((l) => {
    cropCounts[l.cropName] = (cropCounts[l.cropName] || 0) + 1;
  });
  const cropDistribution = Object.entries(cropCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // --- Listing status breakdown ---
  const statusCounts: Record<string, number> = {};
  listings.forEach((l) => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });
  const listingStatuses = Object.entries(statusCounts)
    .map(([name, value]) => ({ name, value }));

  // --- Bid activity over time ---
  const monthlyBids = aggregateByMonth(bids, () => 1);

  // --- Summary stats ---
  const totalRevenue = transactions
    .filter(t => t.paymentStatus === 'RELEASED')
    .reduce((sum, t) => sum + t.totalAmount - t.platformFeeAmount, 0);
  const totalListings = listings.length;
  const activeListings = listings.filter(l => l.status === 'ACTIVE').length;
  const totalBids = bids.length;
  const acceptedBids = bids.filter(b => b.status === 'ACCEPTED').length;
  const avgBidsPerListing = totalListings > 0 ? totalBids / totalListings : 0;

  return {
    summary: {
      totalRevenue,
      totalListings,
      activeListings,
      totalBids,
      acceptedBids,
      conversionRate: totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(1) : '0',
      avgBidsPerListing: avgBidsPerListing.toFixed(1),
    },
    charts: {
      monthlyRevenue,
      cropDistribution,
      listingStatuses,
      monthlyBids,
    },
  };
}

// =============================================================================
// BUYER ANALYTICS — Spending, bids, procurement stats
// =============================================================================
export async function getBuyerAnalytics(userId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { buyerId: userId },
    select: {
      totalAmount: true,
      paymentStatus: true,
      createdAt: true,
      listing: { select: { cropName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const bids = await prisma.bid.findMany({
    where: { buyerId: userId },
    select: {
      status: true,
      bidPricePerUnit: true,
      createdAt: true,
      listing: { select: { cropName: true } },
    },
  });

  // --- Monthly spending ---
  const monthlySpending = aggregateByMonth(
    transactions.filter(t => t.paymentStatus === 'RELEASED'),
    (t) => t.totalAmount
  );

  // --- Crop procurement mix (pie) ---
  const cropSpend: Record<string, number> = {};
  transactions.forEach((t) => {
    const crop = t.listing.cropName;
    cropSpend[crop] = (cropSpend[crop] || 0) + t.totalAmount;
  });
  const procurementMix = Object.entries(cropSpend)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // --- Bid success rate ---
  const bidStatusCounts: Record<string, number> = {};
  bids.forEach((b) => {
    bidStatusCounts[b.status] = (bidStatusCounts[b.status] || 0) + 1;
  });
  const bidStatuses = Object.entries(bidStatusCounts)
    .map(([name, value]) => ({ name, value }));

  // --- Monthly bids ---
  const monthlyBids = aggregateByMonth(bids, () => 1);

  // --- Summary ---
  const totalSpent = transactions
    .filter(t => t.paymentStatus === 'RELEASED')
    .reduce((sum, t) => sum + t.totalAmount, 0);
  const totalBids = bids.length;
  const acceptedBids = bids.filter(b => b.status === 'ACCEPTED').length;
  const totalDeals = transactions.length;

  return {
    summary: {
      totalSpent,
      totalBids,
      acceptedBids,
      totalDeals,
      successRate: totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(1) : '0',
    },
    charts: {
      monthlySpending,
      procurementMix,
      bidStatuses,
      monthlyBids,
    },
  };
}

// =============================================================================
// ADMIN ANALYTICS — Platform-wide trends
// =============================================================================
export async function getAdminAnalytics() {
  const [transactions, users, listings, bids] = await Promise.all([
    prisma.transaction.findMany({
      select: {
        totalAmount: true,
        platformFeeAmount: true,
        paymentStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      select: { role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.listing.findMany({
      select: { createdAt: true, cropName: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.bid.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const monthlyGMV = aggregateByMonth(transactions, (t) => t.totalAmount);
  const monthlyRevenue = aggregateByMonth(
    transactions.filter(t => t.paymentStatus === 'RELEASED'),
    (t) => t.platformFeeAmount
  );
  const monthlySignups = aggregateByMonth(users, () => 1);
  const monthlyListings = aggregateByMonth(listings, () => 1);
  const monthlyBids = aggregateByMonth(bids, () => 1);

  // Top crops
  const cropCounts: Record<string, number> = {};
  listings.forEach((l) => {
    cropCounts[l.cropName] = (cropCounts[l.cropName] || 0) + 1;
  });
  const topCrops = Object.entries(cropCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // User role distribution
  const roleCounts: Record<string, number> = {};
  users.forEach((u) => {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  });
  const roleDistribution = Object.entries(roleCounts)
    .map(([name, value]) => ({ name, value }));

  return {
    charts: {
      monthlyGMV,
      monthlyRevenue,
      monthlySignups,
      monthlyListings,
      monthlyBids,
      topCrops,
      roleDistribution,
    },
  };
}

// =============================================================================
// HELPER — Aggregate records by month
// =============================================================================
function aggregateByMonth<T extends { createdAt: Date }>(
  records: T[],
  getValue: (record: T) => number
): { name: string; value: number }[] {
  const months: Record<string, number> = {};

  // Ensure last 6 months are always present
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString('en', { month: 'short', year: '2-digit' });
    months[key] = 0;
  }

  records.forEach((r) => {
    const d = new Date(r.createdAt);
    const key = d.toLocaleString('en', { month: 'short', year: '2-digit' });
    months[key] = (months[key] || 0) + getValue(r);
  });

  return Object.entries(months).map(([name, value]) => ({
    name,
    value: Math.round(value),
  }));
}
