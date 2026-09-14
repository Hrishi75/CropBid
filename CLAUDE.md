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
- **Fee: flat 2% on a settled deal** (`PLATFORM_FEE_PERCENT`, `transaction.service.ts`). Listing, accounts and mandi rates are free, and **onboarding is free**: there is no signup charge anywhere in the codebase, so nothing on screen may imply one. Freight is charged separately and on top, see §2a.
- **Minimum retail order: ₹150** (`MIN_RETAIL_ORDER`, `bid.service.ts`). **The web cart does not know about it**: only the app calls `/browse/retail-rules`, so a shopper on the site fills a ₹80 basket, is told nothing, and is refused at checkout. Same bug the app had until it was fixed; the fix has not been ported. Below it a delivery run costs more than the order is worth, and 2% of a ₹40 basket is 80 paise. Enforced on the server, and served to clients at `GET /browse/retail-rules` so the app reads the number rather than keeping a second copy that drifts. **It is per ORDER, not per basket**, and retail checkout places one order per lot. The cart therefore checks each line against the floor and names the ones that are short: comparing the basket TOTAL was worse than no gate at all, because two ₹100 lots passed as a ₹200 basket and were then both refused at the till. It compares the **unrounded** `price * quantity`, the server's own basis, not the paise-rounded `lineTotal` the row displays, or ₹149.995 shows as ₹150 and passes a gate the server then fails. Making it genuinely a basket rule means telling the server about the basket, which it is never told.
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

### 3a. One app, and its front page is the shops (decided 2026-09-13)

**There is one phone app, `mobile/`.** PRs #136 and #137 would have made two: a separate `cropbid-daily/` Expo project for households, and a trade-only `mobile/`. Both are closed, branches kept. The argument for splitting was that a farmer wants quintals and a household wants grams; the argument against is the user's, and it wins: everyone signs in to the same shelf, and trading is applied for on top. One install, one brand, and the partner pitch lands in front of every shopper rather than only those who already found the seller app.

`config.corsOrigins` came across from #136 but **not for the reason that PR gave**. It is not about two products: `expo start --web` serves the app from its own origin during development, which is a second origin whatever the product count.

**Home has two lanes, and the shop is the unit.**

| Lane | Who | Promise |
|---|---|---|
| **Local shops** (default) | `LOCAL_SHOP` sellers holding stock | Arrives today |
| **Fresh** | `FARMER` / `WHOLESALER` | Bought at tomorrow's mandi, delivered that morning |

- **Local shops lists shops, not crops** (`components/ShopCard`, `GET /browse/shops`). Tapping one opens its whole counter (`screens/ShopScreen`). The same tomato at ₹24 in one shop and ₹28 in another is the point, not noise to average away.
- **Only sellers holding live retail stock come back** from that endpoint, so a newly onboarded shop appears the moment it lists something and drops off when it sells out. That is the endpoint's behaviour, not a filter any client remembers to apply.
- **Fresh is the farm side only.** A local shop's items are reachable through its shop page, so leaving them in the crop rails too would put the same tomato on screen twice under two contradictory promises.
- **The cutoff is a real constraint** (`lib/freshWindow`, `components/FreshBanner`): a live HH:MM:SS clock to midnight, because Fresh is a BATCH bought at one mandi run, not a speed. It names the arrival **day**, since "tomorrow morning" at 11pm on a Sunday is ambiguous exactly when it matters. At 00:00:00 it rolls to the next midnight rather than showing a dead state.
- **"Everything we deliver"** (`components/DeliveryList`) is the full list with **multiple SKUs per row**. Sizes come off a fixed ladder (100 g → 10 kg) anchored to each crop's own base pack, so a spice never starts at a kilo and a staple never starts at 100 g; doubling a 200 g paneer pack would give 400 g and 800 g, which no shop sells. Sizes above remaining stock are dropped. The caller computes the variants so the heading's count matches the rows that actually render.
- **Farmers and buyers see no lanes.** They get the crop-rail market, which is the right view for a by-the-tonne national trade.

