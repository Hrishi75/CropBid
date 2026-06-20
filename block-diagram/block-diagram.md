# CropBid — System Block Diagram

High-level architecture of the CropBid platform: clients, API server, real-time layer, data store, and external services.

## Block diagram (Mermaid)

```mermaid
flowchart TB
    subgraph Clients
        WEB["Web App<br/>React 19 + Vite + Tailwind<br/>(Vercel · cropbid.in)"]
        MOB["Mobile App<br/>Expo + React Native + NativeWind<br/>(X-Client: mobile header)"]
    end

    subgraph Server["API Server — Express 5 (Render)"]
        MW["Middleware<br/>JWT auth · role guard · validation"]
        RT["REST Routes<br/>auth · listings · bids · auctions<br/>negotiations · payments · logistics<br/>transactions · analytics · admin · agent"]
        SVC["Services (business logic)<br/>bid / negotiation / payment / logistics<br/>notification · trust score · audit"]
        AI["AI Agent Service<br/>round-by-round negotiation<br/>within user price limits"]
        WS["Socket.IO<br/>live auctions · bids · notifications"]
    end

    subgraph Data
        PRISMA["Prisma 7 ORM"]
        DB[("PostgreSQL<br/>(Neon)")]
    end

    subgraph External["External Services"]
        RZP["Razorpay<br/>escrow payments"]
        GEM["Google Gemini<br/>LLM for agent negotiation"]
    end

    WEB -->|"HTTPS / REST (JWT)"| MW
    MOB -->|"HTTPS / REST (JWT)"| MW
    WEB <-->|WebSocket| WS
    MOB <-->|WebSocket| WS

    MW --> RT --> SVC
    SVC --> AI
    SVC --> WS
    SVC --> PRISMA --> DB
    AI --> GEM
    SVC --> RZP
```

## Deal flow (domain view)

```mermaid
flowchart LR
    L["Farmer lists crop<br/>(qty · grade · price range)"] --> P{Deal path}
    P -->|Manual| B["Buyer bids →<br/>farmer accepts / rejects / counters"]
    P -->|AI agents| N["Buyer & farmer agents<br/>negotiate via Gemini"]
    P -->|Auction| A["Live auction<br/>(Socket.IO)"]
    B --> D[Deal struck]
    N --> D
    A --> D
    D --> E["Escrow funded<br/>(Razorpay)"]
    E --> S["Crop ships<br/>(logistics partner)"]
    S --> C["Delivery confirmed →<br/>payment released to farmer"]
    C --> T["Trust scores updated"]
```

## Component summary

| Block | Tech | Hosting |
|---|---|---|
| Web client | React 19, Vite, Tailwind | Vercel (cropbid.in) |
| Mobile client | Expo, React Native, NativeWind | — |
| API server | Express 5, TypeScript | Render |
| Real-time | Socket.IO | Render (same process) |
| ORM / DB | Prisma 7 → PostgreSQL | Neon |
| Payments | Razorpay (escrow) | external |
| AI negotiation | Google Gemini | external |
