// =============================================================================
// OTP delivery chain tests
// =============================================================================
// Delivery IS the login — there is no password to fall back on, so a code that
// does not arrive is an account nobody can reach. These pin down the ordering
// and, more importantly, the failure paths: that a dead WhatsApp falls through
// to email rather than ending the attempt, and that when there is nothing left
// to try the caller is told whether asking for an email would rescue it.
//
// The transports are mocked, so nothing here sends a message or spends money.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./whatsapp.service', () => ({
  isWhatsAppConfigured: vi.fn(() => true),
  sendWhatsAppOtp: vi.fn(async () => {}),
}));
vi.mock('./sms.service', () => ({
  isSmsConfigured: vi.fn(() => false),
  sendPhoneOtp: vi.fn(async () => {}),
}));
vi.mock('./email.service', () => ({
  sendSignInOtpEmail: vi.fn(async () => {}),
}));

import { config } from '../config';
import { OtpDeliveryError, deliverOtp } from './otpDelivery.service';
import { isWhatsAppConfigured, sendWhatsAppOtp } from './whatsapp.service';
import { isSmsConfigured, sendPhoneOtp } from './sms.service';
import { sendSignInOtpEmail } from './email.service';

const wa = { isConfigured: vi.mocked(isWhatsAppConfigured), send: vi.mocked(sendWhatsAppOtp) };
const sms = { isConfigured: vi.mocked(isSmsConfigured), send: vi.mocked(sendPhoneOtp) };
const email = vi.mocked(sendSignInOtpEmail);

const base = { phone: '+919876543210', code: '123456', ttlMinutes: 5 };
const originalEnv = config.nodeEnv;

beforeEach(() => {
  vi.clearAllMocks();
  wa.isConfigured.mockReturnValue(true);
  wa.send.mockResolvedValue(undefined);
  sms.isConfigured.mockReturnValue(false);
  sms.send.mockResolvedValue(undefined);
  email.mockResolvedValue(undefined);
  (config as any).nodeEnv = originalEnv;
});

afterEach(() => {
  (config as any).nodeEnv = originalEnv;
  vi.restoreAllMocks();
});

describe('deliverOtp — happy path', () => {
  it('prefers WhatsApp and does not touch the other channels', async () => {
    const result = await deliverOtp({ ...base, email: 'asha@farm.in' });

    expect(result.channel).toBe('whatsapp');
    expect(wa.send).toHaveBeenCalledWith('+919876543210', '123456');
    expect(email).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('masks the destination so it can be shown on screen', async () => {
    const result = await deliverOtp({ ...base });
    // Enough to recognise your own number, not enough to expose someone's.
    expect(result.sentTo).toBe('•••••43210');
    expect(result.sentTo).not.toContain('98765');
  });
});

describe('deliverOtp — falling through', () => {
  it('uses email when WhatsApp fails', async () => {
    wa.send.mockRejectedValue(new Error('no WhatsApp on this number'));

    const result = await deliverOtp({ ...base, email: 'asha@farm.in', name: 'Asha' });

    expect(result.channel).toBe('email');
    expect(email).toHaveBeenCalledWith('asha@farm.in', 'Asha', '123456', 5);
  });

  it('masks the email address it fell back to', async () => {
    wa.send.mockRejectedValue(new Error('down'));
    const result = await deliverOtp({ ...base, email: 'asha@farm.in' });

    expect(result.channel).toBe('email');
    expect(result.sentTo).toBe('a•••@farm.in');
  });

  it('tries SMS before email when a provider is configured', async () => {
    wa.send.mockRejectedValue(new Error('down'));
    sms.isConfigured.mockReturnValue(true);

    const result = await deliverOtp({ ...base, email: 'asha@farm.in' });

    expect(result.channel).toBe('sms');
    expect(email).not.toHaveBeenCalled();
  });

  it('still reaches email when both phone channels fail', async () => {
    wa.send.mockRejectedValue(new Error('down'));
    sms.isConfigured.mockReturnValue(true);
    sms.send.mockRejectedValue(new Error('no balance'));

    const result = await deliverOtp({ ...base, email: 'asha@farm.in' });
    expect(result.channel).toBe('email');
  });
});

describe('deliverOtp — nothing worked', () => {
  it('asks for an email when the phone channels failed and we had no address', async () => {
    wa.send.mockRejectedValue(new Error('no WhatsApp on this number'));

    // This is the one failure the UI can fix, so it has to be distinguishable
    // from a generic outage.
    const err = await deliverOtp({ ...base }).catch((e) => e);
    expect(err).toBeInstanceOf(OtpDeliveryError);
    expect(err.needsEmail).toBe(true);
  });

  it('does not ask for an email when the email we had also failed', async () => {
    wa.send.mockRejectedValue(new Error('down'));
    email.mockRejectedValue(new Error('smtp refused'));

    const err = await deliverOtp({ ...base, email: 'asha@farm.in' }).catch((e) => e);
    expect(err).toBeInstanceOf(OtpDeliveryError);
    expect(err.needsEmail).toBe(false);
  });

  it('names every channel that failed, so the logs say what actually broke', async () => {
    wa.send.mockRejectedValue(new Error('template not approved'));
    email.mockRejectedValue(new Error('smtp refused'));

    const err = await deliverOtp({ ...base, email: 'asha@farm.in' }).catch((e) => e);
    expect(err.message).toMatch(/template not approved/);
    expect(err.message).toMatch(/smtp refused/);
  });
});

describe('deliverOtp — local development', () => {
  it('prints the code when no channel is configured at all', async () => {
    wa.isConfigured.mockReturnValue(false);
    (config as any).nodeEnv = 'development';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await deliverOtp({ ...base });

    // Without this nobody could sign in to a local or preview environment,
    // since phone sign-in is the only door.
    expect(result.channel).toBe('console');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });

  it('refuses to print in production', async () => {
    wa.isConfigured.mockReturnValue(false);
    (config as any).nodeEnv = 'production';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(deliverOtp({ ...base })).rejects.toThrow(OtpDeliveryError);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
  });
});
