// =============================================================================
// voice.service tests — the daily quota and the pipeline's failure posture
// =============================================================================
// The quota is the only thing standing between one compromised account and the
// whole free-credit pool, so its edges are worth pinning: the cap holds, a
// failed transcription is not charged against it, and the day rolls over.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./sarvam.service', () => ({ transcribe: vi.fn() }));
vi.mock('./aiAgent', () => ({ callGemini: vi.fn() }));

import { transcribe } from './sarvam.service';
import { callGemini } from './aiAgent';
import { draftListingFromAudio, clipsUsedToday } from './voice.service';
import { ApiError } from '../utils/ApiError';

const transcribeMock = vi.mocked(transcribe);
const geminiMock = vi.mocked(callGemini);

const AUDIO = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

// Unique per test so the module-level quota Map (which persists across tests
// in a file) never leaks counts between them.
let seq = 0;
const nextUser = () => `user-${(seq += 1)}`;

const GOOD_TRANSCRIPTION = {
  transcript: 'पचास क्विंटल प्याज़, ए ग्रेड',
  languageCode: 'hi-IN',
  languageProbability: 0.94,
};

const GOOD_EXTRACTION = JSON.stringify({
  cropName: 'Onion',
  quantity: 50,
  unit: 'QUINTAL',
  qualityGrade: 'A',
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  transcribeMock.mockResolvedValue(GOOD_TRANSCRIPTION);
  geminiMock.mockResolvedValue(GOOD_EXTRACTION);
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.useRealTimers();
});

describe('draftListingFromAudio', () => {
  it('returns the transcript, detected language and extracted fields', async () => {
    const draft = await draftListingFromAudio(nextUser(), AUDIO, 'audio/webm');

    expect(draft.transcript).toBe(GOOD_TRANSCRIPTION.transcript);
    expect(draft.language).toBe('hi-IN');
    expect(draft.languageConfidence).toBe(0.94);
    expect(draft.fields).toMatchObject({
      cropName: 'Onion',
      quantity: 50,
      unit: 'QUINTAL',
      qualityGrade: 'A',
    });
  });

  it('still returns the transcript when field extraction fails', async () => {
    // The paid call already succeeded. Throwing that away because the free
    // one failed would be the wasteful choice — the farmer can read what was
    // heard and type the rest.
    geminiMock.mockRejectedValue(new Error('gemini down'));

    const draft = await draftListingFromAudio(nextUser(), AUDIO, 'audio/webm');

    expect(draft.transcript).toBe(GOOD_TRANSCRIPTION.transcript);
    expect(draft.fields.cropName).toBeNull();
  });

  it('still returns the transcript when extraction returns nonsense', async () => {
    geminiMock.mockResolvedValue('I am not JSON at all');

    const draft = await draftListingFromAudio(nextUser(), AUDIO, 'audio/webm');

    expect(draft.transcript).toBe(GOOD_TRANSCRIPTION.transcript);
    expect(draft.fields.quantity).toBeNull();
  });

  it('propagates a transcription failure to the caller', async () => {
    // Unlike extraction, this one has nothing to show the farmer.
    transcribeMock.mockRejectedValue(
      new ApiError(503, 'Voice input is not available right now.', 'VOICE_UNAVAILABLE'),
    );

    await expect(draftListingFromAudio(nextUser(), AUDIO, 'audio/webm')).rejects.toMatchObject({
      statusCode: 503,
      code: 'VOICE_UNAVAILABLE',
    });
  });
});

describe('daily quota', () => {
  it('allows 30 clips and rejects the 31st', async () => {
    const user = nextUser();

    for (let i = 0; i < 30; i += 1) {
      await draftListingFromAudio(user, AUDIO, 'audio/webm');
    }
    expect(clipsUsedToday(user)).toBe(30);

    await expect(draftListingFromAudio(user, AUDIO, 'audio/webm')).rejects.toMatchObject({
      statusCode: 429,
      code: 'VOICE_QUOTA_EXCEEDED',
    });
  });

  it('checks the quota BEFORE spending a transcription', async () => {
    const user = nextUser();
    for (let i = 0; i < 30; i += 1) {
      await draftListingFromAudio(user, AUDIO, 'audio/webm');
    }
    transcribeMock.mockClear();

    await expect(draftListingFromAudio(user, AUDIO, 'audio/webm')).rejects.toThrow();

    // A user at their cap must cost us nothing.
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it('does not charge a failed transcription against the quota', async () => {
    const user = nextUser();
    transcribeMock.mockRejectedValue(new ApiError(503, 'nope', 'VOICE_UNAVAILABLE'));

    await expect(draftListingFromAudio(user, AUDIO, 'audio/webm')).rejects.toThrow();

    // They got nothing for it, so it should not count.
    expect(clipsUsedToday(user)).toBe(0);
  });

  it('does not let concurrent requests both slip through on the same count', async () => {
    const user = nextUser();
    for (let i = 0; i < 29; i += 1) {
      await draftListingFromAudio(user, AUDIO, 'audio/webm');
    }

    // Both start while the count is 29. Reserving before the await is what
    // stops them both passing the check and both spending.
    const results = await Promise.allSettled([
      draftListingFromAudio(user, AUDIO, 'audio/webm'),
      draftListingFromAudio(user, AUDIO, 'audio/webm'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(clipsUsedToday(user)).toBe(30);
  });

  it('counts per user, not globally', async () => {
    const a = nextUser();
    const b = nextUser();

    await draftListingFromAudio(a, AUDIO, 'audio/webm');
    await draftListingFromAudio(a, AUDIO, 'audio/webm');
    await draftListingFromAudio(b, AUDIO, 'audio/webm');

    expect(clipsUsedToday(a)).toBe(2);
    expect(clipsUsedToday(b)).toBe(1);
  });

  it('does not refund a failed clip out of the next day’s quota', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T23:59:50Z'));

    const user = nextUser();
    // A clip that will fail, reserved just before midnight.
    let failNow = false;
    transcribeMock.mockImplementation(async () => {
      if (failNow) throw new ApiError(503, 'nope', 'VOICE_UNAVAILABLE');
      return GOOD_TRANSCRIPTION;
    });

    failNow = true;
    const inFlight = draftListingFromAudio(user, AUDIO, 'audio/webm');

    // Midnight passes and a new-day request resets and increments the counter.
    vi.setSystemTime(new Date('2026-08-06T00:00:05Z'));
    failNow = false;
    await draftListingFromAudio(user, AUDIO, 'audio/webm');
    expect(clipsUsedToday(user)).toBe(1);

    // Yesterday's failure now resolves. Its refund belongs to a quota that no
    // longer exists, so today's count must be untouched — otherwise the user
    // silently gets a 31st clip.
    await expect(inFlight).rejects.toThrow();
    expect(clipsUsedToday(user)).toBe(1);
  });

  it('resets when the date rolls over', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T23:59:00Z'));

    const user = nextUser();
    await draftListingFromAudio(user, AUDIO, 'audio/webm');
    expect(clipsUsedToday(user)).toBe(1);

    vi.setSystemTime(new Date('2026-08-05T00:01:00Z'));
    expect(clipsUsedToday(user)).toBe(0);
  });
});
