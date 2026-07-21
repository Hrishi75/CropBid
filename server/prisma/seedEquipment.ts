// =============================================================================
// Equipment Catalogue Loader — additive, safe against production
// =============================================================================
// WHY THIS EXISTS
// prisma/seed.ts is the only other writer of equipment data, and it opens by
// deleting every table — users, listings, bids, transactions and all. That
// makes it correct for a development reset and unusable against production,
// which left the equipment marketplace with no way to ever get data. This
// script closes that gap: it INSERTS AND UPDATES ONLY, and never deletes.
//
// IDEMPOTENT
// Dealers are matched on (name, state) and machines on (dealer, title), so a
// re-run updates prices and specs in place rather than duplicating rows. Both
// tables lack a unique constraint on those fields, hence findFirst-then-write
// rather than upsert.
//
// `active` is deliberately never written on update: if someone has taken a
// dealer or a machine off the catalogue by hand, re-running this must not
// quietly put it back.
//
// RUN: npx ts-node prisma/seedEquipment.ts
// =============================================================================

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EQUIPMENT_DEALERS, EQUIPMENT_CATALOGUE } from './equipmentCatalogue';

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

  console.log('🚜 Loading the equipment catalogue');
  console.log(`   target: ${targetHost(process.env.DATABASE_URL)}`);
  console.log('   this script only inserts and updates — it deletes nothing\n');

  let dealersCreated = 0;
  let dealersUpdated = 0;
  const dealerIds = new Map<string, string>();

  for (const d of EQUIPMENT_DEALERS) {
    const existing = await prisma.equipmentDealer.findFirst({
      where: { name: d.name, state: d.state },
      select: { id: true },
    });

    if (existing) {
      // `active` omitted on purpose — see the header note.
      const row = await prisma.equipmentDealer.update({
        where: { id: existing.id },
        data: {
          location: d.location,
          contactPhone: d.contactPhone,
          contactEmail: d.contactEmail ?? null,
          verified: d.verified ?? false,
          rating: d.rating ?? 4.0,
          smamEmpanelled: d.smamEmpanelled ?? false,
        },
        select: { id: true },
      });
      dealerIds.set(d.name, row.id);
      dealersUpdated++;
    } else {
      const row = await prisma.equipmentDealer.create({
        data: {
          name: d.name,
          location: d.location,
          state: d.state,
          contactPhone: d.contactPhone,
          contactEmail: d.contactEmail ?? null,
          verified: d.verified ?? false,
          rating: d.rating ?? 4.0,
          smamEmpanelled: d.smamEmpanelled ?? false,
        },
        select: { id: true },
      });
      dealerIds.set(d.name, row.id);
      dealersCreated++;
    }
  }

  console.log(`   dealers:  ${dealersCreated} created, ${dealersUpdated} updated`);

  let machinesCreated = 0;
  let machinesUpdated = 0;

  for (const e of EQUIPMENT_CATALOGUE) {
    const dealerId = dealerIds.get(e.dealer);
    if (!dealerId) {
      // Only reachable if the catalogue names a dealer it does not define.
      throw new Error(`"${e.title}" names dealer "${e.dealer}", which is not in EQUIPMENT_DEALERS`);
    }

    // Nullish coalescing rather than `||` throughout: a legitimately zero price
    // or year must not be rewritten to null.
    const fields = {
      category: e.category,
      brand: e.brand ?? null,
      modelName: e.modelName ?? null,
      condition: e.condition,
      yearMade: e.yearMade ?? null,
      mode: e.mode,
      salePrice: e.salePrice ?? null,
      rentPricePerDay: e.rentPricePerDay ?? null,
      rentPricePerHour: e.rentPricePerHour ?? null,
      securityDeposit: e.securityDeposit ?? null,
      powerHp: e.powerHp ?? null,
      specs: e.specs,
      description: e.description ?? null,
      location: e.location,
      state: e.state,
    };

    const existing = await prisma.equipment.findFirst({
      where: { dealerId, title: e.title },
      select: { id: true },
    });

    if (existing) {
      await prisma.equipment.update({ where: { id: existing.id }, data: fields });
      machinesUpdated++;
    } else {
      await prisma.equipment.create({ data: { dealerId, title: e.title, ...fields } });
      machinesCreated++;
    }
  }

  console.log(`   machines: ${machinesCreated} created, ${machinesUpdated} updated`);

  const [liveDealers, liveMachines] = await Promise.all([
    prisma.equipmentDealer.count({ where: { active: true } }),
    prisma.equipment.count({ where: { active: true, dealer: { active: true } } }),
  ]);

  console.log(`\n✅ Catalogue is live: ${liveMachines} machines across ${liveDealers} dealers`);
}

main()
  .catch((err) => {
    console.error('❌ Loading the equipment catalogue failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
