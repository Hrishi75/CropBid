# CropBid: the one file

**This is the single source of truth for what CropBid is, what it does today, and what it deliberately does not do.**

Claude Code loads this file automatically in every session and every worktree, so it is the one place a cold session can read to catch up.

> **The rule: if you change the product, change this file in the same PR.**
> A new feature, a changed price or promise, a city added or dropped, a decision
> taken or reversed: it lands here. A stale entry is worse than a missing one,
> because it is trusted. Update the section that already covers the area rather
> than appending a second version of it beside the first.
>
> This is not a changelog. Git already has one. Record **why** a fork was taken,
> what was rejected and on what argument, and what is knowingly unbuilt.

---

## 1. What CropBid is

An agricultural marketplace connecting Indian farmers directly with buyers, with three channels on one set of listings:

| Channel | Who | How they buy |
|---|---|---|
| **Wholesale** | Processors, exporters, retailers, restaurants, FMCG | Bid, counter, or timed auction on a whole lot. National. |
| **Demand board** | Buyers post what they need | Farmers fill at the posted price or make an offer |
| **Retail** | Households | Browse by shop, buy by the kilo. Pune and Nagpur only. |

Every listing is anchored to the day's government mandi rate (AGMARKNET, 4,600+ mandis) so both sides negotiate against the same public reference price. Money is captured into escrow via Razorpay and settles after delivery is confirmed. **Read §7 before writing anything about payouts.**

Alongside those three channels sit **two lead-gen marketplaces** that sell the farmer their *inputs* rather than buying their output: `/equipment` (machinery to buy or hire) and `/inputs` (seed, fertiliser, crop protection). They are a different shape from everything above and §5 is the section that governs them.

Languages: English, Hindi, Marathi. Sign-in is phone + 6-digit code; passwords exist but are the secondary lane.

## 2. Business facts

- **India only.** Governing law India, jurisdiction Pune, Maharashtra *(unconfirmed, so confirm it before it matters)*.
- **Not yet incorporated.** Incorporation in progress. `/terms` and `/privacy` say so outright rather than naming a company that does not exist. Wired to an `OPERATOR` constant in `client/src/pages/TermsPage.tsx`. **Fill it the day the certificate arrives** and the interim wording disappears on its own.
- The footer must not say "CropBid, **Inc.**", a US suffix on an unincorporated Indian business. It did for a long time.
- **Fee: flat 2% on a settled deal** (`PLATFORM_FEE_PERCENT`, `transaction.service.ts`). Listing, accounts and mandi rates are free.
- **Retail footprint: Pune and Nagpur.** Wholesale is national, because a lot can be freighted and a few kilos cannot.

## 3. The consumer model (shipped 2026-09-02, #127)

**Shop-first, not aggregated SKUs.** A shopper picks a city, then a shop, then what is on its shelf. The same crop legitimately costs different amounts at different shops (₹24/kg at one Pune shop, ₹28 at another) and **that difference is the point, not noise to average away**.

The user overruled product-first aggregation twice, correctly:

> "if we build something like that there is already blinkit and instamart for that... these local sellers have built trust from years so build it by shop"

Aggregation is Blinkit/Instamart's turf, won on capital and dark stores. Shop identity is the one thing their model structurally cannot copy, because it is built on making the source invisible.

It also sidesteps a real blocker: `Listing.cropName` is free text, so "Tomato"/"tomatoes"/"Tamatar" are three products. Merging them into one card means inventing a match nobody verified; grouping by seller uses a real foreign key. A canonical `Product` catalogue is still needed for **cross-shop search**, which does not exist.

### Two delivery lanes

Derived from `SellerType`, **never stored**, because it is a function of who is selling, so a stored copy could only disagree.

| Lane | Seller | Promise |
|---|---|---|
| Quick | `LOCAL_SHOP` | Arrives today |
| Scheduled | `FARMER`, `WHOLESALER` | At your door tomorrow morning |

Shown on the storefront, shop page, cards, cart (grouped, so a two-delivery basket says so) and checkout.

### Kilograms

The retail surface is kg end to end, showing grams below 1 kg. A picker opens at **1 kg** (`Math.min(1, stock)`), steps by 500 g, and **500 g is the floor** (`STEP_KG`), where the minus button becomes a remove.

