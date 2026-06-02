# CropBid — Investor Pitch Deck (Outline)

> **Format:** Slide-by-slide outline for PowerPoint / Google Slides / Pitch.
> **Stage:** Seed.
> **How to use:** Each `## Slide N` = one slide. "On-slide" = what the audience reads.
> "Say" = your verbal track. `[BRACKETS]` = fill with real numbers before pitching —
> do **not** present the landing-page demo figures as actual traction.

---

## Slide 1 — Title

**On-slide**
- **CropBid**
- *AI agents that negotiate crop deals — fair prices, no middlemen.*
- [Founder name(s)] · [contact email] · [date]
- One brand visual (arc mark + wordmark).

**Say**
- "We're building the autonomous procurement layer for agricultural trade. Today every bulk crop deal runs through brokers who hide the spread. CropBid replaces that with transparent AI-run auctions."

---

## Slide 2 — Problem

**On-slide**
- Agricultural trade is opaque and broker-controlled.
- **Farmers** lose 15–40% of crop value to middlemen and information asymmetry.
- **Buyers** (FMCG, FPOs, traders) overpay and can't audit how price was set.
- Price discovery happens over phone calls and WhatsApp — no record, no trail, no fairness.

**Say**
- "On both sides of every deal, someone is getting a worse price than the market would give them — and nobody can prove it. The spread disappears into a chain of intermediaries."

---

## Slide 3 — Why Now

**On-slide**
- LLMs are finally good enough to negotiate structured, rule-bounded deals.
- Smartphone + cheap data penetration in farming markets (India: 750M+ internet users).
- Digital push: eNAM, APMC reform, FPO formation at scale.
- Buyers demanding provenance + audit trails (food safety, ESG, export compliance).

**Say**
- "Two years ago an AI negotiator was a demo. Now it's deterministic at the edges and reliable enough to bind real contracts. And the rails — digital payments, KYC, provenance data — finally exist."

---

## Slide 4 — Solution

**On-slide**
- **CropBid** = marketplace where AI agents negotiate crop deals end-to-end.
- Farmer lists crop + floor price → verified buyers bid in transparent rounds → AI agents negotiate within hard guardrails → escrow settles on confirmed delivery.
- Every bid, counter, and walk-away is timestamped and exportable.
- *"You see every offer — including the ones you turn down."*

**Say**
- "We don't hide the spread, we surface it. The agent works for the buyer or the farmer, inside guardrails they set — price floors, volume ceilings, counterparty allowlists it will never cross."

---

## Slide 5 — Product / How It Works

**On-slide** (3-step flow)
1. **List** — crop, grade, volume, location, floor price. Any language, any units. No mandi trip.
2. **Bid & negotiate** — verified buyers bid; Gemini-powered agents (Aggressive / Balanced / Conservative) negotiate in real time. Live auctions with anti-sniping.
3. **Verify, transport, settle** — lot inspected for grade/authenticity, third-party logistics arranged, escrow released on delivery.

**Say**
- "Median time to a bound deal in our demo is under a minute, versus minutes-to-days on the phone. And the farmer never leaves the field."

---

## Slide 6 — Product Demo

**On-slide**
- Screenshots: live auction room, negotiation chat, agent config (guardrails), settlement card.
- Headline metric on the deal card: *"+[X]% vs. broker benchmark."*

**Say**
- "Walk through one real negotiation: buyer opens below spot, agent counters on protein premium, match in 3 rounds, contract auto-drafted. [Live demo here.]"

> **TODO:** drop in 3–4 real product screenshots. App is built (React + Express + Postgres, live WebSocket auctions, Gemini negotiation).

---

## Slide 7 — Market Size

**On-slide**
- **TAM** — Global agri commodity trade > **$1.5T/yr**. [Verify source.]
- **SAM** — Digitizable B2B crop procurement in target geographies (India + emerging markets): **$[___]B**.
- **SOM (3-yr)** — GMV we can route through the platform: **$[___]M**.
- Beachhead: **India** — $400B+ agri output, 120M+ farmers, fragmented buy side.

**Say**
- "We start in India because the pain is sharpest and the middleman tax is highest. The model — transparent agent-run auctions — is geography-agnostic, so the same product expands to any export corridor."

> **TODO:** replace TAM/SAM/SOM with sourced figures. Cite FAO / WTO / NABARD / IBEF.

---

## Slide 8 — Business Model

**On-slide**
- **2% platform fee** on settled transaction value (deducted on escrow release).
- Future lines: logistics take-rate, provenance/verification fee, premium agent tiers, financing/working-capital on receivables.
- Revenue scales directly with GMV — no per-seat friction.

**Say**
- "We make money only when a deal closes, so we're aligned with both sides. At 2% of a $1.5T market, even single-digit share is a large business — and logistics + financing expand take-rate over time."

---

## Slide 9 — Traction

