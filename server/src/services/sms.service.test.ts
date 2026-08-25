// =============================================================================
// SMS service tests
// =============================================================================
// The provider adapters are thin, but two things about them are easy to get
// wrong and impossible to notice until real codes stop arriving:
//
//   1. Fast2SMS addresses Indian numbers as BARE 10 DIGITS. Our stored form is
//      "+919876543210". Sending that verbatim fails, and it fails per-request
//      at the provider — nothing in our logs would look broken.
//   2. Both Indian providers answer HTTP 200 with a failure body. Treating the
//      status code as success would leave people staring at a code box waiting
//      for an SMS that was never sent.
//
// fetch is stubbed, so nothing here talks to a provider or spends money.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { config } from '../config';
import { sendPhoneOtp } from './sms.service';

const originalFetch = globalThis.fetch;
const originalSms = { ...config.sms };
const originalEnv = config.nodeEnv;

function stubFetch(response: unknown, ok = true, status = 200) {
  const spy = vi.fn(async () => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  })) as unknown as typeof fetch;
  globalThis.fetch = spy;
  return spy as unknown as ReturnType<typeof vi.fn>;
}

/** The form-encoded body of the last fetch call, as a plain object. */
function lastBody(spy: any): Record<string, string> {
  const body = spy.mock.calls[0][1].body as URLSearchParams;
  return Object.fromEntries(body.entries());
}

beforeEach(() => {
  Object.assign(config.sms, originalSms);
  (config as any).nodeEnv = originalEnv;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.assign(config.sms, originalSms);
  (config as any).nodeEnv = originalEnv;
  vi.restoreAllMocks();
});

describe('sendPhoneOtp — Fast2SMS', () => {
  beforeEach(() => {
    config.sms.provider = 'fast2sms';
    config.sms.fast2smsApiKey = 'test-key';
    config.sms.fast2smsDltTemplateId = '';
  });

  it('strips the country code to the bare 10 digits the provider expects', async () => {
    const spy = stubFetch({ return: true });
    await sendPhoneOtp('+91 98765-43210', '123456', 5);

    expect(lastBody(spy).numbers).toBe('9876543210');
  });

  it('uses the no-DLT otp route until a template id is configured', async () => {
    const spy = stubFetch({ return: true });
    await sendPhoneOtp('+919876543210', '123456', 5);

    const body = lastBody(spy);
    expect(body.route).toBe('otp');
    expect(body.variables_values).toBe('123456');
    // A sender id on the otp route would be ignored — the shared header wins.
    expect(body.sender_id).toBeUndefined();
  });

  it('switches to the branded dlt route once a template id exists', async () => {
    config.sms.fast2smsDltTemplateId = '176677';
    config.sms.senderId = 'CROPBD';
    const spy = stubFetch({ return: true });
    await sendPhoneOtp('+919876543210', '123456', 5);

    const body = lastBody(spy);
    expect(body.route).toBe('dlt');
    expect(body.message).toBe('176677');
    expect(body.sender_id).toBe('CROPBD');
  });

  it('refuses a number that is not Indian rather than sending a truncated one', async () => {
    stubFetch({ return: true });
    // Silently slicing the last 10 digits off a US number would deliver the
    // code to whatever Indian number those digits happen to spell.
    await expect(sendPhoneOtp('+1 555 0123', '123456', 5)).rejects.toThrow(/Indian numbers/);
  });

  it('treats a 200 with return:false as a failure, not a send', async () => {
    stubFetch({ return: false, message: ['Insufficient wallet balance'] });
    await expect(sendPhoneOtp('+919876543210', '123456', 5)).rejects.toThrow(/Insufficient wallet/);
  });

  it('surfaces a non-200 response', async () => {
    stubFetch({ message: 'bad key' }, false, 401);
    await expect(sendPhoneOtp('+919876543210', '123456', 5)).rejects.toThrow(/401/);
  });
});

describe('sendPhoneOtp — no provider configured', () => {
  it('throws rather than pretending the code was sent', async () => {
    config.sms.provider = '';

    // deliverOtp() checks isSmsConfigured() before calling in, and owns the
    // console fallback for local development. Reaching here unconfigured is a
    // wiring mistake, and silently "succeeding" would leave someone waiting
    // for an SMS that was never sent.
    await expect(sendPhoneOtp('+919876543210', '123456', 5)).rejects.toThrow(/SMS_PROVIDER/);
  });
});
