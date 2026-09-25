// =============================================================================
// email.service transport tests — Brevo HTTP API, and production with nothing
// =============================================================================
// Production was set up (docs/aws-lightsail-migration.md) with BREVO_API_KEY,
// which no code read, so every email went to the console and nobody got a
// password reset. These pin the two halves of the fix: the key is used, and
// production with no transport throws instead of pretending to send.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cfg = vi.hoisted(() => ({
  config: {
    nodeEnv: 'development',
    brevoApiKey: '',
    smtp: { host: '', port: 587, user: '', pass: '', from: 'CropBid <no-reply@cropbid.in>' },
  },
}));
vi.mock('../config', () => cfg);

import { sendEmail, emailTransport, parseFrom } from './email.service';

describe('email transport', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    cfg.config.nodeEnv = 'development';
    cfg.config.brevoApiKey = '';
    cfg.config.smtp.host = '';
  });

  it('sends through Brevo when BREVO_API_KEY is set, even with SMTP set too', async () => {
    cfg.config.brevoApiKey = 'test-brevo-key';
    cfg.config.smtp.host = 'smtp.example.com';
    fetchSpy.mockResolvedValue(new Response('{"messageId":"x"}', { status: 201 }));

    expect(emailTransport()).toBe('brevo');
    await sendEmail({ to: 'user@example.com', subject: 'Reset', text: 'link', html: '<p>link</p>' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('test-brevo-key');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'CropBid', email: 'no-reply@cropbid.in' },
      to: [{ email: 'user@example.com' }],
      subject: 'Reset',
      textContent: 'link',
      htmlContent: '<p>link</p>',
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('throws with Brevo\'s reason when Brevo refuses', async () => {
    cfg.config.brevoApiKey = 'test-brevo-key';
    fetchSpy.mockResolvedValue(new Response('{"message":"sender not valid"}', { status: 400 }));

    await expect(sendEmail({ to: 'a@b.in', subject: 's', text: 't' })).rejects.toThrow(
      /Brevo rejected the email \(400\).*sender not valid/,
    );
  });

  it('refuses in production when nothing is configured, and prints nothing', async () => {
    cfg.config.nodeEnv = 'production';

    expect(emailTransport()).toBe('none');
    await expect(
      sendEmail({ to: 'a@b.in', subject: 's', text: 'https://cropbid.in/reset-password?token=secret' }),
    ).rejects.toThrow(/not configured/);
    expect(logSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still prints to the console in development', async () => {
    await expect(sendEmail({ to: 'a@b.in', subject: 's', text: 't' })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });
});

describe('parseFrom', () => {
  it('splits a display name from the address', () => {
    expect(parseFrom('CropBid <no-reply@cropbid.in>')).toEqual({ name: 'CropBid', email: 'no-reply@cropbid.in' });
    expect(parseFrom('"CropBid Team" <hi@cropbid.in>')).toEqual({ name: 'CropBid Team', email: 'hi@cropbid.in' });
  });

  it('takes a bare address as it is', () => {
    expect(parseFrom('no-reply@cropbid.in')).toEqual({ email: 'no-reply@cropbid.in' });
  });
});
