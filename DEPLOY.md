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
   | `RUN_SEED` | **`true`** for this first deploy only |
   | `SMTP_HOST` | SMTP server for transactional email, e.g. `smtp.resend.com` (blank = emails print to server logs) |
   | `SMTP_PORT` | usually `587` (or `465` for implicit TLS) |
   | `SMTP_USER` / `SMTP_PASS` | SMTP credentials from your email provider |
   | `EMAIL_FROM` | e.g. `CropBid <no-reply@cropbid.in>` |

   > **Email:** password-reset links are emailed via SMTP. Any provider works
   > (Resend, Brevo, SES, Gmail app-password). With `SMTP_HOST` unset the app
   > still runs — reset emails are printed to the Render logs instead of sent.

3. Deploy. The build runs: install → `prisma generate` → `prisma migrate deploy`
   → seed (because `RUN_SEED=true`) → `tsc`.
   Watch the logs for "migrations applied" and the seed output.
4. **After the first successful deploy: set `RUN_SEED` back to `false`** and don't
   redeploy with it `true` again (seeding **wipes** all tables every run).
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
