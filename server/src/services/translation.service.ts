// =============================================================================
// Translation Service — stored Hindi / Marathi / English descriptions
// =============================================================================
// WHAT THIS DOES:
// A farmer writes a listing description in whatever language they think in.
// This translates it once, right after the row is saved, and stores the result
// in descriptionEn / descriptionHi / descriptionMr so every buyer reads it in
// their own language forever after — with no API call at read time.
//
// TRANSLATE ONCE, READ FOREVER. That is the entire point, and it is also what
// makes the feature survive the API being switched off: the columns are plain
// text, so everything already translated keeps working even with a blank key.
//
// FIRE AND FORGET. queueListingTranslation() returns void, not a promise, and
// is called AFTER the HTTP response has gone out. Creating a listing must never
// be slowed down by, or fail because of, a translation API. Nothing downstream
// may depend on this having run — readers fall back to `description`.
//
// IDEMPOTENT WITH NO EXTRA STATE. A row is already done iff the column for its
// own descriptionLang holds an exact copy of `description`. That one rule is
// why there is no job table, no translatedAt, and no queue to drain on restart:
// the backfill script is just this same function called again.
//
// SERIAL BY CONSTRUCTION. Every request goes through one promise chain, so at
// most one Sarvam call is ever in flight. That keeps us ~2 orders of magnitude
// under the rate limit and is the reason sarvam.service needs no backoff.
// =============================================================================

import { prisma } from '../lib/prisma';
import { detectSourceLanguage } from '../utils/scriptLanguage';
import { translate, type SarvamLanguage } from './sarvam.service';

type Lang = 'EN' | 'HI' | 'MR';

const ALL_LANGS: Lang[] = ['EN', 'HI', 'MR'];

const SARVAM_CODE: Record<Lang, SarvamLanguage> = {
  EN: 'en-IN',
  HI: 'hi-IN',
  MR: 'mr-IN',
};

const COLUMN: Record<Lang, 'descriptionEn' | 'descriptionHi' | 'descriptionMr'> = {
  EN: 'descriptionEn',
  HI: 'descriptionHi',
  MR: 'descriptionMr',
};

// Sarvam's larger translate model tops out here. Longer text is skipped
// outright rather than chunked or truncated: a half-translated description
// misstates a seller's commercial terms, and a buyer may quote a price against
// it. Showing the untranslated original is the honest failure — the same
// principle the crop alias table states ("showing an unrelated commodity's
// price under a farmer's own crop is worse than showing none").
const MAX_TRANSLATABLE_CHARS = 2000;

// Bound on work waiting in the chain. Translations are best-effort, so an
// unbounded queue would just be a memory leak that trades a missing column for
// a dead process. Dropped rows are recoverable — the backfill picks them up.
const MAX_PENDING = 200;

let pending = 0;
let chain: Promise<unknown> = Promise.resolve();

// Append to the serial chain. `.catch()` on the chain itself so one failure
// never poisons the jobs queued behind it.
function enqueue(job: () => Promise<void>): void {
  if (pending >= MAX_PENDING) {
    console.warn('[translation] queue full, skipping', { pending });
    return;
  }
  pending += 1;
  chain = chain
    .then(job)
    .catch((err) => console.error('[translation] job failed', err))
    .finally(() => {
      pending -= 1;
    });
}

interface TranslatableRow {
  description: string | null;
  descriptionEn: string | null;
  descriptionHi: string | null;
  descriptionMr: string | null;
  descriptionLang: Lang | null;
}

// Work out what to write for one row, or null when there is nothing to do.
// Split out from the DB calls so the decision logic is testable on its own and
// shared by both entity types.
//
// Returns the source language plus the columns to set. The source-language
// column is filled from the original at no cost — it is the same text.
async function buildTranslations(
  row: TranslatableRow,
  authorLanguage: Lang | null,
): Promise<Partial<Record<string, string | null>> | null> {
  const description = row.description?.trim();
  if (!description) return null;

  // Too long to translate safely. Recorded as nothing, retried never — the
  // length will not change unless the text does, and an edit re-queues anyway.
  if (description.length > MAX_TRANSLATABLE_CHARS) return null;

  const source = detectSourceLanguage(description, authorLanguage);
  if (!source) return null;

  // Already done: the source column holds this exact text. Cheap guard that
  // makes re-running the backfill free.
  if (row.descriptionLang === source && row[COLUMN[source]] === description) return null;

  const data: Record<string, string | null> = {
    descriptionLang: source,
    [COLUMN[source]]: description,
  };

  for (const target of ALL_LANGS) {
    if (target === source) continue;
    const translated = await translate(description, SARVAM_CODE[source], SARVAM_CODE[target]);
    // A null means Sarvam declined or failed. Leave that column alone rather
    // than writing null over a translation an earlier run may have stored —
    // a partial result is a perfectly valid outcome here.
    if (translated) data[COLUMN[target]] = translated;
  }

  return data;
}

const LISTING_SELECT = {
  description: true,
  descriptionEn: true,
  descriptionHi: true,
  descriptionMr: true,
  descriptionLang: true,
} as const;

/**
 * Translate one listing's description now. Awaits the work.
 *
 * Used by the backfill script, which wants to know when a row is finished so
 * it can pace itself. Application code should use queueListingTranslation.
 * Never throws.
 */
export async function translateListingNow(listingId: string): Promise<void> {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { ...LISTING_SELECT, farmer: { select: { user: { select: { language: true } } } } },
    });
    if (!listing) return;

    const data = await buildTranslations(
      listing as TranslatableRow,
      (listing.farmer?.user?.language as Lang | undefined) ?? null,
    );
    if (!data) return;

    await prisma.listing.update({ where: { id: listingId }, data: data as never });
  } catch (error) {
    // Swallowed by design: this runs after the user's response was sent, so
    // there is nobody to tell. The row simply stays untranslated.
    console.error('[translation] listing failed', { listingId, error });
  }
}

/** Requirement twin of translateListingNow. Never throws. */
export async function translateRequirementNow(requirementId: string): Promise<void> {
  try {
    const requirement = await prisma.buyerRequirement.findUnique({
      where: { id: requirementId },
      select: { ...LISTING_SELECT, buyer: { select: { language: true } } },
    });
    if (!requirement) return;

    const data = await buildTranslations(
      requirement as TranslatableRow,
      (requirement.buyer?.language as Lang | undefined) ?? null,
    );
    if (!data) return;

    await prisma.buyerRequirement.update({ where: { id: requirementId }, data: data as never });
  } catch (error) {
    console.error('[translation] requirement failed', { requirementId, error });
  }
}

/**
 * Queue a listing for translation. Returns immediately.
 *
 * Call this AFTER res.json() — never before, and never with await.
 */
export function queueListingTranslation(listingId: string): void {
  enqueue(() => translateListingNow(listingId));
}

/** Requirement twin of queueListingTranslation. */
export function queueRequirementTranslation(requirementId: string): void {
  enqueue(() => translateRequirementNow(requirementId));
}

/**
 * Resolves when the queue is empty. Test/script helper only — application code
 * must never wait on translations.
 */
export async function flushTranslationQueue(): Promise<void> {
  await chain;
}
