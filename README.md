<div align="center">

<img src="client/public/cropbid.png" alt="CropBid" width="140" />

# CropBid — The AI-Powered Crop Exchange

**One crop exchange for everyone — farmers, processors, retailers and consumers trade on the same platform, with AI-agent negotiation, escrow payments, live auctions, live government mandi rates from 4,600+ mandis, and logistics built in. Plus the inputs side of the season: seed, fertiliser and machinery from licensed local suppliers. In Hindi, Marathi and English.**

[![Live Demo](https://img.shields.io/badge/live-cropbid.in-2f6b3a?style=flat-square)](https://cropbid.in)
&nbsp;
![Backed by India 2047 Ventures](https://img.shields.io/badge/backed_by-India_2047_Ventures-c9822b?style=flat-square)
&nbsp;
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
&nbsp;
[![X](https://img.shields.io/badge/X-@CropBid-000?style=flat-square&logo=x&logoColor=white)](https://x.com/CropBid)

</div>

---

## What is CropBid?

CropBid is a full-stack crop exchange built for India (and adaptable globally), available in **Hindi, Marathi and English**. Sellers list crops; buyers of every size — processors, FMCG, exporters, retailers, restaurants, and everyday consumers — discover and buy them, with the government's **live mandi rates from 4,600+ mandis** as a shared fair-price anchor. Every deal can be struck **two ways**:

1. **Manually** — buyers place bids, sellers accept / reject / counter.
2. **Via AI agents** — each user configures an agent (Google Gemini) that negotiates on their behalf, round by round, within price limits they set.

Once a deal is reached, money moves into **escrow via Razorpay**, the crop ships through a **logistics partner**, and on delivery confirmation the payment releases to the farmer. Trust scores grow with every completed deal.

> **Try it:** [cropbid.in](https://cropbid.in) · test accounts below (password `password123`).

CropBid is **backed by India 2047 Ventures** and live in production today.

---

## How the platform works

### The deal paths

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

**Plus a direct-to-consumer path.** When a farmer enables the retail channel on a listing (`directSaleEnabled` + a `retailPricePerUnit`), a **CONSUMER** can instant-buy any quantity at that fixed price — no bidding, no negotiation. The purchase is created already `ACCEPTED`, atomically decrements the listing's `remainingQuantity` (flipping it to `SOLD` at zero), then joins the same escrow → ship → confirm pipeline above.

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

- **Live Govt Mandi Rates** — every listing anchored to the day's official AGMARKNET wholesale price, drawn from 4,600+ mandis, as a shared fair-price reference for both sides
- **AI Negotiation** — Gemini agents, 3 styles, agent-to-agent rounds with recorded reasoning
- **Razorpay Escrow** — capture-only payments, signed webhook, idempotent capture
- **Live Auctions** — real-time WebSocket bidding with anti-sniping
- **Smart Matching** — AI-scored listing recommendations from buyer preferences
- **Logistics** — partner selection, shipment tracking, cost + platform commission
- **Farm Equipment** — a lead-gen catalogue of tractors, tillage, pumps and sprayers from curated dealers, to buy outright or hire by the day. Raising an enquiry is what unlocks the dealer's phone number, so the catalogue can't be scraped for contacts. No payment: the dealer closes offline
- **Seeds, Fertiliser & Crop Protection** — the same lead-gen model for agri-inputs, filtered by **crop** rather than category ("what do I sow in cotton"), with pack price, dose per acre and germination on the tag. Every listing is **licence-gated**: a controlled product is only ever surfaced under a supplier holding the matching statutory licence (see Key Design Decisions)
- **Trust Scores** — reputation builds through successful transactions (+2 per deal)
- **Real-time Notifications** — dual-channel (DB persistence + Socket.io push)
- **Analytics Dashboards** — Recharts visualizations for farmer, buyer, admin
- **Admin Panel** — platform stats, user management, transaction oversight, refunds
- **Audit Log** — tamper-evident record of sensitive actions (accept, refund, payment, admin edits)
- **Direct-to-Consumer Sales** — a fixed-price retail channel that runs alongside bidding: a farmer flips on "sell directly to consumers" with a retail price, and the **CONSUMER** role instant-buys any quantity with no negotiation, decrementing the listing's stock
- **Account Security** — password recovery (forgot / reset), in-app change password, and account settings across all roles
- **Native Mobile Apps** — Expo / React Native apps for buyers, farmers, and consumers: browse, place bids, live auctions, escrow checkout, manage listings, incoming bids, direct retail purchases, and ship/confirm delivery
- **MSP Price Floor (India)** — warns farmers and buyers when an INR listing is priced below the government Minimum Support Price, for catalogue crops that carry an official MSP (~11 of the ~23 nationally mandated crops)
- **Multi-language** — full storefront and app UI localized into **Hindi, Marathi and English**, with a live language switcher
- **Dark Mode** + responsive mobile layout

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite, Recharts |
| Mobile | Expo 56, React Native 0.85, React 19, React Navigation 7, socket.io-client, expo-secure-store |
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
cd ../mobile && npm install    # optional — only if running the mobile apps
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

### 6. (Optional) Run the mobile apps
The buyer and farmer apps live in `mobile/` (Expo). By default they point at the
hosted API; to target your local server, set `EXPO_PUBLIC_API_URL` first.
```bash
cd mobile
# Point the app at your machine's LAN IP (not localhost — the phone can't reach that)
EXPO_PUBLIC_API_URL=http://192.168.x.x:5000/api npm start
```
Scan the QR code with **Expo Go** (iOS/Android), or press `i` / `a` for a
simulator. Leaving `EXPO_PUBLIC_API_URL` unset uses the deployed Render API.

> **Note:** Expo 56 is a major version — read the versioned docs at
> [docs.expo.dev/versions/v56.0.0](https://docs.expo.dev/versions/v56.0.0/) before changing mobile code.

### Test accounts (password `password123`)
| Role | Email | Notes |
|------|-------|-------|
| Farmer | `rajesh@cropbid.test` | Nashik · onion, tomato, grape |
| Buyer | `vikram@cropbid.test` | Agri Foods Pvt Ltd (Processor) |
| Consumer | `priya@cropbid.test` | Individual buyer · direct-to-consumer purchases |
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
| POST | `/api/auth/forgot-password` | Request a password-reset token |
| POST | `/api/auth/reset-password` | Reset password with the emailed token |
| POST | `/api/auth/change-password` | Change password while logged in |
| POST | `/api/auth/logout` | Clear refresh token |
| GET | `/api/auth/me` | Current user profile |
| PATCH | `/api/auth/me` | Edit account + farm details — **farmer only** (partial update) |
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
| GET | `/api/browse` | Browse listings with filters |
| GET | `/api/browse/filters` | Available filter options |
| GET | `/api/browse/smart-match` | AI-scored listing recommendations |
| POST | `/api/bids` | Place a bid |
| POST | `/api/bids/direct-purchase` | Instant-buy a fixed-price quantity — **consumer only** (no negotiation) |
| GET | `/api/bids/my` | My bids (buyer) |
| GET | `/api/bids/incoming` | Incoming bids (farmer) |
| GET | `/api/bids/listing/:id` | Bids on a listing (farmer) |
| PUT | `/api/bids/:id/accept` | Accept bid (creates transaction) |
| PUT | `/api/bids/:id/reject` | Reject bid |
| PUT | `/api/bids/:id/counter` | Counter with new price |
| PUT | `/api/bids/:id/update` | Update bid |
| DELETE | `/api/bids/:id` | Withdraw bid |
</details>

<details>
<summary><b>AI Agent · Negotiations · Auctions</b></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent/config` | Get agent config |
| PUT | `/api/agent/config` | Update agent config |
| POST | `/api/agent/toggle` | Enable / disable the agent |
| POST | `/api/negotiations/start` | Start AI negotiation on a bid |
| GET | `/api/negotiations` | My negotiations |
| GET | `/api/negotiations/bid/:bidId` | Negotiation for a bid |
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
| PUT | `/api/logistics/shipment/:id/driver` | Assign driver details |
| PUT | `/api/logistics/shipment/:id/proof` | Upload proof of delivery |
| GET | `/api/logistics/admin/partners` | List logistics partners (admin) |
| POST | `/api/logistics/admin/partners` | Add a logistics partner (admin) |
| PUT | `/api/logistics/admin/partners/:id` | Update a partner (admin) |
| PUT | `/api/logistics/admin/partners/:id/toggle` | Activate / deactivate a partner (admin) |
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

<details>
<summary><b>Equipment · Seeds &amp; Fertiliser</b> (lead-gen — no orders, no payments)</summary>

Browsing is public on both surfaces; **enquiring requires auth, because the
enquiry response is the only place a dealer's or supplier's phone number is
ever returned.** That is what keeps the catalogues from being scraped for a
contact list.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/equipment` | Browse machines — filter by `mode` (SALE/RENT), `category`, `state`, `q`, `maxPrice` |
| GET | `/api/equipment/meta` | Categories with live counts + states in stock |
| GET | `/api/equipment/:id` | Machine detail (no dealer phone) |
| POST | `/api/equipment/:id/enquiry` | Raise a lead — **response carries the dealer's number** |
| GET | `/api/equipment/enquiries/my` | My equipment leads (number included) |
| GET | `/api/agri-inputs` | Browse inputs — filter by `crop`, `category`, `state`, `q`, `maxPrice` |
| GET | `/api/agri-inputs/meta` | Categories with live counts + crops + states in stock |
| GET | `/api/agri-inputs/:id` | Product detail (no supplier phone) |
| POST | `/api/agri-inputs/:id/enquiry` | Raise a lead — **response carries the supplier's number** |
| GET | `/api/agri-inputs/enquiries/my` | My input leads (number included) |

Both catalogues are loaded by hand, never through an API:

```bash
cd server
npx ts-node prisma/seedEquipment.ts    # tractors, pumps, sprayers
npx ts-node prisma/seedAgriInputs.ts   # seed, fertiliser, crop protection
```

Both are **additive and idempotent** — they insert and update only, never
delete, so they are safe to run against production. Re-running corrects prices
in place. `active` is never written on update, so a row taken off the catalogue
by hand does not quietly come back.
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
│   │   ├── schema.prisma   # 23 models, 27 enums
│   │   ├── migrations/     # versioned SQL migrations
│   │   ├── seed.ts         # sample users, listings, agents, bids (DESTRUCTIVE — wipes first)
│   │   ├── seedEquipment.ts    # equipment catalogue loader (additive, prod-safe)
│   │   └── seedAgriInputs.ts   # seed/fertiliser catalogue loader (additive, prod-safe)
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
├── mobile/                 # Expo / React Native apps (buyer + farmer)
│   ├── App.tsx             # root — providers + navigation
│   ├── app.json            # Expo config
│   └── src/
│       ├── api/            # axios client, typed endpoints, shared types
│       ├── components/     # UI kit, icons, Razorpay checkout
│       ├── context/        # AuthContext (in-memory access + secure-store refresh)
│       ├── lib/            # crops, MSP floor, price formatting, socket
│       ├── navigation/     # RootNavigator + buyer/farmer/consumer tab bars
│       └── screens/        # buyer/ farmer/ consumer/ + shared auth & onboarding
│
├── render.yaml             # Render blueprint (API)
├── docker-compose.yml      # PostgreSQL 16 Alpine
├── DEPLOY.md               # production deploy guide
└── .env.example            # environment template
```

---

## Database Schema

**23 models.**

*Identity & onboarding* — User · PendingSignup · PhoneChallenge · FarmerProfile · BuyerProfile
*Trading* — Listing · BuyerRequirement · RequirementOffer · AgentConfig · Bid · Transaction · Negotiation
*Platform* — Notification · Waitlist · AuditLog · LogisticsPartner · Shipment
*Equipment marketplace* — EquipmentDealer · Equipment · EquipmentEnquiry
*Agri-input marketplace* — InputSupplier · AgriInput · AgriInputEnquiry

Key relationships:
- User → FarmerProfile / BuyerProfile / AgentConfig (1:1)
- Listing → Bids · Transactions · Negotiations (1:many)
- Bid → Transaction (1:1) · Bid → Negotiation (1:1)
- Transaction → Shipment (1:1)
- Negotiation stores rounds as a JSON array
- EquipmentDealer → Equipment → EquipmentEnquiry (1:many, cascading)
- InputSupplier → AgriInput → AgriInputEnquiry (1:many, cascading)

**The two marketplaces are deliberately separate from trading.** Neither
EquipmentEnquiry nor AgriInputEnquiry touches Transaction, Bid or Razorpay —
they are lead records, not orders. Dealers and suppliers are curated offline
partners with no login, so their rows are loaded by hand from a catalogue file
rather than created through a UI.

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
| Enquiry unlocks the phone number | The contact is the valuable part of a catalogue. Returning it from exactly one authenticated endpoint means every number handed out is attached to a real account |
| Agri-inputs are licence-gated in SQL | Selling seed, fertiliser or pesticide is a licensed trade (Seeds Control Order 1983, Fertiliser Control Order 1985, Insecticides Act 1968). CropBid holds no licence and never owns stock — the **shop is seller of record**, which also leaves spurious-seed liability with the licensed seller. The service refuses to surface a controlled product whose supplier lacks the matching licence, on every read path, so the rule cannot be bypassed by a direct URL |
| Dealers and suppliers have no login | They are curated offline partners, not users. Catalogue data is loaded from a file, which is why there is no write API for either marketplace |

---

## License

MIT
