// =============================================================================
// Sarvam AI Service — Indian-language speech-to-text and translation
// =============================================================================
// WHY NATIVE FETCH INSTEAD OF AN SDK?
// Same reasoning as the Gemini integration (services/aiAgent.ts): two simple
// POST endpoints, so an SDK would add a dependency, a version to track and a
// layer between us and the wire for no benefit.
//
// WHAT USES THIS:
//   - transcribe() → services/voice.service.ts, so a farmer can dictate a
//     listing instead of typing it.
//   - translate()  → services/translation.service.ts, which stores Hindi /
//     Marathi / English copies of listing and requirement descriptions.
//
// WHEN THE KEY IS BLANK the two functions behave DIFFERENTLY, on purpose —
// see the note above each. This is the one thing to understand before editing
// this file.
//
// COST: metered per second of audio and per character translated. Every call
// here spends real money, which is why voice.service caps clips per user per
// day and translation.service serialises its queue. Do not add a caller that
// loops without a bound.
// =============================================================================

import { config } from '../config';
import { ApiError } from '../utils/ApiError';

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_TRANSLATE_URL = 'https://api.sarvam.ai/translate';

// Sarvam's REST speech endpoint rejects audio of 30s or longer. The client
// stops recording at 25s (see VoiceListingButton) and multer caps the upload
// size; this constant exists so the three limits are traceable to one number.
export const MAX_AUDIO_SECONDS = 25;

// Timeouts. The rates service (services/rates.service.ts) established the
// AbortController pattern in this codebase; aiAgent.ts predates it and has no
// timeout at all, which is a flaw, not a precedent — a hung socket there holds
// the HTTP request open indefinitely.
//
// STT is generous because it uploads a file from a rural mobile connection and
// then waits on inference. Translation is short: it's a small JSON body and
// nobody is waiting on the response (it runs after the user's request has
// already been answered).
const STT_TIMEOUT_MS = 20_000;
const TRANSLATE_TIMEOUT_MS = 10_000;

// Sarvam's translate models, by input-length ceiling. mayura is the default and
// the cheaper path; sarvam-translate stretches to 2000 chars. Text longer than
// the larger ceiling is NOT chunked — see translation.service.ts for why.
const MAYURA_MAX_CHARS = 1000;
const SARVAM_TRANSLATE_MAX_CHARS = 2000;

// The BCP-47-ish codes Sarvam uses. We only ever send these three: the UI
// offers exactly English, Hindi and Marathi (see client/src/i18n.ts).
export type SarvamLanguage = 'en-IN' | 'hi-IN' | 'mr-IN';

export interface Transcription {
  transcript: string;
  // Sarvam's own guess at what language was spoken, when we ask it to detect
  // (language_code: 'unknown'). May be a language we don't support — callers
  // must treat it as information, never as a routing key.
  languageCode: string | null;
  languageProbability: number | null;
}

/**
 * True when a Sarvam API key is configured.
 *
 * Powers GET /api/voice/status, which is what lets the microphone button
 * disappear cleanly instead of erroring once the trial credits lapse.
 */
export function isSarvamConfigured(): boolean {
  return Boolean(config.sarvamApiKey);
}

// Auth header. Sent as a header rather than a query parameter for the same
// reason aiAgent.ts does it: a key in a URL ends up in access logs, referrer
// headers and any error trace that includes the request line.
function authHeaders(): Record<string, string> {
  return { 'api-subscription-key': config.sarvamApiKey };
}

// Sarvam errors come back as { error: { message, code, request_id } }. Log the
// status, the code and the request id — those are what Sarvam support can act
// on. Never log the API key, the audio, or the user's text.
async function logSarvamFailure(label: string, response: Response): Promise<void> {
  let code: unknown;
  let requestId: unknown;
  try {
    const body = (await response.json()) as { error?: { code?: unknown; request_id?: unknown } };
    code = body?.error?.code;
    requestId = body?.error?.request_id;
  } catch {
    // A non-JSON error body (a gateway HTML page, say) tells us nothing extra.
  }
  console.error(`[sarvam] ${label} failed`, {
    status: response.status,
    code: code ?? null,
    requestId: requestId ?? null,
  });
}

// WHY NO RETRY OR BACKOFF, on either function:
//   - transcribe() is synchronous to a farmer holding a phone. Layering a
//     backoff on top of a 20s timeout makes the worst case 40s+, by which
//     point they have given up. Failing fast and saying "try again" is kinder.
//   - translate() is already serialised to one in-flight request by its
//     caller, which is roughly two orders of magnitude under Sarvam's rate
//     limit. A 429 there means something else is using the account, and the
//     honest response is to leave the column null: the backfill script re-runs
//     later and picks it up, because the worker is idempotent.
// This is a decision, not an oversight. Revisit it only with evidence of
// transient failures that a retry would actually have fixed.

