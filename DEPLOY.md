# 🚀 Deploying CropBid (Neon + Render + Cloudflare)

Production demo stack — all free tier:

| Layer | Host | Notes |
|-------|------|-------|
| Database | **Neon** | Serverless Postgres. Works with the `pg` driver adapter unchanged. |
| Backend | **Render** | Express + Socket.io. Needs a persistent process (not serverless) for WebSockets + in-memory auctions. |
| Frontend | **Cloudflare Workers** | Static Vite build, served as static assets (`client/wrangler.jsonc`). |

> ⚠️ **Render free tier sleeps after ~15 min idle** → first request cold-starts in ~50s.
> For a live demo, hit the URL ~2 min early to warm it, or upgrade to the $7/mo instance.

---

## 0. Prerequisites

- A **Neon** project → copy two connection strings from the Neon dashboard:
  - **Pooled** (host contains `-pooler`) → used as `DATABASE_URL`
  - **Direct / unpooled** (same host *without* `-pooler`) → used as `DIRECT_URL`
- A **Gemini API key** (optional, only for AI negotiation): https://aistudio.google.com/app/apikey
- Two strong JWT secrets:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
  Run twice → one for `JWT_SECRET`, one for `JWT_REFRESH_SECRET`.

---

## 1. Backend → Render

1. Render Dashboard → **New → Blueprint** → connect the `Hrishi75/CropBid` repo.
   Render reads [`render.yaml`](render.yaml) and creates the `cropbid-api` service.