**The seed carries the Fresh lane.** Indian farmers are spread across fifteen cities for the wholesale market and only Pune and Nagpur are retail cities, so almost no farm lot landed anywhere a household could be delivered from and the lane showed one item. `seed.ts` §7c adds four farms in the two retail cities.

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

**The app matches now (2026-09-13).** `SignupScreen` has no role picker: it writes `CONSUMER` and says so before anything is typed. The door is the **Partner tab** (`screens/partner/JoinScreen`), a permanent slot in the consumer tab bar because every account starts as a shopper, so that bar is what every new user sees. It hands the chosen kind DOWN to `OnboardingScreen` as a `kind` prop instead of letting it re-read `user.role`, which is mistake #2 above one layer along. Once an application is on file the tab reports its status rather than offering the form again.

**The app asks WHICH KIND before the form, on both sides (2026-09-14).** Tapping "I sell" used to go straight to a farm application: acreage, crops grown, FPO affiliation. A kirana store owner was asked how many acres they farm, and whatever they typed was filed as `sellerType: FARMER`, because the app never sent one and the column defaults to it. **Every seller who ever applied through the app is a FARMER in the database whatever they actually are.**

The server was always ready for this: `validateSellerApplication` has required a different set per kind since the column existed, and the app simply never sent `sellerType`, `businessName`, `shopType`, `address`, `fssaiLicense` or `gstin`.

| Kind | The form asks for |
|---|---|
| Farm | acreage, crops, FPO and APMC |
| Local shop | shop name, shop type, address, **FSSAI licence** |
| Wholesaler | firm name, **GSTIN** |

Buyers get the same shape: which of the seven company types, then the form. The type is chosen on the step before and **the form no longer asks again**, because two pickers for one field invite two answers. The old in-form chip row defaulted to `PROCESSOR`, so any buyer who did not notice it was filed as one, and it offered five of the seven: `WHOLESALER` and `SMALL_BUSINESS` could not be selected at all.

Every step has a back arrow, and a resubmitting seller's existing type seeds the picker so they are not made to re-declare what they already are.

**A pending applicant keeps their basket, and that needed a split** in `mobile/src/lib/partner.ts`:

- `partnerApplication()` reads the profile **whatever role holds it**. Gating on the role returned null for exactly the people who need to see "under review", since an applicant is a CONSUMER until a reviewer promotes them.
- `isPendingPartner()` keeps the role check, because it decides *navigation*: it exists to keep an unapproved FARMER out of a dashboard where every action 403s. A CONSUMER waiting on a decision has no such dashboard.

**The web still has the narrow version** (`client/src/utils/partner.ts` gates on `user.role`), so a pending applicant on the site sees nothing about their application. Same fix, not made here.

**Unresolved, and now more visible:** roles are exclusive, so an approved seller cannot use the cart (`/cart`, `/checkout`, `/orders` are `allowedRoles={['CONSUMER']}`; `POST /bids/direct-purchase` is `requireRole('CONSUMER')`). `ShopScreen` renders the shelf read-only for them rather than 403ing at checkout, and `JoinScreen` warns before they apply, but both are plasters. If selling should stack on top of shopping, that is a role-to-capabilities refactor nobody has decided.

## 5. Public pages

`/terms`, `/privacy`, `/faq` and `/how-it-works`, all linked from the footer. **Every claim in them must be true of the code today.** They are written to that rule and it has been broken before:

- The FAQ structured data lived on `/how-it-works` with no matching visible content for months, which is a Google policy violation. FAQ questions and their JSON-LD are now both generated from `client/src/content/faq.ts`, so a question cannot exist in the markup without appearing on the page.
- Accordion answers use native `<details>`, **not `hidden`**. `hidden` is as invisible to Ctrl-F as it is to a reader.
- Privacy must disclose Vercel Analytics, browser storage, and that a seller gets the buyer's contact details **when payment clears**, not at checkout (`contactVisibility.ts`).

### The cookie notice (shipped 2026-09-03)

