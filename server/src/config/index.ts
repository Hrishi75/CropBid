// =============================================================================
// Centralized Configuration
// =============================================================================
// WHY THIS FILE EXISTS:
// Instead of scattering process.env.SOMETHING across 50 different files,
// we read ALL environment variables in ONE place. This gives us:
//   1. One file to audit for missing env vars
//   2. Type safety — config.port is a number, not string | undefined
//   3. Default values for development
//   4. Easy to spot if something is misconfigured
// =============================================================================

import dotenv from 'dotenv';

// Load .env file into process.env
// This must happen BEFORE we read any env vars
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

// In production, JWT secrets MUST be set via environment — never use defaults
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
  if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
    throw new Error('FATAL: JWT secrets must be at least 32 characters in production');
  }
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://cropbid:cropbid_dev@localhost:5432/cropbid',

  // Authentication
  jwtSecret,
  jwtRefreshSecret,

  // Session lifetimes.
  // The refresh token IS the inactivity window: it is rotated on every
  // /auth/refresh, so a session slides forward while the user keeps using the
  // app and dies `idleTimeoutMinutes` after their last request.
  // The access token must be comfortably SHORTER than the idle window — if the
  // two matched, an active user's access token and refresh token would expire
  // in the same instant and log them out mid-session. At 5 min an active user
  // refreshes (and re-arms the window) roughly three times per idle period.
  auth: {
    accessTokenMinutes: parseInt(process.env.ACCESS_TOKEN_MINUTES || '5', 10),
    idleTimeoutMinutes: parseInt(process.env.SESSION_IDLE_MINUTES || '15', 10),
  },

  // Google Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Sarvam AI — Indian-language speech-to-text (voice listing input) and
  // text translation (stored translations of listing/requirement descriptions).
  // Leave blank to run without it: the voice button never renders (the client
  // asks GET /api/voice/status first), and translations are simply never
  // written. Typed listings and the original descriptions are unaffected, and
  // any translation already stored keeps working — the columns are plain text,
  // not a live lookup. That is deliberate: the API is on trial credits, and
  // nothing built on top of it may become load-bearing.
  sarvamApiKey: process.env.SARVAM_API_KEY || '',

  // data.gov.in — daily mandi (Agmarknet) commodity prices. Defaults to the
  // public demo key data.gov.in ships for testing, so live rates work out of
  // the box; set your own key for higher rate limits. Blank/unreachable → the
  // rates service falls back to static reference prices (board never empty).
  dataGov: {
    apiKey: process.env.DATA_GOV_API_KEY || '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b',
    // True when we fell back to that shared demo key. The rates service warns
    // on it, because its quota is exhausted for most of the day and the whole
    // rates board then silently degrades to static reference prices.
    usingDemoKey: !process.env.DATA_GOV_API_KEY,
    // Resource id for "Current Daily Price of Various Commodities from Markets (Mandi)"
    resourceId: process.env.DATA_GOV_MANDI_RESOURCE || '9ef84268-d588-465a-a308-a864a43d0070',
  },

  // Razorpay (capture-only payments). In dev use TEST keys (rzp_test_...).
  // Leave blank to run with payments disabled — the API returns 503 on pay attempts.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  // Cloudinary (persistent image hosting). Format:
  //   cloudinary://<api_key>:<api_secret>@<cloud_name>   (from the Cloudinary dashboard)
  // Leave blank to store uploads on the local filesystem instead — fine for
  // dev, but on Render's free tier the disk is wiped every deploy/restart.
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',

  // Client URL (for CORS + links inside transactional emails)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // SMS (phone sign-in codes). Provider-agnostic: set SMS_PROVIDER to
  // "msg91" or "twilio" and fill that provider's keys. Leave it unset in
  // development — codes are printed to the server console instead of sent, so
  // the whole sign-in flow is testable without a provider or a real handset.
  // WhatsApp Cloud API — the primary channel for sign-in codes.
  // Cheaper per message than SMS and needs no TRAI DLT registration, since
  // Meta is the sender. Requires a Meta Business account with a WhatsApp
  // Business number and an APPROVED authentication template.
  //
  // NOTE ON LIMITS: an unverified Meta business can only open conversations
  // with 250 unique people per rolling 24h. That is fine for a pilot and not
  // for a consumer launch — Meta Business Verification lifts it.
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    // The approved authentication template, and the language it was approved
    // in. A mismatch here is rejected by Meta with a template-not-found error.
    otpTemplate: process.env.WHATSAPP_OTP_TEMPLATE || 'cropbid_otp',
    otpTemplateLang: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en',
    // Authentication templates normally carry a copy-code / autofill button,
    // which has to be echoed in the send call. Set to 'false' if the approved
    // template has no button, or Meta rejects the message.
    otpTemplateHasButton: (process.env.WHATSAPP_OTP_TEMPLATE_BUTTON || 'true') !== 'false',
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
  },

  sms: {
    // '' | 'fast2sms' | 'msg91' | 'twilio'. See services/sms.service.ts for
    // what each one costs and which to pick.
    provider: (process.env.SMS_PROVIDER || '').toLowerCase(),
    senderId: process.env.SMS_SENDER_ID || 'CROPBD',

    // Fast2SMS (India) — the cheapest way to start, and the only one that
    // needs no DLT paperwork on day one. Just an API key.
    // FAST2SMS_DLT_TEMPLATE_ID + SMS_SENDER_ID are optional: set them once you
    // have your own DLT header approved and the sends switch to branded.
    fast2smsApiKey: process.env.FAST2SMS_API_KEY || '',
    fast2smsDltTemplateId: process.env.FAST2SMS_DLT_TEMPLATE_ID || '',

    // MSG91 (India): an auth key and an approved DLT template id.
    msg91AuthKey: process.env.MSG91_AUTH_KEY || '',
    msg91TemplateId: process.env.MSG91_TEMPLATE_ID || '',

    // Twilio: account SID, auth token, and the sending number in E.164.
    // Roughly 3x the Indian providers per message — worth it only for
    // non-Indian numbers.
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFrom: process.env.TWILIO_FROM || '',
  },

  // SMTP (transactional email — password resets etc.).
  // Leave SMTP_HOST unset in development: emails are printed to the server
  // console instead of sent, so the flow is fully testable without a provider.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'CropBid <no-reply@cropbid.in>',
  },

  // Ops inbox that gets one email per order placed, whichever way it came in
  // (consumer buy, accepted bid, agent deal, auction win, requirement fill).
  orderAlertEmail: process.env.ORDER_ALERT_EMAIL || 'info@cropbid.in',

  // Defaults
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
  defaultLocale: process.env.DEFAULT_LOCALE || 'en-IN',
};
