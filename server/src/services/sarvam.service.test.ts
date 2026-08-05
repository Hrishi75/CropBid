// =============================================================================
// sarvam.service tests — degradation contract
// =============================================================================
// The point of these tests is NOT to prove we can call Sarvam; it's to pin the
// two degradation styles in place, because they are asymmetric and a future
// edit that "tidies" them into one would break a user-facing promise:
//
//   translate()  → returns null, never throws. Callers fall back to the
//                  original text, so a dead API is invisible.
//   transcribe() → throws ApiError(503, …, 'VOICE_UNAVAILABLE'). The client
//                  branches on that code to hide the mic button.
//
// The blank-key case matters most: the trial credits will lapse, and when they
// do the app must keep working with no code change beyond emptying the env var.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A mutable mock so one file can cover both the configured and unconfigured
// branches — vi.mock is hoisted and static, but the object it returns is not.
vi.mock('../config', () => ({ config: { sarvamApiKey: '' } }));

import { config } from '../config';
import { transcribe, translate, isSarvamConfigured } from './sarvam.service';

const AUDIO = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

// Minimal Response stand-in — enough surface for the service's ok/json path.
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.unstubAllGlobals();
  config.sarvamApiKey = '';
});

describe('with no API key configured', () => {
  it('isSarvamConfigured() is false', () => {
    expect(isSarvamConfigured()).toBe(false);
  });

  it('translate() resolves null WITHOUT calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(translate('Fresh onions from Nashik', 'en-IN', 'hi-IN')).resolves.toBeNull();
    // Spending nothing is the whole point — an unconfigured key must not even
    // reach the network.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transcribe() rejects with VOICE_UNAVAILABLE and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(transcribe(AUDIO, 'audio/webm')).rejects.toMatchObject({
      statusCode: 503,
      code: 'VOICE_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('with an API key configured', () => {
  beforeEach(() => {
    config.sarvamApiKey = 'test-key-abc123';
  });

  it('isSarvamConfigured() is true', () => {
    expect(isSarvamConfigured()).toBe(true);
  });

  describe('transcribe()', () => {
    it('returns the transcript and detected language on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            request_id: 'req_1',
            transcript: '  पचास क्विंटल प्याज़  ',
            language_code: 'hi-IN',
            language_probability: 0.94,
          }),
        ),
      );

      await expect(transcribe(AUDIO, 'audio/webm')).resolves.toEqual({
        transcript: 'पचास क्विंटल प्याज़',
        languageCode: 'hi-IN',
        languageProbability: 0.94,
      });
    });

    it('sends the key as a header and never in the URL', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ transcript: 'ok' }));
      vi.stubGlobal('fetch', fetchMock);

      await transcribe(AUDIO, 'audio/webm');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('test-key-abc123');
      expect((init.headers as Record<string, string>)['api-subscription-key']).toBe('test-key-abc123');
      // fetch must derive the multipart Content-Type itself, boundary included.
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    });

    it('treats an empty transcript as a failure, not an empty success', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ transcript: '   ' })));

      await expect(transcribe(AUDIO, 'audio/webm')).rejects.toMatchObject({
        code: 'VOICE_UNAVAILABLE',
      });
    });

    it('treats a malformed body as a failure', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));

      await expect(transcribe(AUDIO, 'audio/webm')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VOICE_UNAVAILABLE',
      });
    });

    it('converts a non-2xx into VOICE_UNAVAILABLE', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ error: { code: 'rate_limited', request_id: 'r1' } }, 429)),
      );

      await expect(transcribe(AUDIO, 'audio/webm')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VOICE_UNAVAILABLE',
      });
    });

    it('converts a network/abort failure into VOICE_UNAVAILABLE', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('aborted'); }));

      await expect(transcribe(AUDIO, 'audio/webm')).rejects.toMatchObject({
        code: 'VOICE_UNAVAILABLE',
      });
    });

    it('drops a non-numeric language_probability rather than passing it through', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ transcript: 'ok', language_probability: 'high' })),
      );

      await expect(transcribe(AUDIO, 'audio/webm')).resolves.toMatchObject({
        languageProbability: null,
      });
    });
  });

  describe('translate()', () => {
    it('returns the translated text on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ translated_text: 'नाशिक से ताज़ा प्याज़' })),
      );

      await expect(translate('Fresh onions from Nashik', 'en-IN', 'hi-IN')).resolves.toBe(
        'नाशिक से ताज़ा प्याज़',
      );
    });

    it('picks mayura under 1000 chars and sarvam-translate above it', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ translated_text: 'x' }));
      vi.stubGlobal('fetch', fetchMock);

      await translate('a'.repeat(500), 'en-IN', 'hi-IN');
      await translate('a'.repeat(1500), 'en-IN', 'hi-IN');

      const models = fetchMock.mock.calls.map(
        ([, init]) => JSON.parse((init as RequestInit).body as string).model,
      );
      expect(models).toEqual(['mayura:v1', 'sarvam-translate:v1']);
    });

    it('declines text over 2000 chars without calling fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // Truncating would misstate a seller's terms, so we decline outright.
      await expect(translate('a'.repeat(2001), 'en-IN', 'hi-IN')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips blank input and same-language pairs without calling fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(translate('   ', 'en-IN', 'hi-IN')).resolves.toBeNull();
      await expect(translate('Onions', 'hi-IN', 'hi-IN')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns null on a non-2xx instead of throwing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ error: { code: 'server_error', request_id: 'r2' } }, 500)),
      );

      await expect(translate('Onions', 'en-IN', 'hi-IN')).resolves.toBeNull();
    });

    it('returns null on a malformed body instead of throwing', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ translated_text: 42 })));

      await expect(translate('Onions', 'en-IN', 'hi-IN')).resolves.toBeNull();
    });

    it('returns null on a network failure instead of throwing', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));

      await expect(translate('Onions', 'en-IN', 'hi-IN')).resolves.toBeNull();
    });
  });
});