`components/ui/CookieNotice.tsx`, mounted in `App.tsx` beside Toaster and Analytics so the prerender never bakes it into the static markup. A bottom-left card, dismissed with one button. It links to `/privacy#cookies`, which is a real anchored section, reached by an effect on the page because a client-side route change does not make the browser jump to a hash on its own.

**It shows once per visit, not once ever.** The dismissal is kept in `sessionStorage` under `cb-cookie-notice`, so it silences the card for the rest of that visit across every page they open, and the next visit starts clean. That was the user's call, and it is the safer one: a permanent dismissal means someone who read this months ago never sees it again even after what we store has changed underneath them. Do not "improve" it back to `localStorage`. The cost is that a regular shopper is told every visit, which is why the card stays small and corner-pinned instead of growing into a banner.

**It is a notice, not a consent gate, and that is a decision rather than a shortcut.** CropBid sets exactly one cookie: the httpOnly `refreshToken` in `REFRESH_COOKIE_OPTIONS` (`auth.controller.ts`), which nobody who never signs in ever receives. Everything else on the visitor's device is localStorage the site cannot run without: basket, delivery city, language, the idle-timeout clock. Nothing optional is set, so Accept/Reject buttons would be a promise that rejecting turns something off, when one of them would do nothing at all.

**The day anything optional is added, this component is the wrong thing to edit.** An analytics or advertising cookie needs real prior consent: off by default, a reject that works, and a way to change the answer later. The current copy and the privacy page both say we would ask first, so shipping a tracker behind this notice would make two published pages false.

### The app reads these very pages (2026-09-14)

`/terms`, `/privacy` and `/faq` are shown inside the phone app rather than copied into it, so one document serves both surfaces. Two copies of something held to the standard above is two places to keep true, and the app's is the one nobody would remember.

**`?app=1` strips the website off the document** (`client/src/utils/embedded.ts`). Without it a shopper reading the terms in the app gets a cookie banner about browser storage they are not using, a nav bar offering "Marketplace" and "Sign in" that would navigate the frame out of the app, and a site footer. `CookieNotice` returns null on that flag before it even checks `sessionStorage`, so an app view cannot dismiss the notice on a browser visitor's behalf.

**A query param, not a frame check.** `window.self !== window.top` catches the web iframe and is FALSE in a native WebView, which renders the page as the top-level document, so every real phone would have kept the chrome.

**Nothing changes for a browser visitor.** Every hide is conditional on the flag, which only the app sends.

### `/how-it-works` drifts, and it drifted badly (rewritten 2026-09-14)

The marketing page is held to the same rule as the legal ones and it is the one that breaks, because a product change lands in code and nobody thinks of the landing page. Six claims were on screen and untrue when it was audited:

| On the page | What the code does |
|---|---|
| "the agent watches lots and bids for you" | `agent.service` exports get-config, set-config, toggle. No scheduler exists. What ships is two-sided: with BOTH agents active, either party hands one bid over and they negotiate it out |
| "Book a transport partner in-app" | Booking went ADMIN-only in #133, and the seller pays |
| households have "no minimums" | `MIN_RETAIL_ORDER` refuses anything under ₹150 |
| "16 crops rated & forecast" | The board carries 30, and the forecast maps over the same list |
| "verifies every lot ourselves" | We do not test lots, which the Quality section on that same page said in as many words |
| "No passwords, ever" | Password sign-in is a real second lane |

Review then caught **three more that the rewrite introduced**, which is the same failure one turn later, so they are worth naming:

