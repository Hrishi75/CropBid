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
import { PLATFORM_FEE_PERCENT, countsAsFee, countsAsGmv } from './transaction.service';

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
        currency: true,
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

  const monthlyGMV = aggregateByMonth(transactions.filter(countsAsGmv), (t) => t.totalAmount);
  const monthlyRevenue = aggregateByMonth(transactions.filter(countsAsFee), (t) => t.platformFeeAmount);
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

  const [funnel, negotiations] = await Promise.all([getAdminFunnel(), getNegotiationStats()]);

  return {
    feePercent: PLATFORM_FEE_PERCENT,
    funnel,
    negotiations,
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
// ADMIN FUNNEL — how far accounts get, all time
// =============================================================================
// Counted, not estimated: the page used to multiply total signups by fixed
// shares (80%, 57%, 37%...). Admin accounts are left out of every step.
//
// A deal is one that was paid and not given back (ESCROW or RELEASED). A
// household basket is one deal however many lots it holds, so a shopper who
// bought three things once is not counted as a repeat customer: each side's
// deals are counted by shop order where there is one, else by transaction.
// Shoppers can make a deal without applying to trade, so the steps are each a
// share of signups rather than a strict narrowing.
export async function getAdminFunnel() {
  const [row] = await prisma.$queryRaw<{
    signedUp: bigint; applied: bigint; approved: bigint; dealt: bigint; repeat: bigint;
  }[]>`
    WITH people AS (
      SELECT id FROM "User" WHERE role <> 'ADMIN'
    ),
    sides AS (
      SELECT "farmerId" AS uid, COALESCE("retailOrderId", id) AS deal
        FROM "Transaction" WHERE "paymentStatus" IN ('ESCROW', 'RELEASED')
      UNION ALL
      SELECT "buyerId", COALESCE("retailOrderId", id)
        FROM "Transaction" WHERE "paymentStatus" IN ('ESCROW', 'RELEASED')
    ),
    per AS (
      SELECT s.uid, count(DISTINCT s.deal) AS n
        FROM sides s JOIN people p ON p.id = s.uid
       GROUP BY s.uid
    )
    SELECT
      (SELECT count(*) FROM people) AS "signedUp",
      (SELECT count(*) FROM people p WHERE
         EXISTS (SELECT 1 FROM "FarmerProfile" f WHERE f."userId" = p.id) OR
         EXISTS (SELECT 1 FROM "BuyerProfile" b WHERE b."userId" = p.id)) AS applied,
      (SELECT count(*) FROM people p WHERE
         EXISTS (SELECT 1 FROM "FarmerProfile" f WHERE f."userId" = p.id AND f.status = 'APPROVED') OR
         EXISTS (SELECT 1 FROM "BuyerProfile" b WHERE b."userId" = p.id AND b.status = 'APPROVED')) AS approved,
      (SELECT count(*) FROM per) AS dealt,
      (SELECT count(*) FROM per WHERE n >= 2) AS repeat`;
  return {
    signedUp: Number(row.signedUp),
    applied: Number(row.applied),
    approved: Number(row.approved),
    dealt: Number(row.dealt),
    repeat: Number(row.repeat),
  };
}

// =============================================================================
// AGENT NEGOTIATIONS — what the two-sided agents have actually done
// =============================================================================
// Replaces a card of typed-in figures (8,142 negotiations, 72.7% match rate,
// "41 seconds", "+1.6% (₹4.7Cr)" savings vs a broker). There is no broker
// price to compare with anywhere, so savings are not shown at all.
export async function getNegotiationStats() {
  const [row] = await prisma.$queryRaw<{
    total: bigint; deals: bigint; noDeals: bigint; inProgress: bigint;
    avgRounds: number | null; avgSeconds: number | null;
  }[]>`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE "finalOutcome" = 'DEAL') AS deals,
      count(*) FILTER (WHERE "finalOutcome" = 'NO_DEAL') AS "noDeals",
      count(*) FILTER (WHERE "finalOutcome" = 'IN_PROGRESS') AS "inProgress",
      avg(jsonb_array_length(rounds)) FILTER (WHERE "finalOutcome" <> 'IN_PROGRESS' AND jsonb_typeof(rounds) = 'array')::float AS "avgRounds",
      avg(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))) FILTER (WHERE "finalOutcome" = 'DEAL' AND "endedAt" IS NOT NULL)::float AS "avgSeconds"
    FROM "Negotiation"`;
  return {
    total: Number(row.total),
    deals: Number(row.deals),
    noDeals: Number(row.noDeals),
    inProgress: Number(row.inProgress),
    avgRounds: row.avgRounds,
    avgSecondsToDeal: row.avgSeconds,
  };
}

// =============================================================================
// HELPER — Aggregate records by month
// =============================================================================
export function aggregateByMonth<T extends { createdAt: Date }>(
  records: T[],
  getValue: (record: T) => number,
  now = new Date(),
): { name: string; value: number }[] {
  // Keyed by year and month as a sortable number, so a month older than the
  // six always shown still lands in date order rather than after them.
  const months = new Map<number, number>();
  const key = (d: Date) => d.getFullYear() * 12 + d.getMonth();

  // The last six months are always present, even with nothing in them.
  for (let i = 5; i >= 0; i--) {
    months.set(key(new Date(now.getFullYear(), now.getMonth() - i, 1)), 0);
  }

  for (const r of records) {
    const k = key(new Date(r.createdAt));
    months.set(k, (months.get(k) ?? 0) + getValue(r));
  }

  return [...months.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, value]) => ({
      name: new Date(Math.floor(k / 12), k % 12, 1).toLocaleString('en', { month: 'short', year: '2-digit' }),
      value: Math.round(value),
    }));
}
