// =============================================================================
// The admin catalogue: every product, and an honest account of the gate
// =============================================================================
// The admin view shows rows the licence gate hides from farmers, so the thing
// that can go wrong is it disagreeing with /inputs. The properties:
//
//   1. A row is marked live exactly when SELLABLE lets it through, and the
//      explanation for a hidden row (REQUIRED_LICENCE, a second statement of the
//      same rule) agrees with that for every category and every licence mix. If
//      someone gates a new category in one and not the other, this fails.
//   2. The live/hidden filters split the catalogue along the same line, and the
//      live count is the number a farmer can actually browse.
//   3. A shop is told which licences its own stock is waiting on, and a shop
//      selling only compost is told none.
//   4. Being an admin read does not make it a way to collect phone numbers or
//      licence numbers.
//
// Against a real Postgres, because the claim is about what SELLABLE selects,
// and a mocked client cannot run a query.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  CATEGORIES,
  browseAgriInputs,
  hiddenBecause,
  listCatalogueForAdmin,
  listSuppliersForAdmin,
} from './agriInput.service';

// Every test row carries this in its shop's name and nowhere else, so a search
// for it scopes the results to this file, and finds them through the shop-name
// branch of the search rather than the title.
const TAG = 'AdmCatTest';
const LICENCE = `${TAG}-LICENCE-NO`;

// Every licence mix worth distinguishing: none, each one alone, all three, and
// all three at a shop that has been taken off.
const SHOPS = [
  { key: 'none', active: true, seed: false, fertiliser: false, pesticide: false },
  { key: 'seed', active: true, seed: true, fertiliser: false, pesticide: false },
  { key: 'fert', active: true, seed: false, fertiliser: true, pesticide: false },
  { key: 'pest', active: true, seed: false, fertiliser: false, pesticide: true },
  { key: 'all', active: true, seed: true, fertiliser: true, pesticide: true },
  { key: 'closed', active: false, seed: true, fertiliser: true, pesticide: true },
] as const;

const shopName = (key: string) => `${TAG} ${key}`;

async function cleanUp() {
  await prisma.inputSupplier.deleteMany({ where: { name: { startsWith: TAG } } });
}