- "the load gets checked on the way through". Owning the booking is what would MAKE an inspection possible and that is the whole argument in §2a, but `ShipmentStatus` runs `PENDING_PICKUP → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED` with no inspection step, no result field, and §2a itself says nobody does it today. **Writing the rationale as though it were the feature** is how this one gets made; the honest line is that we book the carrier so the delivery is ours to answer for.
- "the app counts down to the nightly cutoff". True of `mobile/lib/freshWindow`, wrong to put on the website, where the reader has no such clock and no server refuses a late order either.
- **"grower" is not a synonym for "seller".** Fixing the scope word above, I reached for "ordered separately from its grower", on the very page arguing that a kirana is not a farm. The whole retail flow had it: the cart's reprice line, its empty state, the phone-number hint on checkout, and three lines of `BillDetails` including "Paid by the grower". The comments above those strings said grower too, which is where each new one came from, so they were changed with them. `grower` is now correct only where the subject really is a farm (the mission quote, the agent looking for growers, "no farm is selling direct"). See §9.
- "₹150 per seller". **It is per LOT.** Checkout posts one `directPurchase` per line, so two ₹100 lots from the SAME grower are two ₹100 orders and both are refused. The app's cart note and its checkout button said "seller" too, three elements above a `BillDetails` line already saying "one per lot", and the server's own error said "this seller's items". All four fixed together.

Two of those had a working contradiction elsewhere on the same page, which is the tell: **when a page argues with itself, one half is stale.** Also added, because they were simply missing: the household shelf (shop-first, the two lanes, Pune and Nagpur, 500 g, the ₹150 floor), the three seller kinds and their licences, and the fact that **freight is billed to the seller**, which an applicant could previously not learn from any public page.

**The freight line is on `/how-it-works` but not on `/partner`**, which is the page somebody actually applies from. Same disclosure, not made there yet.

**The nav on this page hides at 1240px, not the 960px the other landing pages use** (`.hiw-nav`). It carries eight links where they carry four, and `.nav` is a space-between row with nothing stopping the middle group colliding with the wordmark. It had been overlapping for a while at ordinary laptop widths.

Still missing for Razorpay live-mode onboarding: **standalone Shipping/Delivery and Contact pages**. Delivery is §8 of the terms, which may or may not satisfy them, so check the dashboard checklist.

## 6. Known gaps: read before touching payments or copy

**Settlement moves no money.** Capture is real; money genuinely reaches the platform account. But the release (inside `updateDeliveryStatus`, when the buyer confirms) and `refundTransaction` **only update a database column**. Paying a seller's bank needs Razorpay Route (not built), and the refund path never calls Razorpay's refund API at all. Every payout and refund is a manual bank transfer.

It is invisible in the UI: an order reads "Released" and looks finished. **Never write copy promising an automatic payout.**

**Price is unbound at checkout.** Web and mobile send listing + quantity; the server recomputes `totalAmount` from the live `retailPricePerUnit`. A seller re-pricing between the bill and the request charges an amount the shopper never approved. Fix is the same shape as the unit guard that already ships: send the agreed price, refuse a mismatch.

**No cancellation path.** Not in the consumer UI, transaction routes, or the order state machine. Only an admin refund undoes an order, which is why the terms say there is no cancel button.

**Credits cannot buy anything yet.** The wallet (§9) takes real money in and the credits exist, but `spend()` on the server has no caller: paying with credits changes escrow, refunds and the fee basis. `GET /wallet` returns `canSpend: false` and the app reads that rather than hardcoding it, so wiring checkout flips one flag. Until then the wallet screen says so in plain words above the top-up button.

**Nothing marks a retail order received.** The delivery machine is `PENDING → IN_TRANSIT → DELIVERED`, all three moved by the FARMER, then `DELIVERED → CONFIRMED` by the buyer, and that last step is what flips escrow to RELEASED. The app's Orders screen is a history with no button, so no consumer can take that step. It matters little today because release only writes a column and payouts are manual anyway, but it has to exist before real payouts do, and it should be a prompt on the one order sitting at DELIVERED rather than a button on every row.

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

Running the app against a local everything, which is what testing the policy screens needs:

```bash
# the web client, whose pages the app embeds
cd client && npm run dev -- --port 5199

# the app, pointed at both
cd mobile && EXPO_PUBLIC_API_URL=http://localhost:5055/api \
  EXPO_PUBLIC_SITE_URL=http://localhost:5199 npx expo start --web --port 8085
```

Both variables default to production, so an unset one is not a broken build, it is a build reading live data.

**CI runs the server test suite** (`Test (vitest)` in the server job, `.github/workflows/ci.yml`). The client job is lint + build and the mobile job is typecheck, neither of which runs tests, because neither has a suite. Client typecheck needs `tsc -b`, not `tsc --noEmit` (project references).

