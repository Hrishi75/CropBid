// =============================================================================
// Restock lists, against a real Postgres
// =============================================================================
// What has to hold: a list posts every item or none, each item is an ordinary
// request sellers can offer on, the items share one list id, and a list
// repeats as a whole.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));

import { prisma } from '../lib/prisma';
import { createOffer, createRequirementList, repostDueRequirements } from './requirement.service';

const SHOP = 'list-retailer';
const FARM = 'list-farmer';

const base = { deliveryLocation: 'Delhi', deliveryState: 'Delhi', listName: 'Weekly veg' };
const items = [
  { cropName: 'List Onion', quantity: 20, qualityGrade: 'A' as const, pricePerUnit: 1800 },
  { cropName: 'List Tomato', quantity: 10, qualityGrade: 'A' as const, pricePerUnit: 1500 },
  { cropName: 'List Potato', quantity: 15, qualityGrade: 'B' as const, pricePerUnit: 1200 },
];

async function clean() {
  const reqs = await prisma.buyerRequirement.findMany({ where: { buyerId: SHOP }, select: { id: true } });
  await prisma.requirementOffer.deleteMany({ where: { requirementId: { in: reqs.map((r) => r.id) } } });
  await prisma.buyerRequirement.deleteMany({ where: { buyerId: SHOP } });
  await prisma.user.deleteMany({ where: { id: { in: [SHOP, FARM] } } });
}

beforeEach(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: SHOP, name: 'Fresh Basket', email: `${SHOP}@test.local`, password: 'x', role: 'BUYER', phone: '9800000301',
      buyerProfile: { create: { companyName: 'Fresh Basket', companyType: 'RETAILER', status: 'APPROVED' } },
    },
  });
  await prisma.user.create({
    data: {
      id: FARM, name: 'Ramesh', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000302',
      farmerProfile: { create: { id: `${FARM}-profile`, state: 'Haryana', status: 'APPROVED' } },
    },
  });
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('a restock list', () => {
  it('posts every item as its own request under one list id', async () => {
    const out = await createRequirementList(SHOP, { ...base, items });
    expect(out.requirements).toHaveLength(3);
    const rows = await prisma.buyerRequirement.findMany({ where: { buyerId: SHOP } });
    expect(new Set(rows.map((r) => r.listId))).toEqual(new Set([out.listId]));
    expect(rows.every((r) => r.listName === 'Weekly veg' && r.deliveryLocation === 'Delhi' && r.status === 'OPEN')).toBe(true);
  });

  it('lets a seller offer on one item without touching the rest', async () => {
    const out = await createRequirementList(SHOP, { ...base, items });
    const tomato = out.requirements.find((r) => r.cropName === 'List Tomato')!;
    await createOffer(tomato.id, FARM, { quantity: 10, pricePerUnit: 1600 });
    const counts = await prisma.requirementOffer.groupBy({ by: ['requirementId'], _count: true });
    expect(counts.filter((c) => out.requirements.some((r) => r.id === c.requirementId))).toHaveLength(1);
  });

  it('posts nothing when one item is bad', async () => {
    await expect(createRequirementList(SHOP, { ...base, items: [...items, { cropName: 'List Garlic', quantity: 5, qualityGrade: 'A', pricePerUnit: 0 }] }))
      .rejects.toThrow(/price for List Garlic/);
    expect(await prisma.buyerRequirement.count({ where: { buyerId: SHOP } })).toBe(0);
  });

  it('refuses one item, the same crop twice, and no address', async () => {
    await expect(createRequirementList(SHOP, { ...base, items: [items[0]] })).rejects.toThrow(/at least 2/);
    await expect(createRequirementList(SHOP, { ...base, items: [items[0], { ...items[0], quantity: 5 }] })).rejects.toThrow(/once/);
    await expect(createRequirementList(SHOP, { ...base, deliveryLocation: ' ', items })).rejects.toThrow(/delivered/);
  });

  it('repeats as a whole, the copies keeping the list', async () => {
    const out = await createRequirementList(SHOP, { ...base, items, repeatEveryDays: 7 });
    expect(await repostDueRequirements(new Date(Date.now() + 8 * 86_400_000))).toBe(3);
    const open = await prisma.buyerRequirement.findMany({ where: { buyerId: SHOP, status: 'OPEN' } });
    expect(open).toHaveLength(3);
    expect(open.every((r) => r.listId === out.listId && r.listName === 'Weekly veg')).toBe(true);
  });
});
