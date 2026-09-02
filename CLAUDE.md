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

Every listing is anchored to the day's government mandi rate (AGMARKNET, 4,600+ mandis) so both sides negotiate against the same public reference price. Money is captured into escrow via Razorpay and settles after delivery is confirmed. **Read §6 before writing anything about payouts.**

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

The retail surface is kg end to end, grams below 1 kg, opening at 1 kg and stepping by 500 g.

**The cart stores kilograms, not the seller's unit.** Half a kilo of a quintal lot is `0.005`, and 2dp rounding turns that into `0.01`, ordering double. Conversion back to the seller's unit happens in exactly one place, `Checkout.tsx`, at 6dp, using the **live** listing unit rather than the cart snapshot.

### Routes worth not confusing

- `/store/:id` is one seller's whole counter (public)
- `/shop/:id` is one lot (consumer-only)

Different words on purpose: a path pair differing by one letter gets mixed up at 2am.

## 4. Selling is gated

Farmers, local shops and wholesalers **apply and are reviewed by a human** before they can list or trade (`PartnerStatus`). Volume buyers too. Households are not gated: a phone number is enough.

`FarmerProfile` is really a *seller* profile; `sellerType` says which kind. Read it that way.

## 5. Public policy pages

`/terms`, `/privacy`, `/faq`, all linked from the footer. **Every claim in them must be true of the code today.** They are written to that rule and it has been broken before:

- The FAQ structured data lived on `/how-it-works` with no matching visible content for months, which is a Google policy violation. FAQ questions and their JSON-LD are now both generated from `client/src/content/faq.ts`, so a question cannot exist in the markup without appearing on the page.
- Accordion answers use native `<details>`, **not `hidden`**. `hidden` is as invisible to Ctrl-F as it is to a reader.
- Privacy must disclose Vercel Analytics, browser storage, and that a seller gets the buyer's contact details **when payment clears**, not at checkout (`contactVisibility.ts`).

Still missing for Razorpay live-mode onboarding: **standalone Shipping/Delivery and Contact pages**. Delivery is §8 of the terms, which may or may not satisfy them, so check the dashboard checklist.

## 6. Known gaps: read before touching payments or copy

**Settlement moves no money.** Capture is real; money genuinely reaches the platform account. But `releaseFunds` and `refundTransaction` **only update a database column**. Paying a seller's bank needs Razorpay Route (not built), and the refund path never calls Razorpay's refund API at all. Every payout and refund is a manual bank transfer.

It is invisible in the UI: an order reads "Released" and looks finished. **Never write copy promising an automatic payout.**

**Price is unbound at checkout.** Web and mobile send listing + quantity; the server recomputes `totalAmount` from the live `retailPricePerUnit`. A seller re-pricing between the bill and the request charges an amount the shopper never approved. Fix is the same shape as the unit guard that already ships: send the agreed price, refuse a mismatch.

**No cancellation path.** Not in the consumer UI, transaction routes, or the order state machine. Only an admin refund undoes an order, which is why the terms say there is no cancel button.

**Seed data still global.** Farmers in the USA, Brazil, Kenya, Australia and the UK, and USD/EUR/GBP in the currency enum. If "India only" extends to the product and not just the legal basis, that needs a pass. The seeded sugarcane lot is priced ₹420/tonne, roughly a tenth of reality.

## 7. Running it locally

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

**CI runs typecheck and build only. It does not run the test suites.** Run `npx vitest run` in `server/` by hand before merging. Client typecheck needs `tsc -b`, not `tsc --noEmit` (project references).

## 8. Working agreements

- **No "Claude"/AI attribution** in commit messages, PR bodies, or branch names. Rename auto-created `claude/*` branches to `feature/<slug>`.
- **No em dashes** in prose. Commas, colons, full stops.
- `main` is protected: squash merges only (linear history), branches must be up to date, and **unresolved review conversations block the merge**.
- The user runs many parallel sessions across git worktrees and commits concurrently. **Verify branch state before any destructive git operation**, and never use bare `git stash`, because the stash stack is shared.
- Verification is lightweight: build, typecheck, run the suites, check the dev server. No Playwright installs.
