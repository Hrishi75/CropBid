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
- **Fee: flat 2% on a settled deal** (`PLATFORM_FEE_PERCENT`, `transaction.service.ts`). Listing, accounts and mandi rates are free. Freight is charged separately and on top, see §2a.
- **Retail footprint: Pune and Nagpur.** Wholesale is national, because a lot can be freighted and a few kilos cannot. **But read §2a before repeating "national":** if every wholesale lot has to be physically inspected, wholesale reaches as far as the inspectors do, and today that is nobody.

### 2a. Freight is ours (shipped 2026-09-06)

**CropBid books the carrier. The seller pays for it. Neither side learns who the carrier is.**

The reason for all three is quality: we inspect the goods on the way through, and an inspection carried out by a truck the seller hired is not an inspection. Owning the booking is what makes the check real.

- **Booking is ADMIN-only** on the server: `/logistics/partners/:transactionId`, `/quote`, `/book`, and the status and driver updates. The farmer and buyer keep two GETs and proof-of-delivery upload. `BookTransport` moved to `/admin/logistics/book/:transactionId`.
- **A closed deal pages ops.** `createTransaction` fires `notifyAdminsDealClosed` to every ADMIN account (`DEAL_NEEDS_TRANSPORT`), and the bell deep-links it to the booking form rather than `/transactions/:id`, which would 403 an admin because `getTransaction` authorises on `farmerId`/`buyerId` only. It is not awaited: `createTransaction` may be running inside an interactive `Prisma.TransactionClient`, and a notification must never roll back a settled deal.
- **The queue is derived, not stored.** `GET /admin/attention` returns transactions with no shipment, oldest first, and fills the "Needs attention" panel that was a placeholder until now. Because it reads deal state rather than notification rows, a missed or failed ping cannot lose the job. Add disputes and KYC failures as further queries into the same shape; do not invent a triage table. The panel distinguishes an empty queue from a failed fetch, since "All clear" is a claim.
- **Ways in:** the bell, the Needs-attention panel, or a **Book delivery** link on the row in Admin → Transactions.
- **Carrier identity is stripped at the API**, in `forShipmentViewer()` (`logistics.service.ts`): `logisticsPartner`, `driverPhone` and `platformCommission` never reach a trader. The transaction list drops the `logisticsPartner` include for non-admins too, and the shipment-booked notification no longer names the haulier. Hiding it in the UI alone would have left three ways round it.
- **`paidBy` is not an input.** `bookShipment` writes `FARMER` unconditionally and the request schema has no field for it, so there is no request that can bill the buyer for freight. `SPLIT` stays in the enum only for rows booked before this rule.
- **The seller is told twice, before the money moves**: a lede on Deliveries, and a `Delivery (paid by seller)` line in the settlement breakdown on `TransactionDetail`. The breakdown shows an amount only once a shipment exists, and says "on booking" before that, because a placeholder on a settlement screen reads as a real figure.

**Unresolved, and worth resolving before this scales:** flat 2% now has to cover software, escrow, freight booking *and* a person driving out to look at the goods. That may want a wholesale-tier fee. It is a decision nobody has taken, not a detail.

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

### Everyone arrives as a shopper (fixed 2026-09-06)

**You apply from inside a signed-in CONSUMER account, and approval is what grants the role.**

The application is a form, not an account. So `/auth/onboarding/{farmer,buyer}` accept CONSUMER (that is who applies) as well as FARMER/BUYER (resubmission after `NEEDS_INFO`), and `reviewPartnerApplication` promotes the user on APPROVE, with a narrow `updateMany` that only touches a row still sitting at CONSUMER so it can never demote an admin.

It used to be the other way round: the role was granted at signup and `PartnerStatus` gated what you could do with it. That made the partner door reachable **only by someone who was already a partner**, and a signed-in shopper who clicked "Apply as farmer" was asked to sign in again. Four separate walls, all the same mistake, worth knowing about because the shape recurs: **the role you are applying for cannot also be the entry requirement.**

1. `PartnerPage.onApply` called `openAuth()` unconditionally, never checking `user`
2. `OnboardingPage` picked the form from `user.role`, so a consumer clicking "Apply as farmer" was handed the **buyer** form
3. the routes were `requireRole('FARMER')` / `requireRole('BUYER')`
4. `completeFarmerOnboarding` re-checked the same thing inside the service

