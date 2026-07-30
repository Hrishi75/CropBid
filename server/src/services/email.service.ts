// =============================================================================
// Email Service — Transactional email with a dev-friendly fallback
// =============================================================================
// WHY A FALLBACK?
// Password reset MUST work in every environment, but developers shouldn't need
// an SMTP account to test it. So:
//   - SMTP_HOST set     → send real email via nodemailer
//   - SMTP_HOST not set → print the full email to the server console
//     (the reset link is clickable straight from the terminal)
//
// The transporter is created lazily and cached so the SMTP connection pool is
// shared across sends. All senders here throw on failure — callers decide
// whether a failed send should fail the request (password reset swallows it
// at the controller so the response stays enumeration-safe; the failure is
// still logged server-side).
// =============================================================================

import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

let cachedTransporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(config.smtp.host);
}

function getTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      // Port 465 is implicit TLS; 587/25 upgrade via STARTTLS.
      secure: config.smtp.port === 465,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return cachedTransporter;
}

export interface EmailInput {
  to: string;
  subject: string;
  text: string;   // Plain-text body — always provided (spam filters like it)
  html?: string;  // Optional rich body
}

export async function sendEmail(input: EmailInput): Promise<void> {
  if (!isSmtpConfigured()) {
    // Development fallback — make the email impossible to miss in the console.
    console.log(
      [
        '',
        '========================== EMAIL (dev fallback) ==========================',
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        '---------------------------------------------------------------------------',
        input.text,
        '===========================================================================',
        '',
      ].join('\n'),
    );
    return;
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const subject = 'Reset your CropBid password';
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your CropBid password.',
    'Open the link below to choose a new one. The link expires in 1 hour and works once.',
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password stays unchanged.",
    '',
    '— CropBid',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #1e2a1e;">
      <h2 style="color: #2f6b3a;">Reset your CropBid password</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received a request to reset your CropBid password. Click the button below to choose a new one.
         The link expires in <strong>1 hour</strong> and works once.</p>
      <p style="margin: 28px 0;">
        <a href="${escapeHtml(resetUrl)}"
           style="background: #2f6b3a; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Choose a new password
        </a>
      </p>
      <p style="font-size: 13px; color: #5a6b5a;">If the button doesn't work, paste this link into your browser:<br/>
        <a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
      <p style="font-size: 13px; color: #5a6b5a;">If you didn't request this, ignore this email — your password stays unchanged.</p>
      <p>— CropBid</p>
    </div>`;

  await sendEmail({ to, subject, text, html });
}

// ---------------------------------------------------------------------------
// Buyer signup verification code
// ---------------------------------------------------------------------------
// Unlike the password reset above, this one must NOT be swallowed by its
// caller: if the code never leaves the building the buyer has nothing to type,
// so startBuyerSignup lets the throw propagate and drops the pending row.
export async function sendSignupOtpEmail(
  to: string,
  name: string,
  code: string,
  ttlMinutes: number,
): Promise<void> {
  const subject = `${code} is your CropBid verification code`;
  const text = [
    `Hi ${name},`,
    '',
    'Use this code to finish creating your CropBid buyer account:',
    '',
    code,
    '',
    `The code expires in ${ttlMinutes} minutes and works once.`,
    '',
    "If you didn't try to sign up, ignore this email — no account has been created.",
    '',
    '— CropBid',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #1e2a1e;">
      <h2 style="color: #2f6b3a;">Verify your email</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Use this code to finish creating your CropBid buyer account:</p>
      <p style="margin: 28px 0;">
        <span style="display: inline-block; background: #f2f7f2; border: 1px solid #cfe0cf; color: #2f6b3a;
                     font-size: 30px; font-weight: 700; letter-spacing: 8px; padding: 14px 26px; border-radius: 8px;">
          ${escapeHtml(code)}
        </span>
      </p>
      <p style="font-size: 13px; color: #5a6b5a;">The code expires in <strong>${ttlMinutes} minutes</strong> and works once.</p>
      <p style="font-size: 13px; color: #5a6b5a;">If you didn't try to sign up, ignore this email — no account has been created.</p>
      <p>— CropBid</p>
    </div>`;

  await sendEmail({ to, subject, text, html });
}

// Minimal HTML escaping for user-supplied values interpolated into email HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
