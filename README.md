# 🌾 CropBid — AI-Powered Agricultural Marketplace

CropBid is a full-stack B2B agricultural marketplace where AI agents (powered by Google Gemini) negotiate crop deals between farmers and buyers. India-focused but globally adaptable.

## Features

- **AI Negotiation** — Gemini 2.0 Flash agents with 3 styles (Aggressive, Balanced, Conservative) negotiate deals automatically
- **Live Auctions** — Real-time WebSocket bidding with anti-sniping protection
- **Smart Matching** — AI-scored listing recommendations based on buyer preferences
- **Escrow System** — Secure payment holding with delivery tracking and auto-release
- **Trust Scores** — Reputation builds through successful transactions (+2 per deal)
- **Real-time Notifications** — Dual-channel (DB + Socket.io push) alerts for all events
- **Analytics Dashboards** — Recharts visualizations for farmers, buyers, and admins
- **Dark Mode** — CSS custom property swap, zero component changes
- **Responsive** — Mobile sidebar with slide-in menu
- **Admin Panel** — Platform stats, user management, transaction oversight, refunds

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite, Recharts |
| Backend | Express 5, TypeScript, Prisma 7 (driver adapter) |
| Database | PostgreSQL 16 (Docker) |
| AI | Google Gemini 2.0 Flash (native fetch, no SDK) |
| Real-time | Socket.io (WebSocket + fallback) |
| Auth | JWT dual-token (access 15min + refresh 7d httpOnly cookie) |
| Image Processing | Sharp (WebP conversion, resize) + Multer |

## Architecture

```
CropBid/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components (Button, Card, Input, Navbar, Sidebar)
│   │   ├── context/        # AuthContext (JWT + refresh token rotation)
│   │   ├── lib/            # axios (interceptors), socket.io client
│   │   ├── pages/          # farmer/, buyer/, admin/, shared/, auth/
│   │   ├── routes/         # React Router with ProtectedRoute guard
│   │   └── types/          # TypeScript interfaces matching Prisma schema
│   └── vite.config.ts      # Tailwind v4 plugin, API proxy
│
├── server/                 # Express backend
│   ├── prisma/
│   │   ├── schema.prisma   # 9 models, 13 enums
│   │   └── seed.ts         # 31 users, 50 listings, 30 agent configs, 20 bids
│   ├── src/
│   │   ├── config/         # Centralized env config
│   │   ├── controllers/    # HTTP layer (parse → call service → respond)
│   │   ├── middleware/      # auth, roleGuard, errorHandler, upload (Multer)
│   │   ├── routes/         # Express routers (auth, listings, bids, etc.)
│   │   ├── services/       # Business logic (bid, negotiation, transaction, AI)
│   │   ├── socket/         # Socket.io server (auctions, notifications)
│   │   ├── utils/          # ApiError, JWT helpers, AI prompts
│   │   └── lib/            # Prisma singleton client
│   └── prisma.config.ts    # Prisma v7 config with seed command
│
├── docker-compose.yml      # PostgreSQL 16 Alpine
└── .env.example            # Environment variable template
```

## Prerequisites

