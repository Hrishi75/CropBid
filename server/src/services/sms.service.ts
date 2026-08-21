// =============================================================================
// SMS Service — one-time codes to a handset
// =============================================================================
// Mirrors email.service.ts: provider-agnostic, and a no-op-with-console-output
// in development so the sign-in flow is fully testable without a provider or a
// real phone. Set SMS_PROVIDER plus that provider's keys to send for real.
//
// WHICH PROVIDER (India, checked Aug 2026 — re-check before committing spend):
//
//   fast2sms  ₹0.25/SMS at a ₹100 top-up, falling to ₹0.11 at very high
//             volume. Its `otp` route sends through a PRE-APPROVED generic
//             template, so it works with NO DLT registration of your own —
//             which is the only reason it is the default. Trade-off: the
//             message reads "Your OTP: 123456" from a shared header, with no
//             CropBid branding.
//   msg91     ~₹0.15-0.25 depending on volume. Better dashboard and delivery
//             reporting; its own default template also skips DLT, but the
//             branded path wants a registered template.
//   twilio    ~₹0.45/SMS to India, roughly 3x the local providers. Keep it
//             for non-Indian numbers, not as the Indian default.
//
// THE REAL COST IS NOT PER-MESSAGE. At a few thousand codes a month the
// difference between the cheapest and dearest Indian provider is tens of
// rupees. What actually costs is DLT registration (~₹5,900 one-time with
// TRAI, via any provider's portal), which you need for a branded sender ID
// and your own message text. Start unbranded on fast2sms, register DLT when
// the branding is worth the paperwork, then set the template id below.
//
// SMS IS NOT THE PRIMARY CHANNEL. Sign-in codes go over WhatsApp first (no
// DLT registration, cheaper per message) and fall back to email. This module
// is only reached when SMS_PROVIDER is set — see otpDelivery.service.ts for
// the chain and for the console fallback that keeps local sign-in working.
// =============================================================================

import { config } from '../config';

export function isSmsConfigured(): boolean {
  if (config.sms.provider === 'fast2sms') {
    return Boolean(config.sms.fast2smsApiKey);
  }
  if (config.sms.provider === 'msg91') {
    return Boolean(config.sms.msg91AuthKey && config.sms.msg91TemplateId);
  }
  if (config.sms.provider === 'twilio') {
    return Boolean(config.sms.twilioAccountSid && config.sms.twilioAuthToken && config.sms.twilioFrom);
  }
  return false;
}

async function sendViaFast2Sms(phone: string, code: string): Promise<void> {
  // Fast2SMS addresses Indian numbers as bare 10 digits — a leading +91 (or a
  // 0) is rejected rather than normalised, so strip the country code here.
  // Our stored form is E.164-ish ("+919876543210"), hence the last-10 slice.
  const digits = phone.replace(/[^0-9]/g, '');
  const local = digits.slice(-10);
  if (local.length !== 10) {
    throw new Error(`Fast2SMS only sends to Indian numbers; got "${phone}"`);
  }

  // Two routes, picked by whether a DLT template has been registered yet:
  //   otp — generic pre-approved template, no DLT needed, unbranded
  //   dlt — your own template + header, needs TRAI registration
  const useDlt = Boolean(config.sms.fast2smsDltTemplateId);
  const body = useDlt
    ? new URLSearchParams({
        route: 'dlt',
        sender_id: config.sms.senderId,
        message: config.sms.fast2smsDltTemplateId,
        variables_values: code,
        numbers: local,
      })
    : new URLSearchParams({
        route: 'otp',
        variables_values: code, // renders as "Your OTP: <code>"
        numbers: local,
      });

  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: config.sms.fast2smsApiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Fast2SMS responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  // Like MSG91, Fast2SMS answers 200 with {"return":false} for a rejected
  // send (bad key, empty wallet, unapproved template), so the status code
  // alone is not proof of delivery.
  const payload = (await res.json().catch(() => ({}))) as {
    return?: boolean; message?: string | string[];
  };
  if (payload.return === false) {
    const detail = Array.isArray(payload.message) ? payload.message.join('; ') : payload.message;
    throw new Error(`Fast2SMS rejected the send: ${detail || 'unknown error'}`);
  }
}

async function sendViaMsg91(phone: string, code: string): Promise<void> {
  // MSG91's OTP endpoint takes the code as a template variable — the message
  // body itself is the DLT-approved template registered with the operator.
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', config.sms.msg91TemplateId);
  url.searchParams.set('mobile', phone.replace(/[^0-9]/g, ''));
  url.searchParams.set('otp', code);
  url.searchParams.set('sender', config.sms.senderId);

  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey: config.sms.msg91AuthKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`MSG91 responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  // MSG91 returns HTTP 200 with {"type":"error"} for things like an unapproved
  // template, so the status code alone is not proof of delivery.
  if (body.type && body.type !== 'success') {
    throw new Error(`MSG91 rejected the send: ${body.message || 'unknown error'}`);
  }
}

async function sendViaTwilio(phone: string, code: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.sms.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${config.sms.twilioAccountSid}:${config.sms.twilioAuthToken}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phone,
      From: config.sms.twilioFrom,
      Body: `${code} is your CropBid sign-in code. It expires in 5 minutes.`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Twilio responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/**
 * Send a sign-in code. Throws when a configured provider fails — the caller
 * drops the challenge row so the person can retry cleanly rather than staring
 * at a code box with nothing to type.
 */
export async function sendPhoneOtp(phone: string, code: string, _ttlMinutes: number): Promise<void> {
  // Callers go through deliverOtp(), which checks isSmsConfigured() first and
  // owns both the console fallback for local development and the decision to
  // move on to the next channel. Reaching here unconfigured is a programming
  // error, not a runtime condition.
  if (!isSmsConfigured()) {
    throw new Error(
      'No SMS provider configured — set SMS_PROVIDER (fast2sms|msg91|twilio) and its keys',
    );
  }

  if (config.sms.provider === 'fast2sms') return sendViaFast2Sms(phone, code);
  if (config.sms.provider === 'msg91') return sendViaMsg91(phone, code);
  if (config.sms.provider === 'twilio') return sendViaTwilio(phone, code);
  throw new Error(`Unknown SMS_PROVIDER "${config.sms.provider}"`);
}