beforeAll(async () => {
  await cleanUp();

  for (const shop of SHOPS) {
    await prisma.inputSupplier.create({
      data: {
        name: shopName(shop.key),
        location: 'Pune',
        state: 'Maharashtra',
        contactPhone: '+91 90000 00000',
        active: shop.active,
        seedLicence: shop.seed ? LICENCE : null,
        fertiliserLicence: shop.fertiliser ? LICENCE : null,
        pesticideLicence: shop.pesticide ? LICENCE : null,
        // One product in every category at every shop.
        inputs: {
          create: CATEGORIES.map((category) => ({
            title: `${category} product`,
            category,
            cropNames: ['Cotton'],
            packSize: '1 kg',
            pricePerPack: 100,
            location: 'Pune',
            state: 'Maharashtra',
          })),
        },
      },
    });
  }

  // A product taken off by hand at the fully licensed shop.
  const all = await prisma.inputSupplier.findFirstOrThrow({ where: { name: shopName('all') } });
  await prisma.agriInput.create({
    data: {
      supplierId: all.id, title: 'withdrawn seed', category: 'SEED', cropNames: [],
      packSize: '1 kg', pricePerPack: 100, location: 'Pune', state: 'Maharashtra', active: false,
    },
  });

  // A shop with only ungated stock and no licences at all.
  await prisma.inputSupplier.create({
    data: {
      name: shopName('compost'), location: 'Nagpur', state: 'Maharashtra', contactPhone: '+91 90000 00001',
      inputs: {
        create: {
          title: 'vermicompost', category: 'ORGANIC', cropNames: [],
          packSize: '25 kg bag', pricePerPack: 300, location: 'Nagpur', state: 'Maharashtra',
        },
      },
    },
  });
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

type AdminQuery = Parameters<typeof listCatalogueForAdmin>[0];

const everything = (extra: Partial<AdminQuery> = {}) =>
  listCatalogueForAdmin({ q: TAG, limit: 100, offset: 0, ...extra });

describe('live or hidden', () => {
  it('agrees with the licence gate for every category at every licence mix', async () => {
    const { inputs } = await everything();
    // 6 shops x 6 categories, the withdrawn seed, the compost.
    expect(inputs).toHaveLength(SHOPS.length * CATEGORIES.length + 2);

    const raw = await prisma.agriInput.findMany({
      where: { supplier: { name: { startsWith: TAG } } },
      include: { supplier: true },
    });
    const byId = new Map(raw.map((r) => [r.id, r]));

    for (const row of inputs) {
      const explained = hiddenBecause(byId.get(row.id)!);
      // live comes from SELLABLE; the explanation from REQUIRED_LICENCE.
      expect({ id: `${row.supplier.name} / ${row.title}`, live: row.live })
        .toEqual({ id: `${row.supplier.name} / ${row.title}`, live: explained.length === 0 });
      expect(row.hiddenBecause).toEqual(row.live ? [] : explained);
    }
  });

  it('names the licence a hidden row is waiting on', async () => {
    const { inputs } = await everything();
    const at = (shop: string, category: string) =>
      inputs.find((r) => r.supplier.name === shopName(shop) && r.category === category)!;

    expect(at('none', 'SEED').hiddenBecause).toEqual(['No seed licence on file for this shop']);
    expect(at('seed', 'FERTILISER').hiddenBecause).toEqual(['No fertiliser licence on file for this shop']);
    expect(at('fert', 'CROP_PROTECTION').hiddenBecause).toEqual(['No pesticide licence on file for this shop']);
    expect(at('none', 'ORGANIC').live).toBe(true);
    expect(at('closed', 'ORGANIC').hiddenBecause).toEqual(['The shop is taken off the catalogue']);
  });

  it('gives every reason, not just the first', async () => {
    const { inputs } = await everything();
    const withdrawn = inputs.find((r) => r.title === 'withdrawn seed')!;
    expect(withdrawn.live).toBe(false);
    expect(withdrawn.hiddenBecause).toEqual(['Taken off the catalogue']);

    const raw = {
      active: false,
      category: 'SEED' as const,
      supplier: { active: false, seedLicence: null, fertiliserLicence: null, pesticideLicence: null },
    };
    expect(hiddenBecause(raw)).toEqual([
      'Taken off the catalogue',
      'The shop is taken off the catalogue',
      'No seed licence on file for this shop',
    ]);
  });
});

describe('the filters', () => {
  it('splits the catalogue along the same line the rows are marked on', async () => {
    const [all, live, hidden] = await Promise.all([
      everything(),
      everything({ visibility: 'live' }),
      everything({ visibility: 'hidden' }),
    ]);

    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
    expect(ids(live.inputs)).toEqual(ids(all.inputs.filter((r) => r.live)));
    expect(ids(hidden.inputs)).toEqual(ids(all.inputs.filter((r) => !r.live)));
    expect(live.total + hidden.total).toBe(all.total);
  });

  it('counts as live exactly what a farmer can browse', async () => {
    const [{ counts, categories }, browse] = await Promise.all([
      listCatalogueForAdmin({ limit: 1, offset: 0 }),
      browseAgriInputs({ limit: 1 }),
    ]);
    expect(counts.live).toBe(browse.total);
    expect(counts.total).toBe(await prisma.agriInput.count());
    expect(categories.map((c) => c.id)).toEqual([...CATEGORIES]);
    expect(categories.find((c) => c.id === 'SEED')?.licence).toBe('seed');
    expect(categories.find((c) => c.id === 'CROP_PROTECTION')?.licence).toBe('pesticide');
    expect(categories.find((c) => c.id === 'ORGANIC')?.licence).toBeNull();
  });

  it('narrows to one category', async () => {
    const { inputs } = await everything({ category: 'FERTILISER' });
    expect(inputs.length).toBe(SHOPS.length);
    expect(inputs.every((r) => r.category === 'FERTILISER')).toBe(true);
  });
});

describe('the shops', () => {
  it('lists the licences each shop\'s own stock is waiting on', async () => {
    const { suppliers } = await listSuppliersForAdmin();
    const shop = (key: string) => suppliers.find((s) => s.name === shopName(key))!;

    expect(shop('none').missingLicences).toEqual(['seed', 'fertiliser', 'pesticide']);
    expect(shop('seed').missingLicences).toEqual(['fertiliser', 'pesticide']);
    expect(shop('all').missingLicences).toEqual([]);
    expect(shop('compost').missingLicences).toEqual([]);

    expect(shop('none')).toMatchObject({ products: 6, live: 3 });
    expect(shop('all')).toMatchObject({ products: 7, live: 6 });
    expect(shop('closed')).toMatchObject({ products: 6, live: 0, active: false });
    expect(shop('seed').licences).toEqual({ seed: true, fertiliser: false, pesticide: false });
  });
});

describe('what never leaves', () => {
  it('carries no phone number and no licence number', async () => {
    const [catalogue, shops] = await Promise.all([everything(), listSuppliersForAdmin()]);
    for (const body of [JSON.stringify(catalogue), JSON.stringify(shops)]) {
      expect(body).not.toContain('contactPhone');
      expect(body).not.toContain('+91 9000');
      expect(body).not.toContain(LICENCE);
      expect(body).not.toMatch(/Licence"\s*:/); // seedLicence, fertiliserLicence, ...
    }
  });
});