- **Node.js** 18+ and npm
- **Docker** (for PostgreSQL) — or a local/remote PostgreSQL 16 instance
- **Google Gemini API Key** — free at [aistudio.google.com](https://aistudio.google.com/app/apikey)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/CropBid.git
cd CropBid

# Install server dependencies
cd server && npm install

# Install client dependencies
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

Edit `server/.env` and set your `GEMINI_API_KEY`. The database URL works out of the box with the Docker setup.

### 4. Set up database

```bash
cd server

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed with sample data (31 users, 50 listings, etc.)
npx prisma db seed
```

### 5. Start development servers

```bash
# Terminal 1 — Server (port 5000)
cd server && npm run dev

# Terminal 2 — Client (port 5173)
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Test Accounts (all password: `password123`)

| Role | Email | Description |
|------|-------|-------------|
| Farmer | `rajesh.kumar@email.com` | Rice farmer from Punjab |
| Buyer | `freshmart.india@email.com` | FreshMart India, FMCG buyer |
| Admin | `admin@cropbid.com` | Platform administrator |

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login (returns access token + refresh cookie) |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Clear refresh token |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/onboarding/farmer` | Complete farmer profile |
| POST | `/api/auth/onboarding/buyer` | Complete buyer profile |

### Listings
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/listings` | Create listing (with image upload) |
| GET | `/api/listings/my` | Get my listings |
| GET | `/api/listings/:id` | Get listing detail |
| PATCH | `/api/listings/:id` | Update listing |
| DELETE | `/api/listings/:id` | Delete listing |

### Browse & Match
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/browse` | Browse listings with filters & smart match scoring |

### Bids
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/bids` | Place a bid |
| GET | `/api/bids/my` | My bids (buyer) |
| GET | `/api/bids/incoming` | Incoming bids (farmer) |
| POST | `/api/bids/:id/accept` | Accept bid (creates transaction) |
| POST | `/api/bids/:id/reject` | Reject bid |
| POST | `/api/bids/:id/counter` | Counter with new price |
| PATCH | `/api/bids/:id` | Update bid (buyer) |
| DELETE | `/api/bids/:id` | Withdraw bid |

### AI Agent
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent` | Get agent config |
| PUT | `/api/agent` | Update agent config |

### Negotiations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/negotiations/start` | Start AI negotiation on a bid |
| GET | `/api/negotiations` | My negotiations |
| GET | `/api/negotiations/:id` | Negotiation detail with round-by-round data |

### Auctions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auctions/start` | Start live auction (farmer) |
| GET | `/api/auctions` | List active auctions |
| GET | `/api/auctions/:listingId` | Get auction state |

### Transactions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/transactions` | Create from accepted bid |
| GET | `/api/transactions` | My transactions |
| GET | `/api/transactions/stats` | Summary statistics |
| GET | `/api/transactions/:id` | Transaction detail |
| PATCH | `/api/transactions/:id/delivery` | Update delivery status |
| POST | `/api/transactions/:id/refund` | Refund (admin) |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics` | Role-aware analytics data |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | My notifications (paginated) |
| GET | `/api/notifications/unread-count` | Badge count |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/users` | User management |
| PATCH | `/api/admin/users/:id` | Update user (trust score) |
| GET | `/api/admin/listings` | All listings |
| GET | `/api/admin/transactions` | All transactions |

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `auction:join` | `listingId` | Join an auction room |
| `auction:leave` | `listingId` | Leave an auction room |
| `auction:bid` | `{ listingId, price }` | Place a live bid |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `auction:state` | Full auction state | Current state on join |
| `auction:new_bid` | Bid details | Someone placed a bid |
| `auction:time_extended` | New end time | Anti-sniping triggered |
| `auction:participant_count` | Count | Room size changed |
| `auction:ended` | Winner + final price | Auction complete |
| `auction:started` | Listing + end time | New auction started |
| `notification:new` | Notification object | Real-time notification push |

## Database Schema

9 models: **User**, **FarmerProfile**, **BuyerProfile**, **Listing**, **AgentConfig**, **Bid**, **Transaction**, **Negotiation**, **Notification**

Key relationships:
- User → FarmerProfile/BuyerProfile (1:1)
- User → AgentConfig (1:1, lazy created)
- Listing → Bids (1:many)
- Bid → Transaction (1:1)
- Bid → Negotiation (1:1)
- Negotiation stores rounds as JSON array

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Prisma v7 driver adapter pattern | Required by Prisma 7 — uses `@prisma/adapter-pg` instead of direct connection |
| Express 5 + `http.createServer` | Enables Socket.io attachment + fixes Express 5 route handling |
| JWT access token in memory | Not in localStorage (XSS safe), refresh token in httpOnly cookie |
| Gemini via native fetch (no SDK) | One endpoint, zero dependencies, full control |
| Temperature 0.3 for AI | Low randomness = consistent, predictable negotiations |
| Reject as AI safe default | If anything fails, no money moves, no commitments made |
| In-memory auction state | Auctions are short-lived; DB persistence only on end |
| Anti-sniping (30s extension) | Prevents last-second bids from winning unfairly |
| CSS custom properties for theme | Dark mode = change variables, zero component changes |
| 2% platform fee | Calculated on transaction creation, deducted on payment release |
| Trust score +2 per deal | Organic reputation building through completed transactions |

## License

MIT
