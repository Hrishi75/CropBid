# 🚀 Deploying CropBid (Neon + Render + Vercel)

Production demo stack — all free tier:

| Layer | Host | Notes |
|-------|------|-------|
| Database | **Neon** | Serverless Postgres. Works with the `pg` driver adapter unchanged. |
| Backend | **Render** | Express + Socket.io. Needs a persistent process (not serverless) for WebSockets + in-memory auctions. |
| Frontend | **Vercel** | Static Vite build. |

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
   | `SMS_PROVIDER` | `fast2sms` (see the SMS note below) |
   | `FAST2SMS_API_KEY` | API key from the [Fast2SMS dashboard](https://www.fast2sms.com) |

   > **SMS — required, or nobody can sign in.** Signing in is a phone number and
   > a 6-digit code; there is no password. With `SMS_PROVIDER` unset the server
   > **refuses to mint a code in production**, which locks every account out
   > (dev prints the code to the logs instead, so local work is unaffected).
   >
   > Start on **Fast2SMS**: ₹100 minimum top-up, ₹0.25/SMS falling to ₹0.11 at
   > volume, and its `otp` route uses a pre-approved generic template so it
   > works with **no DLT registration of your own on day one**. The trade-off is
   > that the message arrives unbranded — "Your OTP: 123456" from a shared
   > header, not from CROPBD.
   >
   > To brand it you need a TRAI **DLT registration** (~₹5,900 one-time, done
   > once and honoured by Jio/Airtel/Vi/BSNL alike), then a registered header
   > and template. Set `FAST2SMS_DLT_TEMPLATE_ID` and `SMS_SENDER_ID` and the
   > adapter switches routes on its own — no code change.
   >
   > `msg91` (~₹0.15–0.25) and `twilio` (~₹0.45 to India, ~3× the local
   > providers — use it only for non-Indian numbers) are also supported; see
   > `server/src/services/sms.service.ts`. **Prices checked Aug 2026 — re-check
   > before committing spend.**

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

## 2. Frontend → Vercel

1. Vercel → **Add New → Project** → import `Hrishi75/CropBid`.
2. **Root Directory: `client`** (important — repo is a monorepo).
   Framework preset: **Vite**. Build command / output (`dist`) are auto-detected.
3. Add Environment Variables (Production):

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://cropbid-api.onrender.com/api` |
   | `VITE_SOCKET_URL` | `https://cropbid-api.onrender.com` |

   > Vite inlines these at **build time** — they must be set before/at deploy.
4. Deploy → note the URL, e.g. `https://cropbid.vercel.app`.

---

## 3. Close the loop (CORS / cookies)

1. Back in Render → set `CLIENT_URL` = exact Vercel URL (e.g. `https://cropbid.vercel.app`,
   **no trailing slash**) → save (triggers a redeploy).

   Why: CORS uses an exact origin (can't be `*` with credentials), and the refresh
   cookie is cross-site (`SameSite=None; Secure`) — it only flows to/from this origin.
2. If you later add a custom domain on Vercel, update `CLIENT_URL` to match.

---

## 4. Smoke test the live demo

- Open the Vercel URL.
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
> (canonical origin — `www.` 308-redirects to the apex; `CLIENT_URL` must be the apex)_

<!-- deploy marker: order-details (PR #70) — re-trigger after missed webhook -->