Order of precedence when choosing which form to show: an application already on file, then the subtype parked by the card they clicked (`PARTNER_TYPE_KEY`), then `user.role`. A resubmitting farmer must get their own form back even with a stale hint in `sessionStorage`.

**Still inconsistent:** mobile `SignupScreen` keeps FARMER/BUYER/CONSUMER pills and defaults to FARMER, and the password-signup path writes `role: input.role`. Both still mint partners at signup. The web phone flow is the one that matches this section.

**Unresolved:** roles are exclusive, so an approved seller cannot use the cart (`/cart`, `/checkout`, `/orders` are `allowedRoles={['CONSUMER']}`). If selling should stack on top of shopping rather than replace it, that is a role-to-capabilities refactor, and nobody has decided it.

## 5. Public policy pages

`/terms`, `/privacy`, `/faq`, all linked from the footer. **Every claim in them must be true of the code today.** They are written to that rule and it has been broken before:

- The FAQ structured data lived on `/how-it-works` with no matching visible content for months, which is a Google policy violation. FAQ questions and their JSON-LD are now both generated from `client/src/content/faq.ts`, so a question cannot exist in the markup without appearing on the page.
- Accordion answers use native `<details>`, **not `hidden`**. `hidden` is as invisible to Ctrl-F as it is to a reader.
- Privacy must disclose Vercel Analytics, browser storage, and that a seller gets the buyer's contact details **when payment clears**, not at checkout (`contactVisibility.ts`).

### The cookie notice (shipped 2026-09-03)

`components/ui/CookieNotice.tsx`, mounted in `App.tsx` beside Toaster and Analytics so the prerender never bakes it into the static markup. A bottom-left card, dismissed with one button. It links to `/privacy#cookies`, which is a real anchored section, reached by an effect on the page because a client-side route change does not make the browser jump to a hash on its own.

**It shows once per visit, not once ever.** The dismissal is kept in `sessionStorage` under `cb-cookie-notice`, so it silences the card for the rest of that visit across every page they open, and the next visit starts clean. That was the user's call, and it is the safer one: a permanent dismissal means someone who read this months ago never sees it again even after what we store has changed underneath them. Do not "improve" it back to `localStorage`. The cost is that a regular shopper is told every visit, which is why the card stays small and corner-pinned instead of growing into a banner.

**It is a notice, not a consent gate, and that is a decision rather than a shortcut.** CropBid sets exactly one cookie: the httpOnly `refreshToken` in `REFRESH_COOKIE_OPTIONS` (`auth.controller.ts`), which nobody who never signs in ever receives. Everything else on the visitor's device is localStorage the site cannot run without: basket, delivery city, language, the idle-timeout clock. Nothing optional is set, so Accept/Reject buttons would be a promise that rejecting turns something off, when one of them would do nothing at all.

**The day anything optional is added, this component is the wrong thing to edit.** An analytics or advertising cookie needs real prior consent: off by default, a reject that works, and a way to change the answer later. The current copy and the privacy page both say we would ask first, so shipping a tracker behind this notice would make two published pages false.

Still missing for Razorpay live-mode onboarding: **standalone Shipping/Delivery and Contact pages**. Delivery is §8 of the terms, which may or may not satisfy them, so check the dashboard checklist.

## 6. Known gaps: read before touching payments or copy

**Settlement moves no money.** Capture is real; money genuinely reaches the platform account. But the release (inside `updateDeliveryStatus`, when the buyer confirms) and `refundTransaction` **only update a database column**. Paying a seller's bank needs Razorpay Route (not built), and the refund path never calls Razorpay's refund API at all. Every payout and refund is a manual bank transfer.

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

**CI runs the server test suite** (`Test (vitest)` in the server job, `.github/workflows/ci.yml`). The client job is lint + build and the mobile job is typecheck, neither of which runs tests, because neither has a suite. Client typecheck needs `tsc -b`, not `tsc --noEmit` (project references).

## 8. Working agreements

- **No "Claude"/AI attribution** in commit messages, PR bodies, or branch names. Rename auto-created `claude/*` branches to `feature/<slug>`.
- **No em dashes** in prose. Commas, colons, full stops.
- `main` is protected: squash merges only (linear history), branches must be up to date, and **unresolved review conversations block the merge**.
- The user runs many parallel sessions across git worktrees and commits concurrently. **Verify branch state before any destructive git operation**, and never use bare `git stash`, because the stash stack is shared.
- Verification is lightweight: build, typecheck, run the suites, check the dev server. No Playwright installs.
