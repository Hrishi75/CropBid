// =============================================================================
// WhatsApp Service — sign-in codes over the WhatsApp Cloud API
// =============================================================================
// The primary channel for one-time codes, for two reasons that both matter in
// India:
//
//   COST      ~₹0.115 per authentication message, against ₹0.25+ for an SMS
//             on a DLT route and ₹5 on an SMS route that skips DLT.
//   PAPERWORK Meta is the sender, so there is no TRAI DLT registration to do —
//             which is what otherwise blocks an unregistered business from
//             sending a single code.
//
// WHAT IT NEEDS: a Meta Business account, a WhatsApp Business number, and an
// APPROVED authentication template. Authentication templates are a fixed
// Meta-authored format ("<CODE> is your verification code") — you do not write
// the copy, you only choose the button and expiry options.
//
// THE LIMIT TO KNOW: until Meta Business Verification is complete, an account
// can only open conversations with 250 unique people per rolling 24 hours.
// Codes to people already in an open conversation do not count, but a launch
// day with 300 new shoppers would hit it. deliverOtp() falls through to email
// when a send fails, so a person is never simply stuck — but the cap is a
// business problem, not something the code can route around.
// =============================================================================

import { config } from '../config';

export function isWhatsAppConfigured(): boolean {
  return Boolean(config.whatsapp.phoneNumberId && config.whatsapp.accessToken);
}

/**
 * Send a one-time code as a WhatsApp authentication template.
 *
 * Throws on any non-2xx or on a Meta-level error, so the caller can fall
 * through to the next channel.
 */
export async function sendWhatsAppOtp(phone: string, code: string): Promise<void> {
  // Meta wants the number in international format WITHOUT a leading + or any
  // separators: "919876543210". Our stored form is "+91 98765-43210".
  const to = phone.replace(/[^0-9]/g, '');
  if (to.length < 10) {
    throw new Error(`WhatsApp needs a full international number; got "${phone}"`);
  }

  // Authentication templates take the code TWICE: once in the body, where it
  // renders as text, and once in the button, which is what the copy-code or
  // one-tap autofill button actually hands back to the app. Sending only the
  // body is rejected when the approved template has a button.
  const components: unknown[] = [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
  ];
  if (config.whatsapp.otpTemplateHasButton) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: code }],
    });
  }

  const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: config.whatsapp.otpTemplate,
        language: { code: config.whatsapp.otpTemplateLang },
        components,
      },
    }),
  });

  if (!res.ok) {
    // Meta's errors are worth surfacing verbatim — "template name does not
    // exist in the translation" and "re-engagement message" are the two you
    // will actually hit, and they need different fixes.
    const detail = await res.text().catch(() => '');
    throw new Error(`WhatsApp responded ${res.status}: ${detail.slice(0, 300)}`);
  }

  // A 200 with an `error` key is possible on partial failures.
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    messages?: Array<{ id?: string }>;
  };
  if (body.error) {
    throw new Error(`WhatsApp rejected the send: ${body.error.message || 'unknown error'}`);
  }
  if (!body.messages?.length) {
    throw new Error('WhatsApp accepted the request but queued no message');
  }
}