**The server job now runs a throwaway Postgres** and applies migrations before testing. Most tests mock Prisma and need none of it; `address.service.test.ts` cannot, because "exactly one default address" is held inside a transaction rather than by a constraint and the only way to know it holds is to commit and look. Applying migrations rather than pushing the schema also means a migration that is valid Prisma but broken SQL fails in CI instead of on deploy.

## 8. Working agreements

- **No "Claude"/AI attribution** in commit messages, PR bodies, or branch names. Rename auto-created `claude/*` branches to `feature/<slug>`.
- **No em dashes** in prose. Commas, colons, full stops.
- `main` is protected: squash merges only (linear history), branches must be up to date, and **unresolved review conversations block the merge**.
- The user runs many parallel sessions across git worktrees and commits concurrently. **Verify branch state before any destructive git operation**, and never use bare `git stash`, because the stash stack is shared.
- Verification is lightweight: build, typecheck, run the suites, check the dev server. No Playwright installs.

## 9. The app's own surfaces (shipped 2026-09-13)

Web has none of these. They are `mobile/` only.

### The wallet: prepaid credits

**1 credit is 1 rupee.** No exchange rate, no bonus multiplier, no expiry, because each of those is a pricing decision nobody has taken. A pill in the storefront header shows the balance; `screens/WalletScreen` holds the statement and the top-up.

`WalletEntry` is the record and `Wallet.balance` is a cache of it, both moved inside one transaction by the single function that writes either.

**Two different races, two different guards**, and conflating them is what review caught:

- **The same payment twice** (a retrying client, a webhook racing the callback) loses to the UNIQUE index on `razorpayPaymentId`. A database guarantee, not a check-then-act.
- **Two different payments together** is not covered by that index at all. Under READ COMMITTED both read the same balance and the second `set` erases the first. `applyEntry` takes `SELECT ... FOR UPDATE` on the wallet row.

**The credited amount is read from Razorpay, never from the request**, or a client could mint credits for free. **Ownership is proved from the ORDER's notes, not the payment's**: Razorpay does not copy order notes onto the payment entity, so the original check found nothing and passed by default, which would have let a signed payment from any other flow be replayed as a top-up. **Captured only**: `authorized` reserves funds that the capture can still fail to take. Floor ₹100, ceiling ₹50,000. 20 tests.

### The address book

`Address` rows, CRUD at `/api/addresses`, `screens/profile/AddressBookScreen`.

**One free-text line, not a form of six fields.** Indian addresses do not decompose into house / street / postcode: "near Shivaji Chowk, behind the temple" is a real address a required "Street line 2" makes unenterable. Structured only where it is used: a label to pick between them, a phone for whoever receives it, a landmark riders read first.

**The city is `User.location`, shown rather than asked.** That column decides which shelf a shopper sees and the server refuses purchases crossing it, so an address in another city could never be used. It is copied onto the row at save time, so switching delivery city does not silently relabel a saved Pune address.

**Exactly one default, held in a transaction rather than a constraint.** A partial unique index cannot express it: promoting a new default UPDATEs the old row, so the constraint fires mid-transaction on a state one statement from correct. The first address is always default whatever the request says; deleting the default promotes another.

**A transaction alone is not enough**, which review caught. Under READ COMMITTED two simultaneous first-address requests both count zero rows and both mark their own row default, and neither did anything wrong on its own. All four write paths take `pg_advisory_xact_lock` on the user's book first, **delete included**: it promotes a replacement when it removes the default, and an unlocked delete reads `isDefault` before somebody else's promotion clears it and then overwrites their choice. Advisory rather than row locks because on the create path the rows do not exist yet, so there is nothing to `SELECT FOR UPDATE`. Call it through `$executeRaw`: the function returns void and `$queryRaw` cannot deserialise that, which throws on every write. 21 tests against a real Postgres, including the races and that another account gets 404 on read, edit, delete and promote.

