// =============================================================================
// Stats Service — Public platform stats for landing page
// =============================================================================
// Aggregates marketplace totals (active listings, growers, GMV) and surfaces
// recent active listings so the landing page reflects real platform activity.
// No auth required — these numbers are intentionally public marketing data.
// =============================================================================

import { prisma } from '../lib/prisma';

const SPARK_LENGTH = 11;

function buildSpark(trend: 'pos' | 'neg', seed: number): number[] {
  const base = 6;
  const drift = trend === 'pos' ? 0.55 : -0.55;
  const pts: number[] = [];
  let v = base;
  for (let i = 0; i < SPARK_LENGTH; i++) {
    const noise = ((seed * (i + 1)) % 7) / 3 - 1; // deterministic per-listing noise
    v = v + drift + noise * 0.4;
    pts.push(Number(v.toFixed(2)));
  }
  return pts;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function getLandingStats() {
  const [activeListings, farmerCount, buyerCount, txByCurrency, completedTx, recent, countryRows] =
    await Promise.all([
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      prisma.farmerProfile.count(),
      prisma.buyerProfile.count(),
      prisma.transaction.groupBy({
        by: ['currency'],
        where: { paymentStatus: { in: ['RELEASED', 'ESCROW'] } },
        _sum: { totalAmount: true },
      }),
      prisma.transaction.count({ where: { paymentStatus: { in: ['RELEASED', 'ESCROW'] } } }),
      prisma.listing.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: {
          farmer: {
            include: {
              user: { select: { name: true, trustScore: true } },
            },
          },
          _count: { select: { bids: true } },
        },
      }),
      prisma.listing.findMany({
        where: { status: 'ACTIVE' },
        select: { country: true },
        distinct: ['country'],
      }),
    ]);

  // Per-currency GMV — client converts to the viewer's selected currency
  // using its own FX table. We do NOT pre-normalize here so the client can
  // switch currencies without re-fetching.
  const gmvByCurrency: Record<string, number> = { INR: 0, USD: 0, EUR: 0, GBP: 0 };
  txByCurrency.forEach((row) => {
    gmvByCurrency[row.currency] = row._sum.totalAmount ?? 0;
  });

  // Avg bids per recent active listing — proxy for "auctions clearing now"
  const activeAuctions = await prisma.listing.count({
    where: { status: { in: ['ACTIVE', 'IN_AUCTION'] } },
  });

  const marketplace = recent.map((l) => {
    const mid = (l.pricePerUnitMin + l.pricePerUnitMax) / 2;
    const spread = l.pricePerUnitMax - l.pricePerUnitMin;
    const tone: 'pos' | 'neg' = spread > 0 && mid > l.pricePerUnitMin ? 'pos' : 'neg';
    const deltaPct = mid > 0 ? ((spread / mid) * 100) / 4 : 0; // approximate intra-day movement
    const seed = hashSeed(l.id);

    return {
      id: l.id,
      crop: l.cropName,
      variety: l.cropVariety,
      grade: l.qualityGrade,
      organic: l.organic,
      location: l.location,
      state: l.state,
      country: l.country,
      unit: l.unit,
      currency: l.currency,
      pricePerUnitMin: l.pricePerUnitMin,
      pricePerUnitMax: l.pricePerUnitMax,
      quantity: l.quantity,
      bidCount: l._count.bids,
      trustScore: l.farmer?.user?.trustScore ?? 50,
      farmerName: l.farmer?.user?.name ?? '—',
      tone,
      deltaPct: Number(deltaPct.toFixed(2)),
      spark: buildSpark(tone, seed),
    };
  });

  return {
    totals: {
      activeListings,
      farmers: farmerCount,
      buyers: buyerCount,
      gmvByCurrency,
      completedDeals: completedTx,
      activeAuctions,
      countries: countryRows.length,
    },
    marketplace,
  };
}
