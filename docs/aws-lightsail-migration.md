# CropBid API → AWS Lightsail migration runbook

Move **only** the API server (currently Render free tier) to an AWS Lightsail
instance. Client stays on Vercel, DB stays on Neon. This is a contingency /
"when we pull the trigger" runbook.

## Why move at all
The driver is the **50-second cold start**. Render's free tier sleeps after ~15
min idle, so the first request after a quiet spell hangs long enough that a
demo looks broken. Everything else here is a bonus.

Render free ALSO blocks outbound SMTP ports 25/465/587 (since Sept 2025), which
is why email never worked there. That is fixed separately by using Brevo's HTTP
API instead of SMTP — see "Email" below. **Do not migrate in order to fix
email**; the API change fixes it for free and works on either host.

## Why Lightsail
- Flat price. Real Linux box → Socket.io (WebSockets) and native `sharp` just work.
- Free HTTPS via Caddy (auto Let's Encrypt).
- No cold start — the process just stays up.
- Trade-off: you manage the box (patching, deploys, and being the thing that
  notices when it dies).

### Credit runway — be honest about the number
$200 of AWS credits, against the Lightsail plan you pick:

| Plan | Monthly | $200 lasts |
|------|---------|------------|
| 1 GB / 2 vCPU + swap (**recommended**) | ~$7 | ~28 months |
| 2 GB / 2 vCPU | ~$12 | ~16 months |

(Verify current Lightsail pricing before committing — these move.)

**There is no long-run saving.** After credits expire, Lightsail (~$7/mo) costs
about the same as Render's Starter plan (~$7/mo), which would also have killed
the cold start with zero migration work. What you are buying with this migration
is ~2 years of free hosting plus full control, in exchange for permanently
owning ops. Go in knowing that; it is a fair trade, not an obvious win.

## Facts this plan is built on
- App: Express 5 + Socket.io + Prisma 7 (pg adapter) + `sharp`.
- Listens on `PORT` (default **5000**). Health: `/api/health`. WS: `/socket.io`.
- Build: `npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build`
- Start: `npm run start` → `node dist/index.js`
- `rootDir` is `server/`.
- Single instance only — code assumes one Socket.io process. Do NOT scale
  horizontally without a Redis adapter + sticky sessions.

---

## Step 0 — Pre-checks
- [x] Neon region = **us-east-1 (N. Virginia)**. Put the Lightsail instance in
      **us-east-1** to co-locate with the DB. (This is an upgrade over today:
      Render runs in Oregon/us-west, so every query currently crosses the US —
      us-east-1 removes that hop. User→server latency from India is unchanged
      vs today, since the DB was already US-based.)
- [ ] Collect all secrets currently in Render (dashboard → cropbid-api → Environment):
      `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
      `GEMINI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
      `RAZORPAY_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `CLIENT_URL`,
      and the email credential (`BREVO_API_KEY`, or the `SMTP_*` set if still
      on SMTP — see "Email" below).
- [ ] Confirm email actually sends from the NEW box before cutover. It is the
      easiest thing to forget: with no email credential set, `email.service`
      silently falls back to printing to the console and every password reset
      and signup code vanishes into the log.
- [ ] Decide the API hostname: **`api.cropbid.in`** (recommended — lets us swap
      backends later without touching the client again).

## Step 1 — Provision the instance
- Lightsail console → Create instance.
- Region: **us-east-1 (N. Virginia)** — same as Neon.
- Blueprint: **OS Only → Ubuntu 24.04 LTS**.
- Plan: **1 GB RAM / 2 vCPU** (~$7/mo) **plus a 2 GB swap file** (Step 3).
  Steady-state Node sits well under 1 GB; the only real pressure is the
  `npm install` + `prisma generate` + `tsc` spike during a deploy, and swap
  absorbs that fine. Paying $12 for 2 GB to cover a few minutes of build
  headroom per deploy costs ~12 months of credit runway.
  If builds still struggle, the better fix is to compile in GitHub Actions and
  ship `dist/` to the box — not a bigger instance.
- Create a **static IP** and attach it.
- Firewall (Networking tab): allow TCP **22, 80, 443**. Do NOT expose 5000.

## Step 2 — DNS
- At your DNS provider for `cropbid.in`: add an **A record**
  `api` → the Lightsail static IP.
- Wait for it to resolve (`dig api.cropbid.in`) before Caddy tries to get a cert.

## Step 3 — Base runtime (SSH in)
```bash
sudo apt update && sudo apt -y upgrade
# Node 22 LTS (matches Prisma 7 support; 24 also fine)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
# sharp needs no extra libs on Ubuntu 24 (prebuilt binaries), but build tools help:
sudo apt install -y build-essential
node -v && npm -v
```

**Swap** — this is what makes the 1 GB instance viable. Without it, `npm install`
or `tsc` can OOM-kill mid-deploy and leave the service down.
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # survives reboot
free -h                                                       # confirm 2Gi swap
```

**Security patching** — Render did this for you; now it is yours. Unattended
upgrades apply security patches without a human remembering to.
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes
```

## Step 4 — App user + code
```bash
sudo useradd -m -s /bin/bash cropbid
sudo -u cropbid -i
git clone https://github.com/<your-org>/Cropbid.git ~/app   # use a deploy key
cd ~/app/server
```

## Step 5 — Secrets
Create `/home/cropbid/app/server/.env` (chmod 600), NODE_ENV=production plus
every secret from Step 0. **Cloudinary must be set** — local disk is ephemeral
on redeploy, exactly like Render.
```
NODE_ENV=production
PORT=5000
DATABASE_URL=...        # Neon POOLED
DIRECT_URL=...          # Neon UNPOOLED (used by migrate)
JWT_SECRET=...
JWT_REFRESH_SECRET=...
GEMINI_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
CLOUDINARY_URL=...
CLIENT_URL=https://cropbid.in
DEFAULT_CURRENCY=INR
DEFAULT_LOCALE=en-IN

# --- Email (see "Email" section below) ---
# Preferred: Brevo HTTP API — port 443, works on any host, no SMTP ports.
BREVO_API_KEY=...
EMAIL_FROM=CropBid <no-reply@cropbid.in>
# If still on SMTP instead (works on Lightsail, NOT on Render free):
# SMTP_HOST=smtp-relay.brevo.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
```
**If the email credential is missing, nothing errors.** `email.service` falls
back to printing the message to stdout, so password resets and buyer signup
codes end up in `journalctl` instead of an inbox. Check for the
`EMAIL (dev fallback)` banner in the logs after first boot.

## Step 6 — First build
```bash
cd ~/app/server
npm install --include=dev
npx prisma generate
npx prisma migrate deploy      # uses DIRECT_URL
npm run build
node dist/index.js             # smoke test, then Ctrl-C
# curl http://localhost:5000/api/health  → should be 200
```

## Step 7 — Run as a service (systemd)
`/etc/systemd/system/cropbid-api.service`:
```ini
[Unit]
Description=CropBid API
After=network.target

[Service]
Type=simple
User=cropbid
WorkingDirectory=/home/cropbid/app/server
EnvironmentFile=/home/cropbid/app/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cropbid-api
sudo systemctl status cropbid-api
```

## Step 8 — HTTPS + reverse proxy (Caddy)
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```
`/etc/caddy/Caddyfile` — Caddy proxies HTTP *and* WebSocket upgrades automatically:
```
api.cropbid.in {
    reverse_proxy 127.0.0.1:5000
}
```
```bash
sudo systemctl reload caddy
# Caddy auto-fetches a Let's Encrypt cert for api.cropbid.in
curl https://api.cropbid.in/api/health   # 200 over HTTPS
```

## Step 9 — Auto-deploy on push to main (GitHub Action)
Replaces Render's `autoDeploy`. Add repo secrets `LIGHTSAIL_HOST`,
`LIGHTSAIL_USER=cropbid`, `LIGHTSAIL_SSH_KEY` (a deploy key's private half).
`.github/workflows/deploy-api.yml`:
```yaml
name: Deploy API to Lightsail
on:
  push:
    branches: [main]
    paths: ['server/**', '.github/workflows/deploy-api.yml']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.LIGHTSAIL_HOST }}
          username: ${{ secrets.LIGHTSAIL_USER }}
          key: ${{ secrets.LIGHTSAIL_SSH_KEY }}
          script: |
            cd ~/app && git pull --ff-only
            cd server
            npm install --include=dev
            npx prisma generate
            npx prisma migrate deploy
            npm run build
            sudo systemctl restart cropbid-api
```
(Grant `cropbid` a sudoers rule limited to `systemctl restart cropbid-api`.)

## Email — read before cutover
Sending is via Brevo (domain `cropbid.in` is authenticated: `brevo-code` TXT +
`brevo1`/`brevo2` DKIM CNAMEs). Zoho still handles INBOUND mail; Brevo only sends.

**Use Brevo's HTTP API, not SMTP.** Reasons, in order:
1. **It keeps the Render rollback real.** `render.yaml` is `plan: free`, and
   Render free blocks outbound SMTP. On SMTP, rolling back to Render silently
   breaks every password reset and signup code — you would only find out from
   user reports. The HTTP API (port 443) works identically on Render free,
   Render paid, and Lightsail.
2. Better failures. A blocked SMTP port does not refuse the connection, it
   drops packets — so the request HANGS (~120s) instead of erroring. That is
   exactly how this was diagnosed. HTTP gives you a status code immediately.
3. One less thing that depends on where the box lives.

If you do use SMTP on Lightsail: port 587 works, but AWS blocks outbound **port
25** by default across EC2/Lightsail and lifting it needs a support request.
Never use 25.

Buyer signup now REQUIRES working email (the OTP gate). Broken email is no
longer a degraded password reset — it is a total signup outage for buyers.

## Step 10 — Verify in parallel (Render still live)
- [ ] `https://api.cropbid.in/api/health` → 200
- [ ] A real Socket.io connection from a browser succeeds (check WS upgrade).
- [ ] An image upload lands in Cloudinary (not local disk).
- [ ] A Razorpay test flow works.
- [ ] **A real email arrives.** Trigger a password reset for an account whose
      inbox you control and confirm delivery — plus SPF/DKIM pass in the
      headers. Note `forgot-password` is enumeration-safe: it returns the same
      200 whether or not the account exists, so testing an address with NO
      account proves nothing. (This wasted an afternoon once already.)
- [ ] **A buyer signup completes end to end** — code received, entered,
      account created, and the password chosen at step 1 still logs in.

## Step 11 — Cutover
- Update the API base URL env var in **Vercel** (client) → point at
  `https://api.cropbid.in` → redeploy client. **This is the switch.**

## Step 12 — Rollback / cleanup
- Rollback: point Vercel's API URL back at the Render URL, redeploy. Done.
- **Do NOT delete the Render service.** A suspended free service costs nothing
  and is the whole fallback. Keep `render.yaml` committed and current — if it
  drifts from what the app needs, the "one hour" rollback becomes a debugging
  session on your worst day.
- Set a **Lightsail billing alarm** so you know when the $200 runs out. Give
  yourself a month's notice, not a week's — reverting means redeploying the
  blueprint and re-entering every secret from Step 0.
- **Rollback checklist** (the bits that are easy to miss):
  - [ ] Repoint Vercel's API base URL → Render URL, redeploy client.
  - [ ] Re-enter every secret in the Render dashboard (they are `sync: false`,
        so the blueprint does NOT carry them).
  - [ ] Email still works? Only if you are on the Brevo HTTP API. On SMTP,
        Render free blocks it and buyer signup breaks — budget ~$7/mo for
        Render Starter, or move to the API first.
  - [ ] `DATABASE_URL` / `DIRECT_URL` unchanged — Neon never moved, which is
        exactly why this rollback is cheap.

## When the credits run out — the decision
The billing alarm fires ~1 month out. At that point there are three options and
they are NOT "keep paying or panic":

| Option | Cost | Cold start | Ops burden | Work to switch |
|--------|------|-----------|-----------|----------------|
| **A.** Stay on Lightsail | ~$7/mo | none | yours | nothing |
| **B.** Back to Render Starter | ~$7/mo | none | Render's | ~1 hour |
| **C.** Back to Render free | $0 | 50s returns | Render's | ~1 hour |

**A and B cost the same.** The only real question is whether you would rather
own a Linux box or hand patching/uptime back to Render. If the box has been
quiet and deploys are smooth, stay. If babysitting it has been a tax, B is not
a defeat — it is the same money for less work.

**C is the escape hatch** if money is genuinely tight, and it is survivable —
but ONLY on the Brevo HTTP API. On SMTP, Render free blocks the ports and buyer
signup dies completely. Cold starts also return, so do not pick C while
demoing to anyone.

Decide before the credits lapse, not after. An expired-credit AWS account can
suspend the instance, and "the site is down" is a bad time to be choosing a
hosting strategy.

## Keeping the rollback cheap — the one rule
**Use nothing AWS-proprietary.** The entire reason rollback is an hour and not a
project is that all state lives outside the box:

| Keep using | Do NOT adopt |
|------------|--------------|
| Neon (Postgres) | RDS / Lightsail managed DB |
| Cloudinary (images) | S3 |
| Brevo (email) | SES |
| `.env` on disk | Parameter Store / Secrets Manager |
| Caddy on the box | ALB / CloudFront |
| Vercel (client) | Amplify |

The Lightsail box should stay **disposable**: everything on it is reproducible
from git + the `.env`. If you ever put the database on it, that stops being
true, and rollback turns into a data migration.

## Gotchas
- **You are now the uptime monitor.** systemd's `Restart=always` restarts the
  PROCESS, not the INSTANCE. If the box itself dies or wedges, the site is down
  until a human notices — Render handled that. Put an external uptime check on
  `https://api.cropbid.in/api/health` before cutover, not after.
- **Email fails silently.** No credential → console fallback, no error. See the
  Email section; verify delivery, do not assume it.
- **AWS blocks outbound port 25** by default (lifting it needs a support
  request). 587 works. Prefer the HTTP API and sidestep the question.
- **Migrations** use `DIRECT_URL` (unpooled). Confirm both URLs are set.
- **`sharp`** must be built ON the box (arch match) — never copy `node_modules`
  from a Mac. The deploy script rebuilds, so this is handled.
- **Socket.io** = single instance only. No horizontal scaling without Redis.
- **CORS** unchanged — `CLIENT_URL` stays `https://cropbid.in`.
- **Cloudinary** must be configured or uploads vanish on redeploy.
- **Backups**: enable Lightsail automatic snapshots ($/mo, small) if the box
  holds anything not reproducible from git + Neon.