/**
 * Transcribe a short audio clip.
 *
 * THROWS on every failure — blank key, timeout, non-2xx, unusable body — with
 * `code: 'VOICE_UNAVAILABLE'` so the client can hide the feature rather than
 * show an error. That is the opposite of translate() below, and deliberate:
 * this function's caller is a person waiting on a spinner, and resolving to
 * null would leave them staring at a control that silently did nothing.
 */
export async function transcribe(audio: Buffer, mimeType: string): Promise<Transcription> {
  if (!config.sarvamApiKey) {
    throw new ApiError(503, 'Voice input is not available right now.', 'VOICE_UNAVAILABLE');
  }

  const form = new FormData();
  // Node 22+ ships global FormData/Blob, so this needs no `form-data` package.
  // Do NOT set Content-Type by hand — fetch derives it, and a hand-written
  // value would be missing the multipart boundary.
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'voice-note');
  form.append('model', 'saaras:v3');
  // 'unknown' asks Sarvam to detect the language. Farmers mix Hindi, Marathi
  // and English freely ("50 quintal kanda, A grade"), so pinning a language
  // code to the UI's current locale would transcribe code-mixed speech worse
  // than letting the model decide.
  form.append('language_code', 'unknown');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

    const response = await fetch(SARVAM_STT_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      await logSarvamFailure('speech-to-text', response);
      throw new ApiError(503, 'Could not process that voice note. Please try again.', 'VOICE_UNAVAILABLE');
    }

    const data = (await response.json()) as unknown;
    return parseTranscription(data);
  } catch (error) {
    // Re-throw our own errors untouched; convert everything else (abort,
    // socket reset, malformed JSON) into the same client-facing shape.
    if (error instanceof ApiError) throw error;
    console.error('[sarvam] speech-to-text error:', error);
    throw new ApiError(503, 'Could not process that voice note. Please try again.', 'VOICE_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Parsed with a per-field type guard each, in the spirit of parseAgentResponse
// (utils/prompts.ts) — a 200 response is not a promise that the body has the
// shape the docs describe.
//
// An empty transcript is treated as a FAILURE rather than an empty success:
// to the caller, "the model heard nothing" and "the response was malformed"
// need the same handling, and returning '' would send a farmer to an empty
// form with no explanation.
function parseTranscription(data: unknown): Transcription {
  const body = data as {
    transcript?: unknown;
    language_code?: unknown;
    language_probability?: unknown;
  } | null;

  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) {
    throw new ApiError(503, 'Could not make out any speech in that recording.', 'VOICE_UNAVAILABLE');
  }

  return {
    transcript,
    languageCode: typeof body?.language_code === 'string' ? body.language_code : null,
    languageProbability:
      typeof body?.language_probability === 'number' && Number.isFinite(body.language_probability)
        ? body.language_probability
        : null,
  };
}

/**
 * Translate a short piece of text.
 *
 * Returns null on EVERY failure and never throws — blank key, over-length
 * input, timeout, non-2xx, unusable body. The caller is a background worker
 * whose no-op is correct and invisible: a null column simply falls back to the
 * original text at render time, exactly as rates.service returning [] falls
 * back to reference prices. Nothing downstream may depend on this succeeding.
 */
export async function translate(
  input: string,
  source: SarvamLanguage,
  target: SarvamLanguage,
): Promise<string | null> {
  if (!config.sarvamApiKey) return null;

  const text = input.trim();
  if (!text) return null;
  if (source === target) return null;

  // Pick the model by length. Over the larger ceiling we decline entirely
  // rather than truncate — a half-translated description misstates a seller's
  // terms, which is worse than showing the buyer the original.
  let model: string;
  if (text.length <= MAYURA_MAX_CHARS) {
    model = 'mayura:v1';
  } else if (text.length <= SARVAM_TRANSLATE_MAX_CHARS) {
    model = 'sarvam-translate:v1';
  } else {
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

    const response = await fetch(SARVAM_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        input: text,
        source_language_code: source,
        target_language_code: target,
        model,
        // 'formal' over the colloquial modes: these are commercial listings a
        // buyer may quote a price against, so register matters more than
        // sounding chatty.
        mode: 'formal',
        // Keep digits as 50, not ५०. Prices and quantities sit next to
        // numbers rendered by the UI in international form, and mixing the
        // two in one card reads as a bug.
        numerals_format: 'international',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await logSarvamFailure('translate', response);
      return null;
    }

    const body = (await response.json()) as { translated_text?: unknown } | null;
    const translated = typeof body?.translated_text === 'string' ? body.translated_text.trim() : '';
    return translated || null;
  } catch (error) {
    console.error('[sarvam] translate error:', error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
