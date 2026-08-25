// =============================================================================
// OTP Delivery — getting a sign-in code to a person, whichever way works
// =============================================================================
// Sign-in is a phone number and a 6-digit code, so DELIVERY IS THE WHOLE LOGIN.
// If the code does not arrive, the account is unreachable — there is no
// password to fall back on. That is why this is a chain rather than a single
// provider call:
//
//   1. WhatsApp   primary. ~₹0.115/message, no TRAI DLT registration needed
//                 (Meta is the sender), and it is where this audience already
//                 is. See whatsapp.service.ts for the 250/day unverified cap.
//   2. SMS        only if a provider is configured. Reaches people with no
//                 WhatsApp, but needs DLT registration to be affordable.
//   3. Email      last resort, over the existing SMTP transport (Brevo). Needs
//                 an address, which we either hold on the account or ask for.
//
// WHY NOT JUST FAIL WHEN WHATSAPP FAILS? Because the failures are ordinary and
// self-inflicted: the number has no WhatsApp, the 250/day cap is hit, Meta has
// a wobble. Any of those would otherwise mean "you cannot log in today", with
// nothing the person could do about it.
//
// The caller is told which channel actually worked so the screen can say
// "check WhatsApp" or "check your email" truthfully — telling someone to check
// WhatsApp for a code that went to their inbox is its own kind of lockout.
// =============================================================================

import { config } from '../config';
import { sendSignInOtpEmail } from './email.service';
import { sendPhoneOtp as sendSmsOtp, isSmsConfigured } from './sms.service';
import { isWhatsAppConfigured, sendWhatsAppOtp } from './whatsapp.service';

export type OtpChannel = 'whatsapp' | 'sms' | 'email' | 'console';

export interface OtpDeliveryInput {
  phone: string;
  code: string;
  ttlMinutes: number;
  /** Address for the email fallback: the account's, or one just typed in. */
  email?: string | null;
  name?: string | null;
}

export interface OtpDeliveryResult {
  channel: OtpChannel;
  /** Where it went, already masked — safe to show on screen. */
  sentTo: string;
}

/**
 * Thrown when every channel we could try has failed.
 *
 * `needsEmail` distinguishes the one case the UI can actually fix: the phone
 * channels did not work and we had no address to fall back to. The client
 * turns that into "give us an email and we'll send it there" rather than a
 * dead end.
 */
export class OtpDeliveryError extends Error {
  readonly needsEmail: boolean;

  constructor(message: string, needsEmail: boolean) {
    super(message);
    this.name = 'OtpDeliveryError';
    this.needsEmail = needsEmail;
  }
}

/** "+919876543210" → "•••••43210" — enough to recognise, not enough to leak. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return `•••••${digits.slice(-5)}`;
}

/** "asha@farm.in" → "a•••@farm.in" */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}•••@${domain}`;
}

export async function deliverOtp(input: OtpDeliveryInput): Promise<OtpDeliveryResult> {
  const { phone, code, ttlMinutes, email, name } = input;

  // Every channel failure is collected rather than thrown, so that a WhatsApp
  // outage does not hide the fact that email also failed. Only the last line
  // of this function decides the request has failed.
  const failures: string[] = [];

  // --- 1. WhatsApp ---
  if (isWhatsAppConfigured()) {
    try {
      await sendWhatsAppOtp(phone, code);
      return { channel: 'whatsapp', sentTo: maskPhone(phone) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`whatsapp: ${reason}`);
      console.warn('[otp] WhatsApp delivery failed, trying next channel', reason);
    }
  }

  // --- 2. SMS ---
  if (isSmsConfigured()) {
    try {
      await sendSmsOtp(phone, code, ttlMinutes);
      return { channel: 'sms', sentTo: maskPhone(phone) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`sms: ${reason}`);
      console.warn('[otp] SMS delivery failed, trying next channel', reason);
    }
  }

  // --- 3. Email ---
  if (email) {
    try {
      await sendSignInOtpEmail(email, name ?? null, code, ttlMinutes);
      return { channel: 'email', sentTo: maskEmail(email) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`email: ${reason}`);
      console.warn('[otp] Email delivery failed', reason);
    }
  }

  // --- Development: no channel configured at all ---
  // Phone sign-in is the ONLY way into an account, so without this nobody
  // could log into a local or preview environment. Gated on nothing being
  // configured, and never reached in production (below).
  const nothingConfigured = !isWhatsAppConfigured() && !isSmsConfigured() && !email;
  if (nothingConfigured && config.nodeEnv !== 'production') {
    console.log(
      `\n📱 [otp:dev] Sign-in code for ${phone}: ${code}  (expires in ${ttlMinutes} min)\n`,
    );
    return { channel: 'console', sentTo: maskPhone(phone) };
  }

  // Everything we could try has failed. If we never had an address, the client
  // can still rescue this by asking for one.
  if (!email) {
    throw new OtpDeliveryError(
      "We couldn't reach that number on WhatsApp. Add an email and we'll send your code there.",
      true,
    );
  }

  throw new OtpDeliveryError(
    `Could not send your code just now. Please try again in a moment. (${failures.join(' | ')})`,
    false,
  );
}