**The cart stores kilograms, not the seller's unit.** Half a kilo of a quintal lot is `0.005`, and 2dp rounding turns that into `0.01`, ordering double. Conversion back to the seller's unit happens in exactly one place, `Checkout.tsx`, at 6dp, using the **live** listing unit rather than the cart snapshot.

### Routes worth not confusing

- `/store/:id` is one seller's whole counter (public)
- `/shop/:id` is one lot (consumer-only)

Different words on purpose: a path pair differing by one letter gets mixed up at 2am.

## 4. Selling is gated

Farmers, local shops and wholesalers **apply and are reviewed by a human** before they can list or trade (`PartnerStatus`). Volume buyers too. Households are not gated: a phone number is enough.

`FarmerProfile` is really a *seller* profile; `sellerType` says which kind. Read it that way.

## 5. The two lead-gen marketplaces

`/equipment` and `/inputs` share one shape, and it is **not** the trading shape. Get this wrong and the legal position goes with it.

- **Neither creates a `Transaction`, a `Bid`, or touches Razorpay.** They write `EquipmentEnquiry` / `AgriInputEnquiry` rows. Leads, not orders. CropBid takes no payment for a tractor or a bag of urea.
- **Dealers and suppliers are not `User`s.** No login, no self-serve, so there is **no write API**. Both catalogues are loaded by hand from a file (§8). If either ever gets self-service, the row gains an optional `userId` rather than being replaced.
- **The contact rule.** A partner's phone number is returned by **exactly one function**, `createEnquiry`, which requires auth. Browse and detail expose name, location, rating and verified status only. That is what stops the catalogue being harvested into a contact list, and it is the same instinct as `contactVisibility.ts` on the trading side. **A new read path must not include `contactPhone`.**

### The licence rule (inputs only, and it is the load-bearing one)

Selling seed, fertiliser or pesticide in India is a licensed trade: the **Seeds (Control) Order 1983**, the **Fertiliser (Control) Order 1985**, the **Insecticides Act 1968**. Licences are issued per state, per premises, by the state agriculture department.

CropBid holds none of them and must never need to. That is only true while **CropBid does not own the stock**: the shop is seller of record. It also leaves spurious-seed liability with the licensed seller whose label is on the packet rather than with the platform, which matters because a failed seed lot is among the most litigated claims in Indian agriculture.

`SELLABLE` in `agriInput.service.ts` is therefore a **query filter, not a post-filter**. Every read path composes it, so browse, detail, meta and enquiry are bound by the same rule and a guessed URL cannot walk around it. **Do not "simplify" it into a `.filter()` after the fetch.**

`ORGANIC`, `MICRONUTRIENT` and `SEEDLING` are ungated on purpose. Vermicompost, a zinc supplement and a mango sapling are not controlled the way certified seed is, and gating them would empty the catalogue for no legal gain.

**Corollary, and the one to remember: never make CropBid buy and resell inputs.** That needs all three licences in every state it operates, plus the crop-failure liability it currently does not carry. Any "we could hold stock and margin on it" proposal starts here.

Licence *numbers* never leave the server. Clients get booleans, enough to render "licensed seed dealer" without publishing a document reference someone could copy onto a fake shopfront.

### Smaller calls worth not reversing

- **Crop leads the filter on `/inputs`, not category.** A farmer does not want "fertiliser", they want to know what goes on cotton, and it is the one filter they can always complete without knowing a product name.
- **Prices are per pack**, because that is how the trade sells: seed in 475g packets, urea in 45kg bags. A per-kg price would make every screen reconstruct the number the farmer actually pays.
- **Urea, DAP and MOP carry a statutory MRP.** Those rows are flagged `subsidised`, and the page says the price is set by government, identical at every licensed shop, and that paying more is overcharging reportable to the district agriculture officer. Presenting a controlled price as this shop's own offer would be misleading.

## 6. Public policy pages

`/terms`, `/privacy`, `/faq`, all linked from the footer. **Every claim in them must be true of the code today.** They are written to that rule and it has been broken before:

