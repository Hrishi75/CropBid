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

// ---------------------------------------------------------------------------
// New order alert (ops inbox)
// ---------------------------------------------------------------------------
// Sent to the platform, NOT to either party — it's the "an order just came in"
// ping, so it carries both sides' contact details and the money breakdown that
// the buyer- and farmer-facing emails deliberately never mix in one place.
export interface NewOrderEmail {
  reference: string;      // Short human-quotable order ref
  channel: string;        // How the order came in, already in plain English
  placedAt: Date;
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalAmount: number;
  platformFeeAmount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  deliveryAddress: string | null;
  farmerName: string;
  farmerPhone: string | null;
  farmerLocation: string | null;
  adminUrl: string;
}

export async function sendNewOrderEmail(to: string, order: NewOrderEmail): Promise<void> {
  const qty = `${formatNumber(order.quantity)} ${order.unit}`;
  const total = formatMoney(order.totalAmount, order.currency);
  const crop = order.cropVariety ? `${order.cropName} (${order.cropVariety})` : order.cropName;

  const subject = `New order · ${total} · ${qty} ${order.cropName} · #${order.reference}`;

  // Ordered pairs, rendered once as text lines and once as HTML rows.
  const rows: Array<[string, string]> = [
    ['Order', `#${order.reference}`],
    ['Placed', order.placedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'],
    ['Channel', order.channel],
    ['Crop', crop],
    ['Quantity', qty],
    ['Rate', `${formatMoney(order.pricePerUnit, order.currency)} / ${order.unit}`],
    ['Order value', total],
    ['Platform fee', formatMoney(order.platformFeeAmount, order.currency)],
    ['Buyer', order.buyerName],
    ['Buyer email', order.buyerEmail],
    ['Buyer phone', order.buyerPhone || '—'],
    ['Deliver to', order.deliveryAddress || '—'],
    ['Farmer', order.farmerName],
    ['Farmer phone', order.farmerPhone || '—'],
    ['Farmer location', order.farmerLocation || '—'],
  ];

  const text = [
    `A new order was placed on CropBid.`,
    '',
    ...rows.map(([label, value]) => `${label.padEnd(16)} ${value}`),
    '',
    `Open it: ${order.adminUrl}`,
    '',
    '— CropBid',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1e2a1e;">
      <h2 style="color: #2f6b3a; margin-bottom: 4px;">New order — ${escapeHtml(total)}</h2>
      <p style="margin-top: 0; color: #5a6b5a;">${escapeHtml(qty)} of ${escapeHtml(crop)} · ${escapeHtml(order.channel)}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 20px 0;">
        ${rows
          .map(
            ([label, value]) => `
        <tr>
          <td style="padding: 7px 12px 7px 0; color: #5a6b5a; white-space: nowrap; border-bottom: 1px solid #eef2ee;">${escapeHtml(label)}</td>
          <td style="padding: 7px 0; border-bottom: 1px solid #eef2ee;"><strong>${escapeHtml(value)}</strong></td>
        </tr>`,
          )
          .join('')}
      </table>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(order.adminUrl)}"
           style="background: #2f6b3a; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Open in admin
        </a>
      </p>
      <p>— CropBid</p>
    </div>`;

  await sendEmail({ to, subject, text, html });
}

// Indian grouping for INR (₹1,25,000), Western grouping for everything else.
// Falls back to a plain "INR 125000.00" if the runtime lacks the locale data.
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

// ---------------------------------------------------------------------------
// Partner application decision
// ---------------------------------------------------------------------------
// Sent when an admin moves an application to a state the applicant must act
// on or know about (approved / needs info / rejected / suspended). Deliberate
// fire-and-forget at the call site: the review action must never fail because
// SMTP is down — the in-app notification is the reliable channel.
export interface PartnerStatusEmail {
  name: string;
  status: 'APPROVED' | 'NEEDS_INFO' | 'REJECTED' | 'SUSPENDED';
  note?: string;
}

const PARTNER_EMAIL_COPY: Record<PartnerStatusEmail['status'], { subject: string; lead: string; cta: string }> = {
  APPROVED: {
    subject: 'You are live on CropBid 🎉',
    lead: 'Your partner application has been approved. Your dashboard is unlocked — you can start right away.',
    cta: 'Open your dashboard',
  },
  NEEDS_INFO: {
    subject: 'Your CropBid application needs one more thing',
    lead: 'A reviewer looked at your application and needs a little more from you before it can be approved.',
    cta: 'Update your application',
  },
  REJECTED: {
    subject: 'About your CropBid application',
    lead: 'After review, we were not able to approve your application this time. You can edit and resubmit it.',
    cta: 'Review your application',
  },
  SUSPENDED: {
    subject: 'Your CropBid partner account is suspended',
    lead: 'An administrator has suspended your partner account. Reply to this email if you believe this is a mistake.',
    cta: 'See details',
  },
};

export async function sendPartnerStatusEmail(to: string, input: PartnerStatusEmail): Promise<void> {
  const copy = PARTNER_EMAIL_COPY[input.status];
  const statusUrl = `${config.clientUrl}/partner/status`;

  const text = [
    `Hi ${input.name},`,
    '',
    copy.lead,
    ...(input.note ? ['', `Reviewer's note: ${input.note}`] : []),
    '',
    statusUrl,
    '',
    '— CropBid',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #1e2a1e;">
      <h2 style="color: #2f6b3a;">${escapeHtml(copy.subject)}</h2>
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>${escapeHtml(copy.lead)}</p>
      ${input.note ? `<p style="border-left: 3px solid #2f6b3a; padding: 8px 14px; background: #f2f6f0; color: #3d4b3d;">${escapeHtml(input.note)}</p>` : ''}
      <p style="margin: 28px 0;">
        <a href="${escapeHtml(statusUrl)}"
           style="background: #2f6b3a; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          ${escapeHtml(copy.cta)}
        </a>
      </p>
      <p>— CropBid</p>
    </div>`;

  await sendEmail({ to, subject: copy.subject, text, html });
}