**On-slide**
- Product: **fully built** — live auctions, AI negotiation, escrow, trust scores, admin panel, analytics. [link to live app]
- [INSERT real numbers: pilot users, GMV, completed deals, LOIs, waitlist.]
- Early signal: [design partner / FPO / buyer name, or "in conversations with N buyers"].

**Say**
- "The platform is not a mockup — it's running. What we need capital for is to turn a working product into transacted volume."

> **WARNING:** The landing page figures (540 listings, $8.4M GMV, 24 countries) are **static demo data**. Do **not** present them as real traction. Use only verifiable numbers here.

---

## Slide 10 — Go-To-Market

**On-slide**
- **Wedge:** one crop × one corridor (e.g. wheat or rice, single state) → density before breadth.
- **Supply:** partner with FPOs / aggregators to onboard farmer volume fast.
- **Demand:** sign 2–3 anchor buyers (FMCG / processors / exporters) who bring recurring volume.
- Land buyers → they pull their supply chain on → expand crop-by-crop, corridor-by-corridor.

**Say**
- "Marketplaces die from thin liquidity. We go deep on one crop and one region until auctions clear reliably, then replicate. Anchor buyers are the flywheel — they bring the volume that makes it worth a farmer's time."

---

## Slide 11 — Competition & Moat

**On-slide**
- **vs. brokers / mandis** — we surface the spread they hide; transparent + auditable.
- **vs. listing boards (classifieds)** — we negotiate and settle, not just list.
- **vs. commodity exchanges** — we handle physical, graded, sub-carlot lots, farm-to-buyer.
- **Moat:** liquidity (two-sided density), proprietary negotiation/settlement data per crop-corridor, verification + provenance layer, trust-score reputation graph.

**Say**
- "Anyone can build a listings page. The defensibility is the settlement data and the liquidity — every closed deal makes our value model and our reputation graph harder to copy."

---

## Slide 12 — Technology

**On-slide**
- AI: **Google Gemini 2.0 Flash** agents, deterministic guardrails (hard floors/ceilings), low-temperature for predictable negotiation.
- Real-time: **Socket.io** live auctions with anti-sniping.
- Stack: React 19 · Express 5 · PostgreSQL · Prisma · JWT dual-token auth.
- Security/compliance posture: escrow, KYC, provenance credentials (USDA / EU-RED / APMC / NPOP), exportable audit logs.

**Say**
- "The agent is deterministic where it must be — it will not cross a price floor — and flexible only in the negotiation band. That's what makes it safe to let it bind real money."

---

## Slide 13 — Team

**On-slide**
- [Founder] — [role, relevant background: agri / marketplace / AI / domain].
- [Co-founders / key hires].
- [Advisors — agri trade, AI, FPO networks].
- *Why this team wins this market.*

**Say**
- "[Founder story — the personal/insider reason you understand this problem better than anyone.]"

> **TODO:** fill in real bios. Investors fund the team as much as the idea — make the "why us" concrete.

---

## Slide 14 — The Ask

**On-slide**
- Raising **$[___]** [seed / pre-seed].
- Use of funds:
  - [__%] GTM — anchor buyers + FPO onboarding
  - [__%] Engineering — settlement, logistics, provenance
  - [__%] Verification/ops on the ground
- Milestones this round buys: **$[___]M GMV**, [N] anchor buyers, [N] active corridors in [N] months.

**Say**
- "This round takes us from a working product to proven, repeatable liquidity in our beachhead corridor — the proof point that unlocks the Series A."

---

## Slide 15 — Vision / Close

**On-slide**
- *The autonomous procurement layer for global agriculture.*
- Start: fair price discovery for one crop, one corridor.
- End: every bulk crop deal on earth runs transparently, agent-to-agent, farm-to-buyer.
- [Contact / QR to live demo.]

**Say**
- "Every harvest, growers lose margin to opacity. We're rebuilding crop trade to be transparent by construction. Join us."

---

## Appendix (back-pocket slides)

- Unit economics: per-deal revenue, CAC by channel, payback.
- Detailed financial model / 3-yr projection.
- Cohort / retention data once available.
- Regulatory map per geography (APMC, eNAM, export licensing, GAFTA).
- Product roadmap: financing on receivables, insurance, futures.
- Security & compliance deep-dive (escrow flow, KYC, provenance on-chain).

---

### Pre-pitch checklist
- [ ] Replace every `[BRACKET]` and `TODO` with real data.
- [ ] Remove/replace landing-page demo numbers on the traction slide.
- [ ] Add 3–4 real product screenshots (Slide 6).
- [ ] Source every market-size figure (Slide 7).
- [ ] Decide single beachhead crop + corridor and name it (Slides 7, 10).
- [ ] Fill team bios + the "why us" story (Slide 13).
- [ ] Set the actual raise amount and use-of-funds split (Slide 14).
