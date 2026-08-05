// =============================================================================
// Voice Service — spoken listing → draft form fields
// =============================================================================
// THE PIPELINE:
//   1. Sarvam speech-to-text turns the clip into a transcript (metered).
//   2. Gemini turns the transcript into structured fields (free tier).
//   3. The farmer reviews and edits every one of them before publishing.
//
// Step 2 uses Gemini rather than Sarvam's LLM on purpose — see the note at the
// top of utils/voicePrompts.ts. Short version: it keeps the metered dependency
// to one capability, so when the trial credits lapse only dictation stops.
//
// THIS SERVICE WRITES NOTHING. No listing is created, no row is touched, no
// audio is stored. It is a read-only transform whose output pre-fills a form.
// Keep it that way: the farmer's Publish button must stay the only thing that
// commits anything.
//
// THE DAILY CAP IS A SOFT GUARD, NOT ACCOUNTING. It lives in memory, which has
// two consequences worth knowing before you trust it:
//   - counters reset when the process restarts, which on Lightsail means on
//     deploy (systemctl restart cropbid-api) or a crash — not on idle, since
//     systemd keeps one long-lived process rather than spinning down, and
//   - it is per-process, so it holds exactly as long as there is one instance
//     behind Caddy. Put a second node in front and the real ceiling doubles.
// Both are acceptable for protecting a pool of free credits from one runaway
// account. Neither would be acceptable for billing. The actual backstop is the
// spend cap on the Sarvam dashboard — see .env.example.
// =============================================================================

import { callGemini } from './aiAgent';
import { transcribe } from './sarvam.service';
import { ApiError } from '../utils/ApiError';
import {
  buildListingDraftPrompt,
  parseListingDraft,
  emptyListingDraft,
  type ListingDraftFields,
} from '../utils/voicePrompts';

// 30 clips/user/day. At ~25s each that is a worst case of about Rs 6 per user
// per day — high enough that no honest farmer will ever see it, low enough
// that one compromised account cannot drain the pool overnight.
const MAX_CLIPS_PER_USER_PER_DAY = 30;

// The extraction reply is 12 fields, several of them free text. 256 (the
// negotiation default) truncates it; 1024 leaves room for a long description
// without inviting the model to ramble.
const EXTRACTION_MAX_TOKENS = 1024;

// Day-keyed counters, cleared wholesale when the date rolls over. Same shape as
// the cache in rates.service.ts — one shared day key rather than a timestamp
// per entry, so the reset is a single Map.clear() instead of a sweep.
let quotaDay = '';
const clipsToday = new Map<string, number>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetQuotaIfStale(): void {
  const d = today();
  if (d !== quotaDay) {
    quotaDay = d;
    clipsToday.clear();
  }
}

/** Clips this user has successfully transcribed today. Exposed for tests. */
export function clipsUsedToday(userId: string): number {
  resetQuotaIfStale();
  return clipsToday.get(userId) ?? 0;
}

// Claim a slot BEFORE the paid call, not after.
//
// Checking and then incrementing around an await is not atomic: two requests
// from a user at 29 clips would both see 29, both pass, and both spend. The
// per-minute limiter bounds how far that can overshoot, but reserving up front
// removes the race outright — and releaseSlot below keeps the promise that a
// failed transcription is not charged.
function reserveSlot(userId: string): void {
  const used = clipsUsedToday(userId); // also rolls the day over
  if (used >= MAX_CLIPS_PER_USER_PER_DAY) {
    throw new ApiError(
      429,
      "You've used all your voice notes for today. You can still type your listing, or try again tomorrow.",
      'VOICE_QUOTA_EXCEEDED',
    );
  }
  clipsToday.set(userId, used + 1);
}

// Hand the slot back when the clip never produced anything. Guarded against
// going negative, since a day rollover between reserve and release would
// otherwise push the counter below zero and hand out free capacity.
function releaseSlot(userId: string): void {
  const used = clipsToday.get(userId) ?? 0;
  if (used > 0) clipsToday.set(userId, used - 1);
}

export interface ListingDraft {
  transcript: string;
  /** Sarvam's guess at the spoken language, e.g. 'hi-IN'. May be null. */
  language: string | null;
  languageConfidence: number | null;
  fields: ListingDraftFields;
}

/**
 * Transcribe a voice note and extract listing fields from it.
 *
 * Throws ApiError(503, …, 'VOICE_UNAVAILABLE') when Sarvam is unconfigured or
 * failing, and ApiError(429, …, 'VOICE_QUOTA_EXCEEDED') when the caller is over
 * their daily cap. Both are shapes the client branches on.
 */
export async function draftListingFromAudio(
  userId: string,
  audio: Buffer,
  mimeType: string,
): Promise<ListingDraft> {
  // Claimed BEFORE the paid call, so a user at their cap costs us nothing and
  // concurrent requests cannot both slip through on the same count.
  reserveSlot(userId);

  let transcription;
  try {
    transcription = await transcribe(audio, mimeType);
  } catch (error) {
    // A farmer whose upload died on a bad connection got nothing, so it should
    // not count against their day.
    releaseSlot(userId);
    throw error;
  }

  const { transcript, languageCode, languageProbability } = transcription;

  return {
    transcript,
    language: languageCode,
    languageConfidence: languageProbability,
    fields: await extractFields(transcript),
  };
}

// Extraction is best-effort and deliberately non-fatal. If Gemini is
// unconfigured, slow or nonsensical, the farmer still gets their transcript and
// an empty form — strictly better than an error page, because they can read
// what was heard and type the rest. The paid part of the request already
// succeeded by this point; throwing it away would be the wasteful choice.
async function extractFields(transcript: string): Promise<ListingDraftFields> {
  try {
    const prompt = buildListingDraftPrompt(transcript, today());
    const raw = await callGemini(prompt, { maxOutputTokens: EXTRACTION_MAX_TOKENS });
    return parseListingDraft(raw);
  } catch (error) {
    console.error('[voice] field extraction failed', error);
    return emptyListingDraft();
  }
}
