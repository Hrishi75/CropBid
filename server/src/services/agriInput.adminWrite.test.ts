// =============================================================================
// Adding to the inputs catalogue from the admin panel
// =============================================================================
// What has to hold once ops can write the catalogue as well as read it:
//
//   1. A product added to a shop goes through the same licence gate as a loaded
//      one: a seed at a shop with no seed licence is written, and stays hidden.
//   2. A product is held to the label rules whether it is new or edited: a
//      government price only on fertiliser, germination only on seed, at least
//      one crop, and crop names spelled the way the catalogue already spells
//      them, because /inputs filters on an exact match.
//   3. Entering a licence needs the admin to say they saw the document, and
//      leaves an audit row naming who, in the same transaction. The number is
//      never copied into that row, and never comes back out.
//   4. Clearing a licence needs no such say-so, and takes the products down.
//
// Against a real Postgres, for the same reason as agriInput.admin.test.ts: the
// claims are about what SELLABLE lets through after a write has committed.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  browseAgriInputs,
  createAgriInput,
  createSupplier,
  listCatalogueForAdmin,
  setSupplierLicences,
  updateAgriInput,
  updateSupplier,
  type AgriInputFields,
} from './agriInput.service';

const TAG = 'AdmWriteTest';
const ADMIN = 'admin-write-test';
const PHONE = '+91 98220 11111';
const LICENCE = 'MH/PUN/SEED/2026/0042';

const shopFields = (name: string, state = 'Maharashtra') => ({
  name: `${TAG} ${name}`,
  location: 'Pune',
  state,
  contactPhone: PHONE,
  contactEmail: null,
});

const seed = (title: string, extra: Partial<AgriInputFields> = {}): AgriInputFields => ({
  title,
  category: 'SEED',
  brand: 'Mahyco',
  cropNames: ['Cotton'],
  packSize: '475 g packet',
  pricePerPack: 864,
  subsidised: false,
  composition: null,
  germinationPct: 75,
  seedTreatment: null,
  dosagePerAcre: null,
  specs: [],
  description: null,
  ...extra,
});

async function cleanUp() {
  const shops = await prisma.inputSupplier.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: shops.map((s) => s.id) } } });
  await prisma.inputSupplier.deleteMany({ where: { name: { startsWith: TAG } } });
}

beforeEach(cleanUp);

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

const liveOnInputs = async (id: string) =>
  (await browseAgriInputs({ q: TAG, limit: 50 })).inputs.some((p) => p.id === id);

