// =============================================================================
// Translation Backfill — additive, safe against production
// =============================================================================
// WHY THIS EXISTS
// services/translation.service.ts translates a description when the row is
// written, which covers everything created from now on. Every listing and
// requirement written BEFORE the feature shipped still has a null
// descriptionLang and reads in one language only. This walks those rows and
// fills them in.
//
// WRITES ONLY THE TRANSLATION COLUMNS. It never touches `description` itself,
// never creates or deletes a row, and skips anything already done. Safe to
// point at production, which is where the rows that matter live.
//
// IDEMPOTENT AND RESUMABLE
// The worker's done-check is "the source-language column holds an exact copy
// of description", so re-running costs nothing on rows already finished. Ctrl-C
// at any point and re-run: it picks up where it stopped. There is no queue to
// drain and no state to reset.
//
// COSTS REAL MONEY — roughly Rs 0.002 per character per target language, so a
// 300-character description is about Rs 0.12. ALWAYS DO A SMALL RUN FIRST:
//
//   LIMIT=20 npx ts-node prisma/backfillTranslations.ts
//
// Read the output, spot-check a few rows against a native speaker, and only
// then run it unbounded:
//
//   npx ts-node prisma/backfillTranslations.ts
//
// With SARVAM_API_KEY unset this is a no-op that reports what it WOULD do —
// which makes it a free way to see the size and cost of the job first.
// =============================================================================

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { translateListingNow, translateRequirementNow } from '../src/services/translation.service';
import { isSarvamConfigured } from '../src/services/sarvam.service';

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

// Rs per character per target language, from Sarvam's published pricing
// (Rs 20 per 10,000 characters). Used only to print an estimate — the real
// figure is whatever the dashboard says.
const RUPEES_PER_CHAR = 0.002;
const TARGET_LANGUAGES = 2; // every row is translated into the two it isn't in

// Sarvam declines anything longer than this, so these rows are counted and
// reported rather than attempted. See translation.service for why we don't
// chunk or truncate them.
const MAX_TRANSLATABLE_CHARS = 2000;

function rupees(n: number): string {
  return `Rs ${n.toFixed(2)}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set — nothing to connect to.');
    process.exit(1);
  }

  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    console.error('❌ LIMIT must be a positive whole number.');
    process.exit(1);
  }

  const dryRun = !isSarvamConfigured();

  console.log('');
  console.log('  Translation backfill');
  console.log(`  Database : ${targetHost(process.env.DATABASE_URL)}`);
  console.log(`  Scope    : ${limit ? `first ${limit} of each type` : 'ALL untranslated rows'}`);
  if (dryRun) {
    console.log('  Mode     : DRY RUN (SARVAM_API_KEY is not set — nothing will be written)');
  }
  console.log('');

  const where = { descriptionLang: null, description: { not: null } } as const;
  const select = { id: true, description: true } as const;
  const order = { createdAt: 'asc' } as const;

  const [listings, requirements] = await Promise.all([
    prisma.listing.findMany({ where, select, orderBy: order, ...(limit ? { take: limit } : {}) }),
    prisma.buyerRequirement.findMany({
      where,
      select,
      orderBy: order,
      ...(limit ? { take: limit } : {}),
    }),
  ]);

  const rows = [
    ...listings.map((r) => ({ ...r, kind: 'listing' as const })),
    ...requirements.map((r) => ({ ...r, kind: 'requirement' as const })),
  ];

  const tooLong = rows.filter((r) => (r.description?.length ?? 0) > MAX_TRANSLATABLE_CHARS);
  const doable = rows.filter((r) => (r.description?.length ?? 0) <= MAX_TRANSLATABLE_CHARS);
  const chars = doable.reduce((sum, r) => sum + (r.description?.length ?? 0), 0);
  const estimate = chars * RUPEES_PER_CHAR * TARGET_LANGUAGES;

  console.log(`  Listings to do     : ${listings.length}`);
  console.log(`  Requirements to do : ${requirements.length}`);
  if (tooLong.length) {
    console.log(`  Skipped (>${MAX_TRANSLATABLE_CHARS} chars): ${tooLong.length}`);
  }
  console.log(`  Characters         : ${chars.toLocaleString('en-IN')}`);
  console.log(`  Rough cost         : ${rupees(estimate)}`);
  console.log('');

  if (dryRun || doable.length === 0) {
    if (dryRun) console.log('  Dry run — set SARVAM_API_KEY to actually translate.');
    else console.log('  Nothing to do.');
    console.log('');
    return;
  }

  let done = 0;
  let spentChars = 0;

  // Serial on purpose. The worker's own queue is serial anyway, so racing
  // these would just pile up behind the same lock while making the progress
  // output meaningless.
  for (const row of doable) {
    if (row.kind === 'listing') await translateListingNow(row.id);
    else await translateRequirementNow(row.id);

    done += 1;
    spentChars += row.description?.length ?? 0;

    // One line every 10 rows — enough to see it moving on a long run without
    // burying the summary.
    if (done % 10 === 0 || done === doable.length) {
      const spent = spentChars * RUPEES_PER_CHAR * TARGET_LANGUAGES;
      console.log(`  ${done}/${doable.length} done · ~${rupees(spent)} spent`);
    }
  }

  console.log('');
  console.log(`  ✅ Finished ${done} rows · roughly ${rupees(spentChars * RUPEES_PER_CHAR * TARGET_LANGUAGES)}`);
  console.log('');
  console.log('  Rows whose translation failed keep a null descriptionLang and');
  console.log('  will be retried by the next run. Re-running is free for rows');
  console.log('  that already succeeded.');
  console.log('');
}

main()
  .catch((err) => {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
