// =============================================================================
// The market's lot-size floor, against a real Postgres
// =============================================================================
// Lots are listed in kg, quintals or tonnes, so a floor in quintals has to be
// converted per unit. Compared raw, "50" would let a 60 kg lot through and
// shut out a 6 tonne one, which is exactly backwards for an exporter.
// The crop name is unique to this file so other rows cannot leak in.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { browseListings } from './browse.service';

const SELLER = 'minq-seller';
const CROP = 'Minq Test Pepper';

const lots = [
  { id: 'minq-kg', unit: 'KG' as const, remainingQuantity: 4000 },      // 40 qtl
  { id: 'minq-qtl', unit: 'QUINTAL' as const, remainingQuantity: 60 },  // 60 qtl
  { id: 'minq-t', unit: 'TONNE' as const, remainingQuantity: 3 },       // 30 qtl
  { id: 'minq-small', unit: 'KG' as const, remainingQuantity: 60 },     // 0.6 qtl
];

async function clean() {
  await prisma.listing.deleteMany({ where: { id: { in: lots.map((l) => l.id) } } });
  await prisma.user.deleteMany({ where: { id: SELLER } });
}

beforeAll(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: SELLER, name: SELLER, email: `${SELLER}@test.local`, password: 'x', role: 'FARMER',
      farmerProfile: { create: { id: `${SELLER}-profile`, state: 'Kerala' } },
    },
  });
  for (const l of lots) {
    await prisma.listing.create({
      data: {
        id: l.id, farmerId: `${SELLER}-profile`, cropName: CROP, unit: l.unit,
        quantity: l.remainingQuantity, remainingQuantity: l.remainingQuantity,
        qualityGrade: 'A', pricePerUnitMin: 100, pricePerUnitMax: 120, location: 'Kochi', state: 'Kerala',
      },
    });
  }
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const ids = async (minQuintals?: number) =>
  (await browseListings({ crop: CROP, minQuintals, limit: 50 })).listings.map((l: { id: string }) => l.id).sort();

describe('minimum lot size', () => {
  it('converts the floor into each unit', async () => {
    expect(await ids(50)).toEqual(['minq-qtl']);
    expect(await ids(30)).toEqual(['minq-kg', 'minq-qtl', 'minq-t']);
  });

  it('shows everything without a floor', async () => {
    expect(await ids()).toHaveLength(4);
  });

  it('counts the matching total, not the page', async () => {
    const r = await browseListings({ crop: CROP, minQuintals: 30, limit: 1 });
    expect(r.listings).toHaveLength(1);
    expect(r.pagination.total).toBe(3);
  });
});

describe('grade', () => {
  it('ignores a grade that does not exist instead of failing', async () => {
    await expect(browseListings({ crop: CROP, quality: 'Z' })).resolves.toBeTruthy();
  });
});