2. When prompted, fill the secret env vars:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Neon **pooled** url (`...-pooler...neon.tech/...?sslmode=require`) |
   | `DIRECT_URL` | Neon **unpooled** url (same, drop `-pooler`) |
   | `JWT_SECRET` | first generated secret |
   | `JWT_REFRESH_SECRET` | second generated secret |
   | `GEMINI_API_KEY` | Gemini key (or leave blank) |
   | `CLOUDINARY_URL` | `cloudinary://<key>:<secret>@<cloud_name>` from the [Cloudinary dashboard](https://console.cloudinary.com) (blank = uploads stored on Render's ephemeral disk and lost on redeploy) |
   | `CLIENT_URL` | leave as a placeholder for now (set in step 3) |
   | `SMTP_HOST` | SMTP server for transactional email, e.g. `smtp.resend.com` (blank = emails print to server logs) |
   | `SMTP_PORT` | usually `587` (or `465` for implicit TLS) |
   | `SMTP_USER` / `SMTP_PASS` | SMTP credentials from your email provider |
   | `EMAIL_FROM` | e.g. `CropBid <no-reply@cropbid.in>` |
   | `WHATSAPP_PHONE_NUMBER_ID` | From your WhatsApp Business number in Meta Business Manager |
   | `WHATSAPP_ACCESS_TOKEN` | A permanent system-user token with `whatsapp_business_messaging` |
   | `WHATSAPP_OTP_TEMPLATE` | Name of your APPROVED authentication template (default `cropbid_otp`) |

   > **Sign-in codes — required, or nobody can sign in.** Signing in is a phone
   > number and a 6-digit code; there is no password. Delivery is tried in
   > order: **WhatsApp → SMS (if configured) → email**. With none of them
   > available the server **refuses to mint a code in production** rather than
   > pretending it sent one (dev prints the code to the logs, so local work is
   > unaffected).
   >
   > **WhatsApp is the primary channel** because it needs no TRAI DLT
   > registration — Meta is the sender — and runs ~₹0.115 a message against
   > ₹0.25+ for DLT SMS. You need a Meta Business account, a WhatsApp Business
   > number, and an approved **authentication template** (Meta writes the copy;
   > you pick the button and expiry).
   >
   > ⚠️ **The 250/day cap.** Until Meta Business Verification is complete, an
   > account can only open conversations with **250 unique people per rolling
   > 24 hours**. Fine for a pilot, not for a consumer launch. Verification
   > needs a business document — a free **Udyam (MSME) certificate** (Aadhaar +
   > PAN, ~10 minutes online) satisfies it, and also unlocks DLT if you later
   > want branded SMS.
   >
   > **Email is the fallback**, over the same SMTP transport as everything else.
   > If WhatsApp can't reach a number the code goes to the address on the
   > account; if there is none, the API answers `NEEDS_EMAIL` and the sign-in
   > window asks for one. So `SMTP_HOST` is not optional in practice — without
   > it, anyone WhatsApp can't reach is locked out.
   >
   > **SMS is optional** and off unless `SMS_PROVIDER` is set: `fast2sms`
   > (₹0.25/SMS, but the cheap tiers need DLT), `msg91`, or `twilio` (~₹0.45 to
   > India, ~3× the local providers — for non-Indian numbers). See
   > `server/src/services/otpDelivery.service.ts` for the chain.
   > **Prices checked Aug 2026 — re-check before committing spend.**

   > **Email:** password-reset links, buyer signup codes and the new-order ops
   > alert are emailed via SMTP. Any provider works (Resend, Brevo, SES, Gmail
   > app-password). With `SMTP_HOST` unset the app still runs — those emails are
   > printed to the server logs instead of sent, so **the order alerts only reach
   > an inbox once SMTP is configured.**

   Optional, both with sensible defaults:

   | Key | Default | Value |
   |-----|---------|-------|
   | `DATA_GOV_API_KEY` | *(shared demo key)* | Your own [data.gov.in](https://data.gov.in/user/register) key for the daily Agmarknet mandi feed. **Set this.** The built-in default is data.gov.in's public demo key, shared by every project that never registered one — it spends most of the day returning `429 Rate limit exceeded`, and the storefront then falls back to static reference prices, so the hero chips and the ticker show `ref` instead of today's real move. A registered key is free and instant. |
   | `ORDER_ALERT_EMAIL` | `info@cropbid.in` | Inbox that gets one email per order placed — consumer buy, accepted bid, agent deal, auction win or requirement fill. Needs `SMTP_HOST` set, or the alert only reaches the server logs. |
   | `SMS_PROVIDER` | *(none)* | `fast2sms` \| `msg91` \| `twilio`. Leave unset to run WhatsApp + email only. SMS is worth adding once you have DLT, since it reaches people with no WhatsApp. |
   | `WHATSAPP_OTP_TEMPLATE_LANG` | `en` | Language your authentication template was approved in. A mismatch is rejected by Meta as "template not found". |
   | `WHATSAPP_OTP_TEMPLATE_BUTTON` | `true` | Whether the template carries a copy-code/autofill button. Set `false` if yours has none, or Meta rejects the send. |
   | `WHATSAPP_GRAPH_VERSION` | `v21.0` | Graph API version. |
   | `FAST2SMS_API_KEY` | *(none)* | Only needed when `SMS_PROVIDER=fast2sms`. |
   | `FAST2SMS_DLT_TEMPLATE_ID` | *(none)* | Your approved DLT template id. Leave blank to send on Fast2SMS's shared, unbranded OTP route; set it (with `SMS_SENDER_ID`) once TRAI DLT registration is done and codes arrive branded. |
   | `SMS_SENDER_ID` | `CROPBD` | The 6-character DLT header codes are sent from. Only used once `FAST2SMS_DLT_TEMPLATE_ID` (or MSG91) is configured — the no-DLT route ignores it. |
   | `SESSION_IDLE_MINUTES` | `15` | How long a session survives with no activity. The refresh token is rotated on every request, so this is a *sliding* window — active users are never interrupted. Changing it here also changes the copy on the sign-in screen (the client reads its own copy of the number from `client/src/lib/idle.ts` — keep the two in sync). |
   | `ACCESS_TOKEN_MINUTES` | `5` | Access-token lifetime. Must stay comfortably **below** `SESSION_IDLE_MINUTES`, or an active user's two tokens expire together and the session ends at the idle timeout no matter what they're doing. |

3. Deploy. The build runs: install → `prisma generate` → `prisma migrate deploy` → `tsc`.
   Watch the logs for "migrations applied".
4. Seeding is **not** part of the deploy — it wipes every table. To load demo
   data into a fresh database, run `npx prisma db seed` manually (in production
   it refuses unless `SEED_FORCE=true` is set — a guard against wiping live data).
5. Note the service URL, e.g. `https://cropbid-api.onrender.com`.
   Verify: open `https://cropbid-api.onrender.com/api/health` → `{"status":"ok",...}`.

---

## 2. Frontend → Cloudflare Workers

The site is `client/dist` served as Worker static assets. `client/wrangler.jsonc`
holds the routing (`/faq` served from `faq/index.html`, a browser navigating to
any other path gets the app shell), `client/worker.js` answers only requests no
file matched (a 404 for `/assets/*` and `/api/*`, the app shell otherwise), and
`client/public/_headers` holds the cache headers.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**
   → connect GitHub → pick `Hrishi75/CropBid`.
2. Build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Path / root directory:** `client` (the repo is a monorepo)
3. Under **Build variables** (not runtime Variables: Vite reads these while
   building and inlines them into the bundle):

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | your API's origin plus `/api`, e.g. `https://cropbid-api.onrender.com/api` from step 1 (production: `https://api.cropbid.in/api`) |
   | `VITE_SOCKET_URL` | the same origin with no path (production: `https://api.cropbid.in`) |
   | `VITE_GOOGLE_CLIENT_ID` | the OAuth web client id (optional; blank hides the Google button). The API needs the same value as `GOOGLE_CLIENT_ID` |
   | `VITE_CF_ANALYTICS_TOKEN` | the Web Analytics token for cropbid.in (Cloudflare → Web Analytics → Manage site). Blank means no page views are counted |
   | `NODE_VERSION` | `22` |

   None of these is a secret: every `VITE_` value ends up in the code every
   visitor downloads. Never give a secret a `VITE_` name.
4. Deploy → test on the `*.workers.dev` URL. Signing in fails there by design:
   the API's CORS allows `CLIENT_URL` exactly.
5. Worker → **Domains** → **Add Domain** → `cropbid.in` (the zone must be on
   Cloudflare DNS, and any old A/CNAME for the apex deleted first). The Worker's
   name must match `name` in `client/wrangler.jsonc`, or the build fails with
   "Failed to bind worker".
6. `www` is **not** a Worker domain, because `CLIENT_URL` is the apex and `www`
   only ever forwards:
   - DNS → add a **CNAME** `www` → `cropbid.in`, **Proxied** (orange).
   - Rules → Redirect Rule → Wildcard pattern: request URL
     `https://www.cropbid.in/*`, target `https://cropbid.in/${1}`, **301**,
     Preserve query string.
   - SSL/TLS → Edge Certificates → **Always Use HTTPS: On**. The rule only matches
     `https`; without this, `http://www.cropbid.in` returns a 522.
7. Leave `api.cropbid.in` **DNS only** (grey cloud): Caddy on the box gets its own
   certificate and the auction socket is long-lived. Email records (Zoho MX,
   DKIM, Brevo) are DNS only too.

Page views are counted by Cloudflare Web Analytics (`components/ui/PageAnalytics.tsx`),
which reports only from `cropbid.in` in a production build.

## 3. Close the loop (CORS / cookies)

1. Back in Render → set `CLIENT_URL` = the site's exact origin (`https://cropbid.in`,
   **no trailing slash**) → save (triggers a redeploy).

   Why: CORS uses an exact origin (can't be `*` with credentials), and the refresh
   cookie is cross-site (`SameSite=None; Secure`) — it only flows to/from this origin.
2. If the site's domain ever changes, update `CLIENT_URL` to match.

---

## 4. Smoke test the live demo

- Open https://cropbid.in.
- Log in with a seeded account (password `password123`):
  - Farmer: `rajesh@cropbid.test`
  - Buyer:  `vikram@cropbid.test`
  - Admin:  `admin@cropbid.test`
- Check: login persists across refresh (refresh-token cookie works), browse listings,
  place a bid, open an auction (WebSocket).

---

## Known demo limitations

- **Uploads without Cloudinary are ephemeral** — with `CLOUDINARY_URL` unset,
  images go to Render's free filesystem, which resets on redeploy. Set
  `CLOUDINARY_URL` (free tier is plenty) and uploads persist on a CDN instead.
- **Cold starts** — see the free-tier note at the top.
- **Local dev** currently can't reach Neon on this machine (router DNS refuses
  `*.aws.neon.tech`). Production hosts resolve it fine. To dev locally, either set
  the machine's DNS to `1.1.1.1`/`8.8.8.8`, or run a local Postgres via `docker compose up -d`
  and point `DATABASE_URL` at `localhost:5432`.

> _Deployed API: `https://cropbid-api-oyfv.onrender.com` · Web: `https://cropbid.in`
> (canonical origin: `www.` 301-redirects to the apex; `CLIENT_URL` must be the apex)_

<!-- deploy marker: order-details (PR #70) — re-trigger after missed webhook -->
