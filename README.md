<div align="center">

<img src="client/public/cropbid.png" alt="CropBid" width="140" />

# CropBid — AI-Powered Agricultural Marketplace

**B2B crop trading where AI agents negotiate deals between farmers and buyers — with escrow payments, live auctions, and logistics built in.**

[![Live Demo](https://img.shields.io/badge/live-cropbid.in-2f6b3a?style=flat-square)](https://cropbid.in)
&nbsp;
![Stack](https://img.shields.io/badge/React_19-Express_5-Prisma_7-Postgres-444?style=flat-square)
&nbsp;
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

</div>

---

## What is CropBid?

CropBid is a full-stack agricultural marketplace built for India (and adaptable globally). Farmers list crops; buyers (processors, FMCG, exporters, retailers, restaurants) discover and buy them. Every deal can be struck **two ways**:

1. **Manually** — buyers place bids, farmers accept / reject / counter.
2. **Via AI agents** — each user configures an agent (Google Gemini) that negotiates on their behalf, round by round, within price limits they set.

Once a deal is reached, money moves into **escrow via Razorpay**, the crop ships through a **logistics partner**, and on delivery confirmation the payment releases to the farmer. Trust scores grow with every completed deal.

> **Try it:** [cropbid.in](https://cropbid.in) · test accounts below (password `password123`).

---

## How the platform works

### The two deal paths

```
                          ┌─────────────────────────────────────────────┐
                          │              FARMER lists a crop             │
                          │     (qty, quality grade, price range)        │
                          └───────────────────────┬─────────────────────┘
                                                  │
                  ┌───────────────────────────────┴───────────────────────────────┐
                  │                                                                 │
        ┌─────────▼─────────┐                                          ┌────────────▼────────────┐
        │   MANUAL PATH     │                                          │      AI-AGENT PATH       │
        │                   │                                          │                          │
        │ Buyer browses →   │                                          │ Buyer's agent finds a    │
        │ places a bid →    │                                          │ match → negotiates with  │
        │ Farmer accepts /  │                                          │ farmer's agent round by  │
        │ counters / rejects│                                          │ round (within set limits)│
        └─────────┬─────────┘                                          └────────────┬─────────────┘
                  │  bid ACCEPTED                                       DEAL reached │  bid ACCEPTED
                  └───────────────────────────────┬───────────────────────────────┘
                                                  │
                                  ┌───────────────▼───────────────┐
                                  │   ESCROW TRANSACTION created   │
                                  │      (status AWAITING_PAYMENT) │
                                  └───────────────┬───────────────┘
                                                  │
              ┌───────────────────────────────────┼───────────────────────────────────┐
              ▼                                    ▼                                    ▼
   ┌────────────────────┐            ┌──────────────────────────┐          ┌────────────────────────┐
   │ Buyer PAYS via     │            │ Crop SHIPS via logistics │          │ Buyer CONFIRMS receipt │
   │ Razorpay → ESCROW  │  ───────▶  │ partner (tracked)        │ ───────▶ │ → payment RELEASED to  │
   │ (money held)       │            │                          │          │ farmer, trust +2 each  │
   └────────────────────┘            └──────────────────────────┘          └────────────────────────┘
```

### Step by step

**As a Farmer**
1. Sign up → onboard (farm size, crops, state, optional FPO / APMC license, organic cert).
2. **Create a listing** — crop, variety, quantity, quality grade (A/B/C), a min–max price range, photos, optional lab report.
3. Receive **bids** (from buyers or their agents). Accept, reject, or counter. *(Optional: configure your agent to auto-negotiate / auto-accept above a threshold.)*
4. On accept → an **escrow transaction** is created and the buyer is notified to pay.
5. After payment, **ship** the crop (book a logistics partner in-app), mark *shipped → delivered*.
6. Buyer confirms → **escrow releases to you** (minus 2% platform fee), trust score +2.

**As a Buyer**
1. Sign up → onboard (company name, type, tax/GST id, procurement volume).
2. **Browse** listings with filters + AI smart-match scoring, or join a **live auction**.
3. **Place a bid** manually, **or** let your **agent** negotiate within your max price.
4. When the deal closes, open the transaction and **Pay via Razorpay** (escrow).
5. Track the **shipment**; on receipt, **confirm delivery** → payment releases to the farmer.

**AI agents (either side)**
- Configure once: negotiation style (Aggressive / Balanced / Conservative), price floor/ceiling, preferred crops, quality requirements, auto-accept threshold.
- Agents negotiate **agent-to-agent**, recording every round (offer, counter, reasoning) until `DEAL` or `NO_DEAL`. Safe default is *reject* — if anything fails, no money moves.

**Live auctions**
- A farmer can open a real-time auction on a listing. Buyers join a room and bid live over WebSocket, with **anti-sniping** (a last-second bid extends the clock 30s). Highest bid at close wins.

---

## Payments (Razorpay — capture-only)

| Stage | `paymentStatus` | What happens |
|-------|-----------------|--------------|
| Deal struck | `AWAITING_PAYMENT` | Escrow transaction created, buyer prompted to pay |
| Buyer pays | `ESCROW` | Razorpay captures funds to the **platform** account (held) |
| Delivery confirmed | `RELEASED` | Funds released to farmer (simulated payout), trust +2 each |
| Dispute (admin) | `REFUNDED` | Returned to buyer |

- **Dev/demo:** Razorpay **test mode** is free — test cards/UPI, no KYC, no real money.
- **Capture-only scope:** money is captured to the platform account; releasing to the farmer's bank for real requires **Razorpay Route / RazorpayX** (out of current scope, release is simulated).
- **Security:** payment verification uses a timing-safe HMAC signature check; the webhook validates the raw-body signature; capture is idempotent (browser callback + webhook can't double-process).

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` to enable. Leave blank → payment endpoints return `503` and the rest of the app runs normally.

---

## Features

- **AI Negotiation** — Gemini agents, 3 styles, agent-to-agent rounds with recorded reasoning
- **Razorpay Escrow** — capture-only payments, signed webhook, idempotent capture
- **Live Auctions** — real-time WebSocket bidding with anti-sniping
- **Smart Matching** — AI-scored listing recommendations from buyer preferences
- **Logistics** — partner selection, shipment tracking, cost + platform commission
- **Trust Scores** — reputation builds through successful transactions (+2 per deal)
- **Real-time Notifications** — dual-channel (DB persistence + Socket.io push)
- **Analytics Dashboards** — Recharts visualizations for farmer, buyer, admin
- **Admin Panel** — platform stats, user management, transaction oversight, refunds
- **Audit Log** — tamper-evident record of sensitive actions (accept, refund, payment, admin edits)
- **Dark Mode** + responsive mobile layout

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite, Recharts |
| Backend | Express 5, TypeScript, Prisma 7 (driver adapter) |
| Database | PostgreSQL 16 (Docker locally · Neon serverless in prod) |
| Payments | Razorpay (capture-only) |
| AI | Google Gemini (native fetch, no SDK) |
| Real-time | Socket.io (WebSocket + fallback) |
| Auth | JWT dual-token (access 15min + refresh 7d httpOnly cookie) |
| Images | Sharp (WebP convert/resize) + Multer |
| Hosting | Vercel (client) · Render (API) · Neon (DB) |

---

## Quick Start (local dev)

### Prerequisites
- **Node.js** 18+ and npm
- **Docker** (for PostgreSQL) — or a local/remote PostgreSQL 16 instance
- **Google Gemini API key** — free at [aistudio.google.com](https://aistudio.google.com/app/apikey)
- *(optional)* **Razorpay test keys** — free at [razorpay.com](https://dashboard.razorpay.com) → Settings → API Keys

### 1. Clone & install
```bash
git clone https://github.com/Hrishi75/CropBid.git
cd CropBid
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Start PostgreSQL
```bash
docker compose up -d
```

### 3. Configure environment
```bash
cp .env.example server/.env
```
Edit `server/.env`:
- Set `GEMINI_API_KEY` (required for AI negotiation).
- Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` to enable payments (optional — blank disables them).
- `DATABASE_URL` works out of the box with the Docker setup.

### 4. Set up database
```bash
cd server
npx prisma generate
npx prisma migrate dev
npx prisma db seed     # ~30 users, listings, agent configs, bids
```

### 5. Run dev servers
```bash
# Terminal 1 — API (port 5000)
cd server && npm run dev
# Terminal 2 — client (port 5173)
cd client && npm run dev
```
Open **http://localhost:5173**.

### Test accounts (password `password123`)
| Role | Email | Notes |
|------|-------|-------|
| Farmer | `rajesh@cropbid.test` | Nashik · onion, tomato, grape |
| Buyer | `vikram@cropbid.test` | Agri Foods Pvt Ltd (Processor) |
| Admin | `admin@cropbid.test` | Platform administrator |

> To test a payment end-to-end: log in as a **buyer**, place a bid → log in as the **farmer**, accept it → back as the **buyer**, open the transaction and **Pay** with test card `4111 1111 1111 1111` (any future expiry + CVV).

---

## Deployment (live demo stack)

| Piece | Host | Notes |
|-------|------|-------|
| Frontend | **Vercel** → [cropbid.in](https://cropbid.in) | root dir `client`, auto-build on push to `main` |
| Backend | **Render** web service | `render.yaml` blueprint; build runs `prisma migrate deploy` |
| Database | **Neon** serverless Postgres | pooled `DATABASE_URL` + unpooled `DIRECT_URL` for migrations |

- Set secrets in the Render dashboard: DB urls, `JWT_SECRET` / `JWT_REFRESH_SECRET`, `GEMINI_API_KEY`, `RAZORPAY_*`, `CLIENT_URL` (exact origin, **no** trailing slash for CORS).
- Vercel build-time env: `VITE_API_URL`, `VITE_SOCKET_URL` (point at the Render API).
- `RUN_SEED` gates seeding in the build — keep `false` (seeding **wipes & repopulates** every run).

See [DEPLOY.md](DEPLOY.md) for full steps.

---

## API Endpoints

<details>
<summary><b>Auth</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login (access token + refresh cookie) |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Clear refresh token |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/auth/onboarding/farmer` | Complete farmer profile |
| POST | `/api/auth/onboarding/buyer` | Complete buyer profile |
</details>

<details>
<summary><b>Listings · Browse · Bids</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/listings` | Create listing (image upload) |
| GET | `/api/listings/my` | My listings |
| GET | `/api/listings/:id` | Listing detail |
| PATCH | `/api/listings/:id` | Update listing |
| DELETE | `/api/listings/:id` | Delete listing |
| GET | `/api/browse` | Browse with filters + smart-match scoring |
| POST | `/api/bids` | Place a bid |
| GET | `/api/bids/my` | My bids (buyer) |
| GET | `/api/bids/incoming` | Incoming bids (farmer) |
| POST | `/api/bids/:id/accept` | Accept bid (creates transaction) |
| POST | `/api/bids/:id/reject` | Reject bid |
| POST | `/api/bids/:id/counter` | Counter with new price |
| PATCH | `/api/bids/:id` | Update bid |
| DELETE | `/api/bids/:id` | Withdraw bid |
</details>

<details>
<summary><b>AI Agent · Negotiations · Auctions</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent` | Get agent config |
| PUT | `/api/agent` | Update agent config |
| POST | `/api/negotiations/start` | Start AI negotiation on a bid |
| GET | `/api/negotiations` | My negotiations |
| GET | `/api/negotiations/:id` | Negotiation detail (round-by-round) |
| POST | `/api/auctions/start` | Start live auction (farmer) |
| GET | `/api/auctions` | List active auctions |
| GET | `/api/auctions/:listingId` | Auction state |
</details>

<details>
<summary><b>Transactions · Payments · Logistics</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/transactions` | Create from accepted bid |
| GET | `/api/transactions` | My transactions |
| GET | `/api/transactions/stats` | Summary statistics |
| GET | `/api/transactions/:id` | Transaction detail |
| PATCH | `/api/transactions/:id/delivery` | Update delivery status |
| POST | `/api/transactions/:id/refund` | Refund (admin) |
| POST | `/api/payments/order` | Create a Razorpay order (buyer) |
| POST | `/api/payments/verify` | Verify Checkout signature → ESCROW |
| POST | `/api/payments/webhook` | Razorpay webhook (raw-body, signed) |
| GET | `/api/logistics/partners/:transactionId` | Matching partners for a transaction |
| POST | `/api/logistics/quote` | Transport quote |
| POST | `/api/logistics/book` | Book a shipment |
| GET | `/api/logistics/shipment/:id` | Shipment + tracking |
| GET | `/api/logistics/transaction/:transactionId` | Shipment by transaction |
| PUT | `/api/logistics/shipment/:id/status` | Update shipment status |
</details>

<details>
<summary><b>Analytics · Notifications · Admin · Misc</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics` | Role-aware analytics data |
| GET | `/api/stats/landing` | Public landing-page stats |
| GET | `/api/notifications` | My notifications (paginated) |
| GET | `/api/notifications/unread-count` | Badge count |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/users` | User management |
| PATCH | `/api/admin/users/:id` | Update user (trust score) |
| GET | `/api/admin/listings` | All listings |
| GET | `/api/admin/transactions` | All transactions |
| POST | `/api/waitlist` | Early-access signup |
</details>

---

## Socket.io Events

**Client → Server:** `auction:join`, `auction:leave`, `auction:bid`

**Server → Client:** `auction:state`, `auction:new_bid`, `auction:time_extended`, `auction:participant_count`, `auction:ended`, `auction:started`, `notification:new`

---

## Project Structure

```
CropBid/
├── client/                 # React frontend (Vite)
│   ├── public/             # logo, favicon, static assets
│   └── src/
│       ├── components/     # UI + feature components
│       ├── context/        # AuthContext (JWT + refresh rotation)
│       ├── lib/            # axios (interceptors), socket, razorpay loader
│       ├── pages/          # farmer/ buyer/ admin/ shared/ auth/
│       ├── routes/         # Router + ProtectedRoute guard
│       └── types/          # TS interfaces matching the Prisma schema
│
├── server/                 # Express backend
│   ├── prisma/
│   │   ├── schema.prisma   # 13 models, 16 enums
│   │   ├── migrations/     # versioned SQL migrations
│   │   └── seed.ts         # sample users, listings, agents, bids
│   └── src/
│       ├── config/         # centralized env config
│       ├── controllers/    # HTTP layer
│       ├── middleware/     # auth, roleGuard, rateLimiter, errorHandler, upload
│       ├── routes/         # Express routers
│       ├── services/       # business logic (bid, negotiation, transaction, payment, AI, logistics)
│       ├── socket/         # Socket.io server
│       ├── utils/          # ApiError, JWT, AI prompts
│       └── lib/            # Prisma singleton
│
├── render.yaml             # Render blueprint (API)
├── docker-compose.yml      # PostgreSQL 16 Alpine
├── DEPLOY.md               # production deploy guide
└── .env.example            # environment template
```

---

## Database Schema

**13 models:** User · FarmerProfile · BuyerProfile · Listing · AgentConfig · Bid · Transaction · Negotiation · Notification · Waitlist · AuditLog · LogisticsPartner · Shipment

Key relationships:
- User → FarmerProfile / BuyerProfile / AgentConfig (1:1)
- Listing → Bids · Transactions · Negotiations (1:many)
- Bid → Transaction (1:1) · Bid → Negotiation (1:1)
- Transaction → Shipment (1:1)
- Negotiation stores rounds as a JSON array

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Two deal paths (manual + agent) | Users who want control bid manually; users who want automation let agents negotiate |
| Razorpay capture-only | Real capture to platform now; farmer payout (Route) deferred — keeps scope tight, demo free |
| Idempotent order + atomic capture | Re-clicking Pay reuses the order; webhook + callback can't double-capture |
| Webhook on raw body before `express.json` | HMAC signature must verify the exact bytes Razorpay sent |
| Prisma 7 driver adapter | Required by Prisma 7 — `@prisma/adapter-pg`, same code on Docker & Neon |
| JWT access token in memory | Not in localStorage (XSS-safe); refresh token in httpOnly cookie |
| Gemini via native fetch | One endpoint, zero deps, full control; temp 0.3 for consistent negotiations |
| Reject as AI safe default | If anything fails, no money moves, no commitments made |
| In-memory auction state | Auctions are short-lived; persist to DB only on close |
| Anti-sniping (30s extension) | Stops last-second bids from winning unfairly |
| 2% platform fee | Computed at transaction creation, deducted on release |

---

## License

MIT