- The FAQ structured data lived on `/how-it-works` with no matching visible content for months, which is a Google policy violation. FAQ questions and their JSON-LD are now both generated from `client/src/content/faq.ts`, so a question cannot exist in the markup without appearing on the page.
- Accordion answers use native `<details>`, **not `hidden`**. `hidden` is as invisible to Ctrl-F as it is to a reader.
- Privacy must disclose Vercel Analytics, browser storage, and that a seller gets the buyer's contact details **when payment clears**, not at checkout (`contactVisibility.ts`).

Still missing for Razorpay live-mode onboarding: **standalone Shipping/Delivery and Contact pages**. Delivery is §8 of the terms, which may or may not satisfy them, so check the dashboard checklist.

## 7. Known gaps: read before touching payments or copy

**Settlement moves no money.** Capture is real; money genuinely reaches the platform account. But the release (inside `updateDeliveryStatus`, when the buyer confirms) and `refundTransaction` **only update a database column**. Paying a seller's bank needs Razorpay Route (not built), and the refund path never calls Razorpay's refund API at all. Every payout and refund is a manual bank transfer.

It is invisible in the UI: an order reads "Released" and looks finished. **Never write copy promising an automatic payout.**

**Price is unbound at checkout.** Web and mobile send listing + quantity; the server recomputes `totalAmount` from the live `retailPricePerUnit`. A seller re-pricing between the bill and the request charges an amount the shopper never approved. Fix is the same shape as the unit guard that already ships: send the agreed price, refuse a mismatch.

**No cancellation path.** Not in the consumer UI, transaction routes, or the order state machine. Only an admin refund undoes an order, which is why the terms say there is no cancel button.

**Seed data still global.** Farmers in the USA, Brazil, Kenya, Australia and the UK, and USD/EUR/GBP in the currency enum. If "India only" extends to the product and not just the legal basis, that needs a pass. The seeded sugarcane lot is priced ₹420/tonne, roughly a tenth of reality.

## 8. Running it locally

Ports matter: **API on 5001** (the Vite proxy target; 5000 is macOS ControlCenter).

```bash
# API: pass an explicit local DATABASE_URL; server/.env points at production
DATABASE_URL=postgresql://<user>@localhost:5432/cropbid_dev PORT=5001 npm run dev
```

- Postgres runs natively (pg@18 on :5432). `docker compose` does **not** work on this machine.
- In a worktree, `server/src/generated` must be a real directory containing a `prisma` symlink.
- No SMTP/WhatsApp configured locally → **OTP codes and emails print to the API log.**
- Blank Razorpay keys → payment endpoints return 503 and everything else works.
- Blank `DATA_GOV_API_KEY` → rates fall back to static reference prices, badged `ref`. This is also true in production and looks like a UI bug but is not.

Both marketplace catalogues are loaded by hand, never through an API. Pass an explicit `DATABASE_URL`, because `server/.env` points at production:

```bash
cd server
npx ts-node prisma/seedEquipment.ts    # machinery
npx ts-node prisma/seedAgriInputs.ts   # seed, fertiliser, crop protection
```

Both are **additive and idempotent**: insert and update only, never delete, so they are safe against production and a re-run corrects prices in place. `active` is never written on update, so a row taken off the catalogue by hand stays off. `prisma/seed.ts` is the opposite, wiping every table first, and is development-only.

`seedAgriInputs.ts` warns when a product loaded but is **hidden** by the licence gate. A gap between "written" and "live" means a catalogue row names a shop not licensed for that category: fix the licence or drop the row, because it is invisible either way.

**CI runs the server test suite** (`Test (vitest)` in the server job, `.github/workflows/ci.yml`). The client job is lint + build and the mobile job is typecheck, neither of which runs tests, because neither has a suite. Client typecheck needs `tsc -b`, not `tsc --noEmit` (project references).

## 9. Working agreements

- **No "Claude"/AI attribution** in commit messages, PR bodies, or branch names. Rename auto-created `claude/*` branches to `feature/<slug>`.
- **No em dashes** in prose. Commas, colons, full stops.
- `main` is protected: squash merges only (linear history), branches must be up to date, and **unresolved review conversations block the merge**.
- The user runs many parallel sessions across git worktrees and commits concurrently. **Verify branch state before any destructive git operation**, and never use bare `git stash`, because the stash stack is shared.
- Verification is lightweight: build, typecheck, run the suites, check the dev server. No Playwright installs.
