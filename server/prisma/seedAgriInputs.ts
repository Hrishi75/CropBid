// =============================================================================
// Agri-Input Catalogue Loader — additive, safe against production
// =============================================================================
// WHY THIS EXISTS
// Same reason as seedEquipment.ts: prisma/seed.ts opens by deleting every
// table, which makes it correct for a development reset and unusable against
// production. This script INSERTS AND UPDATES ONLY, and never deletes.
//
// IDEMPOTENT
// Suppliers are keyed on (name, state) and products on (supplier, title), both
// enforced by unique constraints in the schema, so this runs as a single upsert
// per row: a re-run corrects prices and specs in place rather than duplicating
// stock, and two overlapping runs cannot race a find against an insert.
//
// `active` is deliberately never written on update: if someone has taken a
// supplier or a product off the catalogue by hand, re-running this must not
// quietly put it back.
//
// THE LICENCE COUNT AT THE END IS THE POINT
// The final line reports how many rows are actually LIVE, which is not the same
// as how many were written: agriInput.service.ts hides any controlled product
// whose supplier lacks the matching licence. A gap between "written" and "live"
// means a catalogue row names a shop that is not licensed for that category —
// fix the licence or drop the row, because the row is invisible either way.
//
// RUN: npx ts-node prisma/seedAgriInputs.ts
// =============================================================================

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { INPUT_SUPPLIERS, AGRI_INPUT_CATALOGUE } from './agriInputCatalogue';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);

/** Host only — a connection string carries the password. */
function targetHost(url: string | undefined): string {
  if (!url) return '(DATABASE_URL is not set)';
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set — nothing to connect to.');
    process.exit(1);
  }

  console.log('🌱 Loading the seed & fertiliser catalogue');
  console.log(`   target: ${targetHost(process.env.DATABASE_URL)}`);
  console.log('   this script only inserts and updates — it deletes nothing\n');

  const suppliersBefore = await prisma.inputSupplier.count();

  // Keyed by name alone, which is safe because the catalogue forbids a repeated
  // supplier name (see agriInputCatalogue.test.ts) — that is what lets a product
  // reference its supplier by name and nothing else. The DATABASE key is still
  // (name, state), since a chain with branches in two states is two suppliers
  // holding two separate sets of licences.
  const supplierIds = new Map<string, string>();

  for (const s of INPUT_SUPPLIERS) {
    // `active` is written on neither branch: a new supplier takes the schema
    // default of true, and an existing one keeps whatever it has.
    const shared = {
      location: s.location,
      contactPhone: s.contactPhone,
      contactEmail: s.contactEmail ?? null,
      verified: s.verified ?? false,
      rating: s.rating ?? 4.0,
      seedLicence: s.seedLicence ?? null,
      fertiliserLicence: s.fertiliserLicence ?? null,
      pesticideLicence: s.pesticideLicence ?? null,
    };

    const row = await prisma.inputSupplier.upsert({
      where: { name_state: { name: s.name, state: s.state } },
      create: { name: s.name, state: s.state, ...shared },
      update: shared,
      select: { id: true },
    });
    supplierIds.set(s.name, row.id);
  }

  const suppliersCreated = (await prisma.inputSupplier.count()) - suppliersBefore;
  console.log(
    `   suppliers: ${suppliersCreated} created, ${INPUT_SUPPLIERS.length - suppliersCreated} updated`,
  );

  const productsBefore = await prisma.agriInput.count();

  for (const p of AGRI_INPUT_CATALOGUE) {
    const supplierId = supplierIds.get(p.supplier);
    if (!supplierId) {
      // Only reachable if the catalogue names a supplier it does not define.
      throw new Error(
        `"${p.title}" names supplier "${p.supplier}", which is not in INPUT_SUPPLIERS`,
      );
    }

    // Nullish coalescing rather than `||` throughout: a legitimately zero price
    // or germination percentage must not be rewritten to null.
    const fields = {
      category: p.category,
      brand: p.brand ?? null,
      cropNames: p.cropNames,
      packSize: p.packSize,
      pricePerPack: p.pricePerPack,
      subsidised: p.subsidised ?? false,
      composition: p.composition ?? null,
      germinationPct: p.germinationPct ?? null,
      seedTreatment: p.seedTreatment ?? null,
      dosagePerAcre: p.dosagePerAcre ?? null,
      specs: p.specs ?? [],
      description: p.description ?? null,
      location: p.location,
      state: p.state,
    };

    await prisma.agriInput.upsert({
      where: { supplierId_title: { supplierId, title: p.title } },
      create: { supplierId, title: p.title, ...fields },
      update: fields,
    });
  }

  const productsCreated = (await prisma.agriInput.count()) - productsBefore;
  console.log(
    `   products:  ${productsCreated} created, ${AGRI_INPUT_CATALOGUE.length - productsCreated} updated`,
  );

  // Mirrors the SELLABLE filter in agriInput.service.ts. Kept in sync by hand
  // rather than imported, because importing a service would drag the app's
  // Prisma client into a script that has its own.
  const liveProducts = await prisma.agriInput.count({
    where: {
      active: true,
      supplier: { active: true },
      OR: [
        { category: { in: ['ORGANIC', 'MICRONUTRIENT', 'SEEDLING'] } },
        { category: 'SEED', supplier: { seedLicence: { not: null } } },
        { category: 'FERTILISER', supplier: { fertiliserLicence: { not: null } } },
        { category: 'CROP_PROTECTION', supplier: { pesticideLicence: { not: null } } },
      ],
    },
  });

  const liveSuppliers = await prisma.inputSupplier.count({ where: { active: true } });
  const written = await prisma.agriInput.count({ where: { active: true } });

  console.log(`\n✅ Catalogue is live: ${liveProducts} products across ${liveSuppliers} suppliers`);

  if (liveProducts < written) {
    console.warn(
      `\n⚠️  ${written - liveProducts} active product(s) are HIDDEN because their supplier is not\n` +
      `   licensed for that category. Add the licence to INPUT_SUPPLIERS or drop the row —\n` +
      `   the catalogue will not show it either way.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌ Loading the agri-input catalogue failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