describe('adding a product', () => {
  it('writes it at the shop, and the licence gate still decides whether farmers see it', async () => {
    const shop = await createSupplier(shopFields('Krishi'));
    const product = await createAgriInput(shop.id, seed(`${TAG} Bt Cotton`, { pricePerPack: 864.499 }));

    expect(product).toMatchObject({
      location: 'Pune',
      state: 'Maharashtra',
      pricePerPack: 864.5,
      live: false,
      hiddenBecause: ['No seed licence on file for this shop'],
    });
    expect(await liveOnInputs(product.id)).toBe(false);
  });

  it('shows an ungated product straight away', async () => {
    const shop = await createSupplier(shopFields('Compost'));
    const product = await createAgriInput(shop.id, seed(`${TAG} Vermicompost`, {
      category: 'ORGANIC', germinationPct: null, packSize: '50 kg bag',
    }));
    expect(product.live).toBe(true);
    expect(await liveOnInputs(product.id)).toBe(true);
  });

  it('spells a crop the way the catalogue already does', async () => {
    const shop = await createSupplier(shopFields('Crops'));
    await createAgriInput(shop.id, seed(`${TAG} first`, { cropNames: ['Cotton'] }));
    const second = await createAgriInput(shop.id, seed(`${TAG} second`, {
      cropNames: ['  cotton ', 'COTTON', 'bt   brinjal'],
    }));
    expect(second.cropNames).toEqual(['Cotton', 'Bt brinjal']);
  });

  it('refuses a second product of the same name at the same shop, but not at another', async () => {
    const a = await createSupplier(shopFields('A'));
    const b = await createSupplier(shopFields('B'));
    await createAgriInput(a.id, seed(`${TAG} same`));

    await expect(createAgriInput(a.id, seed(`${TAG} same`))).rejects.toMatchObject({ statusCode: 409 });
    await expect(createAgriInput(b.id, seed(`${TAG} same`))).resolves.toBeTruthy();
  });

  it('refuses a shop that does not exist', async () => {
    await expect(
      createAgriInput('00000000-0000-4000-8000-000000000000', seed(`${TAG} orphan`))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('holds a product to the label rules, and writes nothing when it fails them', async () => {
    const shop = await createSupplier(shopFields('Rules'));
    const cases: [Partial<AgriInputFields>, string][] = [
      [{ subsidised: true }, 'Only fertiliser carries a government-set price'],
      [{ category: 'FERTILISER' }, 'Germination and seed treatment are for seed only'],
      [{ cropNames: [' '] }, 'Pick at least one crop: it is how farmers find a product'],
    ];
    for (const [extra, message] of cases) {
      await expect(createAgriInput(shop.id, seed(`${TAG} bad`, extra))).rejects.toMatchObject({
        statusCode: 400,
        message,
      });
    }
    expect(await prisma.agriInput.count({ where: { supplierId: shop.id } })).toBe(0);
  });
});

describe('editing a product', () => {
  it('holds an edit to the rules as the product will be saved', async () => {
    const shop = await createSupplier(shopFields('Edit'));
    const product = await createAgriInput(shop.id, seed(`${TAG} edit`));

    // Changing only the category would leave a germination figure on a fertiliser.
    await expect(updateAgriInput(product.id, { category: 'FERTILISER' })).rejects.toMatchObject({
      statusCode: 400,
    });
    // Clearing it in the same edit is fine.
    const fert = await updateAgriInput(product.id, {
      category: 'FERTILISER', germinationPct: null, subsidised: true,
    });
    expect(fert).toMatchObject({ category: 'FERTILISER', subsidised: true, germinationPct: null });
  });

  it('replaces the details farmers see, and can clear them', async () => {
    const shop = await createSupplier(shopFields('Specs'));
    const product = await createAgriInput(shop.id, seed(`${TAG} specs`, { specs: ['160 day duration'] }));
    expect(product.specs).toEqual(['160 day duration']);

    expect((await updateAgriInput(product.id, { specs: ['Rust resistant', 'Irrigated'] })).specs)
      .toEqual(['Rust resistant', 'Irrigated']);
    expect((await updateAgriInput(product.id, { specs: [] })).specs).toEqual([]);
    // An edit that does not mention them leaves them alone.
    await updateAgriInput(product.id, { specs: ['Kept'] });
    expect((await updateAgriInput(product.id, { pricePerPack: 900 })).specs).toEqual(['Kept']);
  });

  it('takes a product off and puts it back', async () => {
    const shop = await createSupplier(shopFields('Toggle'));
    const product = await createAgriInput(shop.id, seed(`${TAG} toggle`, {
      category: 'MICRONUTRIENT', germinationPct: null,
    }));

    const off = await updateAgriInput(product.id, { active: false });
    expect(off.hiddenBecause).toEqual(['Taken off the catalogue']);
    expect(await liveOnInputs(product.id)).toBe(false);

    const back = await updateAgriInput(product.id, { active: true, pricePerPack: 340 });
    expect(back).toMatchObject({ live: true, pricePerPack: 340 });
  });
});

describe('shops', () => {
  it('starts unverified and unlicensed, and never hands the phone number back', async () => {
    const shop = await createSupplier(shopFields('New'));
    expect(shop).toMatchObject({
      verified: false,
      active: true,
      licences: { seed: false, fertiliser: false, pesticide: false },
    });
    expect(JSON.stringify(shop)).not.toContain('98220');

    const renamed = await updateSupplier(shop.id, { name: `${TAG} Renamed`, contactPhone: '+91 90000 22222' });
    expect(renamed.name).toBe(`${TAG} Renamed`);
    expect(JSON.stringify(renamed)).not.toContain('90000');
    const row = await prisma.inputSupplier.findUniqueOrThrow({ where: { id: shop.id } });
    expect(row.contactPhone).toBe('+91 90000 22222');
  });

  it('files a shop under the one spelling of its state, and refuses a state that is not one', async () => {
    const lower = await createSupplier(shopFields('Case', '  maharashtra '));
    expect(lower.state).toBe('Maharashtra');
    // Its products inherit that spelling, which is what /inputs files them under.
    const product = await createAgriInput(lower.id, seed(`${TAG} case`));
    expect(product.state).toBe('Maharashtra');

    await expect(createSupplier(shopFields('Typo', 'Maharastra'))).rejects.toMatchObject({
      statusCode: 400,
      message: 'Pick a state from the list',
    });
    expect(await prisma.inputSupplier.count({ where: { name: `${TAG} Typo` } })).toBe(0);
  });

  it('treats the same name in another state as another shop', async () => {
    await createSupplier(shopFields('Chain'));
    await expect(createSupplier(shopFields('Chain'))).rejects.toMatchObject({ statusCode: 409 });
    await expect(createSupplier(shopFields('Chain', 'Gujarat'))).resolves.toBeTruthy();
  });
});

describe('licences', () => {
  it('will not take a licence from an admin who has not seen the document', async () => {
    const shop = await createSupplier(shopFields('Unseen'));
    await expect(setSupplierLicences(ADMIN, shop.id, { seed: LICENCE }, false)).rejects.toMatchObject({
      statusCode: 400,
    });

    const row = await prisma.inputSupplier.findUniqueOrThrow({ where: { id: shop.id } });
    expect(row.seedLicence).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: shop.id } })).toBe(0);
  });

  it('puts the shop\'s products live, and records who vouched without copying the number', async () => {
    const shop = await createSupplier(shopFields('Seen'));
    const product = await createAgriInput(shop.id, seed(`${TAG} gated`));
    expect(await liveOnInputs(product.id)).toBe(false);

    const after = await setSupplierLicences(ADMIN, shop.id, { seed: LICENCE }, true);
    expect(after.licences).toEqual({ seed: true, fertiliser: false, pesticide: false });
    expect(JSON.stringify(after)).not.toContain(LICENCE);
    expect(await liveOnInputs(product.id)).toBe(true);

    const audit = await prisma.auditLog.findMany({ where: { entityId: shop.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: ADMIN,
      action: 'admin.input_supplier.licences',
      metadata: { entered: ['seed'], cleared: [], paperworkSeen: true },
    });
    expect(JSON.stringify(audit[0])).not.toContain(LICENCE);
  });

  it('lets a licence be cleared without the tick, and takes the products down', async () => {
    const shop = await createSupplier(shopFields('Clear'));
    const product = await createAgriInput(shop.id, seed(`${TAG} cleared`));
    await setSupplierLicences(ADMIN, shop.id, { seed: LICENCE }, true);

    await setSupplierLicences(ADMIN, shop.id, { seed: null }, false);
    const { inputs } = await listCatalogueForAdmin({ q: TAG, limit: 50, offset: 0 });
    expect(inputs.find((p) => p.id === product.id)?.hiddenBecause).toEqual([
      'No seed licence on file for this shop',
    ]);

    const last = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: shop.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.metadata).toMatchObject({ entered: [], cleared: ['seed'], paperworkSeen: false });
  });

  it('refuses a request that changes nothing', async () => {
    const shop = await createSupplier(shopFields('Nothing'));
    await expect(setSupplierLicences(ADMIN, shop.id, {}, true)).rejects.toMatchObject({ statusCode: 400 });
  });
});