**Race tests here loop, and they assert who won rather than how many.** Counting defaults passes on the broken code, because the bad interleaving still leaves exactly one. And a single round passes too: the first pair of transactions in a fresh process spends its time opening connections and accidentally serialises. Ten rounds asserting the named winner fails about eight of them unlocked. A race test that has never been watched to fail is not evidence of anything.

### Profile

Orders (history), Delivery addresses and Notifications are **shopper-only**: a farmer has no basket, so those routes live on the consumer stack alone. **Help, About, Privacy, Terms and Share are on every stack**, because they are not a shopper feature and were reachable by one role only because that is where they happened to be built. A pending applicant gets them as chips on the status screen, having no Profile tab, and a signed-out visitor gets them in a footer on the storefront, which sits OUTSIDE the browsing branch so it is there at the city gate too: that gate is the first screen anyone meets and it is where they are deciding whether to hand over a phone number.

- **Orders is a history and nothing else.** It used to render `buyer/SettleScreen`, a B2B escrow record ("Contracts", contract terms, per-quintal bid quantities), to households buying two kilos of tomatoes. It is behind Profile rather than a tab: a history is checked now and then, and the slot is better spent on what a shopper switches to many times a session.
- **Terms and Privacy open the live website, deliberately not copied.** See §5 for `?app=1`. **`react-native-webview` has no web implementation** and renders the sentence "React Native WebView does not support this platform." where the document should be: not an error, so `onError` never fires and a fallback never shows. `PolicyScreen` therefore renders a plain iframe on web and the WebView on native. `RazorpayCheckout` has the same problem and is unfixed, so payment cannot be exercised in a browser at all.
- **`EXPO_PUBLIC_SITE_URL` overrides where those pages come from**, defaulting to production. Without it a change to the policy pages cannot be seen in the app until the web client deploys, which makes the pair untestable together.
- **Notification toggles are device-local and say so.** There is no push infrastructure and no preference model on the server. A switch labelled "email alerts" that silently changed nothing is a lie the user cannot detect.
- **Help is `info@cropbid.in`** and sets the expectation at a working day or two, because nobody is on a chat rota.

### A seller is not always a farmer

**`lib/sellerType.ts` owns every word the app uses for a seller.** The app used to label everything off one boolean, `role === 'FARMER'`, so a kirana store owner saw "farmer" on their profile, "My Crops" and "My Farm" in the tab bar, "Tell us about your farm" on the application and "BUYERS TRUST YOU" over their trust score. The database always knew better: `sellerType` is on the row and on the wire, and only the client threw it away.

| | Farm | Local shop | Wholesaler |
|---|---|---|---|
| Tabs | My Crops / My Farm | My Stock / My Shop | My Lots / My Business |
| Trust | BUYERS TRUST YOU | SHOPPERS TRUST YOU | BUYERS TRUST YOU |
| Details card | Your farm, FARM SIZE | Your shop, no acreage row | Your business |

**A shop is known by its `businessName`**, a farmer by their own name, so a shop whose profile shows the owner's name is showing the wrong identity to everyone who buys from them.

**The profile header carries two pills**, because the account model has two levels: `SELLER` plus the kind, or `BUYER` plus the company type. `roleTag`'s predecessor was `isFarmer ? 'farmer' : 'buyer'`, which labelled every CONSUMER account a buyer, and since §4 that is every new account.

### `Alert.alert` is a no-op on react-native-web

**Import `Alert` from `src/lib/alert`, never from `react-native`.** The platform one does not throw, does not warn, and does not fall through to `window.alert`: the call returns and nothing happens. Every confirm in the app was dead in a browser, which is how Log out came to look broken.

**`window.confirm` is not the fix either.** Plenty of browser contexts suppress native dialogs; an embedded preview pane returns `false` from `confirm()` immediately without showing anything, which looks exactly like the no-op it replaced. So web queues into `components/AlertHost`, a React modal mounted at the root of `App.tsx`. Native keeps the platform dialog.

### Also gone

**Machines & equipment.** Screen, promo card, partner-status chip, five route types and five registrations, all removed.
