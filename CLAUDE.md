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

Every listing is anchored to the day's government mandi rate (AGMARKNET, 4,600+ mandis) so both sides negotiate against the same public reference price. §11 says how those rates are read, and why the obvious way is wrong. Money is captured into escrow via Razorpay and settles after delivery is confirmed. **Read §6 before writing anything about payouts.**

Alongside those three channels sit **two lead-gen marketplaces** that sell the farmer their *inputs* rather than buying their output: `/equipment` (machinery to buy or hire) and `/inputs` (seed, fertiliser, crop protection). They are a different shape from everything above and §10 is the section that governs them.

Languages: English, Hindi, Marathi. Sign-up is a name, an email or phone number, and a password, with no code; sign-in is that password. A phone code over WhatsApp survives as the secondary lane (§4).

## 2. Business facts

- **India only.** Governing law India, jurisdiction Pune, Maharashtra *(unconfirmed, so confirm it before it matters)*.
- **Not yet incorporated.** Incorporation in progress. `/terms` and `/privacy` say so outright rather than naming a company that does not exist. Wired to an `OPERATOR` constant in `client/src/pages/TermsPage.tsx`. **Fill it the day the certificate arrives** and the interim wording disappears on its own.
- The footer must not say "CropBid, **Inc.**", a US suffix on an unincorporated Indian business. It did for a long time.
- **Fee: flat 2% on a settled deal** (`PLATFORM_FEE_PERCENT`, `transaction.service.ts`). Listing, accounts and mandi rates are free, and **onboarding is free**: there is no signup charge anywhere in the codebase, so nothing on screen may imply one. Freight is charged separately and on top, see §2a. Households also pay a delivery fee on small shop orders, see §3b; the 2% is never taken on it.
- **Household delivery: free from ₹200 of one shop's items, ₹30 below that** (`RETAIL_DELIVERY`, `retailOrder.service.ts`). There is **no minimum order** any more. §3b has the whole of it.
- **Retail footprint: Pune and Nagpur.** Wholesale is national, because a lot can be freighted and a few kilos cannot. **But read §2a before repeating "national":** if every wholesale lot has to be physically inspected, wholesale reaches as far as the inspectors do, and today that is nobody.

### 2a. Freight is ours (shipped 2026-09-06)

**CropBid books the carrier. The seller pays for it. Neither side learns who the carrier is.**

The reason for all three is quality, and **read §2b before repeating that anywhere a user can see it.** Owning the booking is what would make a real check possible, because an inspection carried out by a truck the seller hired is not an inspection. The check itself is not built. What is true today is that we book the carrier, so the delivery is ours to answer for.

- **Booking is ADMIN-only** on the server: `/logistics/partners/:transactionId`, `/quote`, `/book`, and the status and driver updates. The farmer and buyer keep two GETs and proof-of-delivery upload. `BookTransport` moved to `/admin/logistics/book/:transactionId`.
- **A closed deal pages ops.** `createTransaction` fires `notifyAdminsDealClosed` to every ADMIN account (`DEAL_NEEDS_TRANSPORT`), and the bell deep-links it to the booking form, because booking is the job. It is not awaited: `createTransaction` may be running inside an interactive `Prisma.TransactionClient`, and a notification must never roll back a settled deal.
- **The queue is derived, not stored.** `GET /admin/attention` returns transactions with no shipment, oldest first, and fills the "Needs attention" panel that was a placeholder until now. Because it reads deal state rather than notification rows, a missed or failed ping cannot lose the job. Add disputes and KYC failures as further queries into the same shape; do not invent a triage table. The panel distinguishes an empty queue from a failed fetch, since "All clear" is a claim.
- **Ways in:** the bell, the Needs-attention panel, or a **Book delivery** link on the row in Admin → Transactions.
- **Carrier identity is stripped at the API**, in `forShipmentViewer()` (`logistics.service.ts`): `logisticsPartner`, `driverPhone` and `platformCommission` never reach a trader. The transaction list drops the `logisticsPartner` include for non-admins too, and the shipment-booked notification no longer names the haulier. Hiding it in the UI alone would have left three ways round it. **The corollary is that no trader-facing string may tell them to contact the carrier**: the failed-shipment banner on `ShipmentTracking` did, which is an instruction they cannot carry out and contradicts the Transport panel two cards below. Ops keep that line, because they have the carrier's name and phone; the trader is told we are chasing it and given `info@cropbid.in`.
- **`paidBy` is not an input.** `bookShipment` writes `FARMER` unconditionally and the request schema has no field for it, so there is no request that can bill the buyer for freight. `SPLIT` stays in the enum only for rows booked before this rule.
- **The seller is told twice, before the money moves**: a lede on Deliveries, and a `Delivery (paid by seller)` line in the settlement breakdown on `TransactionDetail`. The breakdown shows an amount only once a shipment exists, and says "on booking" before that, because a placeholder on a settlement screen reads as a real figure.

**Unresolved, and worth resolving before this scales:** flat 2% now has to cover software, escrow, freight booking *and* a person driving out to look at the goods. That may want a wholesale-tier fee. It is a decision nobody has taken, not a detail.

### 2b. Quality check at pickup (intended, nothing built)

**The model:** once a deal is made, CropBid visits the farm and checks the quality, ships according to what it finds, and **the farmer is paid on the inspected quality rather than the listed quality**. That is the real reason the freight booking is ours (§2a).

**None of it exists in code.** `ShipmentStatus` runs `PENDING_PICKUP → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`: no inspection step, no field for a result, and no path by which a settlement can differ from the agreed price.

**It is a design job, not a field.** Paying on inspected quality moves the amount after both sides have agreed, so it touches escrow, the 2% fee basis, the seller's settlement and what the buyer is told. It also needs a record of who checked, when and what they found, and a way for the seller to disagree with it. Nobody has designed any of that.

**Until it is built and actually happening, nothing a user reads may say CropBid checks the goods.** The honest line is that **we book the transport, so the delivery is ours to answer for.**

That claim is the one this file keeps having to take back. §5 records it twice on `/how-it-works` alone ("verifies every lot ourselves", then "the load gets checked on the way through", introduced by the rewrite that was fixing the first). It was still live on three signed-in screens until **2026-09-20**: the settlement breakdown on `TransactionDetail`, the `Deliveries` lede, and the Transport panel on `ShipmentTracking` ("checked the goods before they travelled"). The failure is always the same shape, which is why it recurs: **the rationale is easier to write than the feature, and on screen it reads as a promise.**

The comment above each of those strings asserted the inspection too, which is where the next string comes from, so they were corrected with them, as were the header comments on `BookTransport`, `routes/index.tsx`, `logistics.routes.ts` and `logistics.service.ts`, all of which stated it as a fact about the system.

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

**The cart stores kilograms, not the seller's unit.** Half a kilo of a quintal lot is `0.005`, and 2dp rounding turns that into `0.01`, ordering double. Conversion back to the seller's unit happens in exactly one place, `orderQuantity` in `cartLines.ts`, at 6dp, using the **live** listing unit rather than the cart snapshot; checkout sends that number and the shop's delivery fee is worked out on it.

### 3b. Delivery is per shop: free from ₹200, ₹30 below (decided 2026-09-20)

**A household basket is ordered one shop at a time, and each shop order pays for its own delivery run.** From ₹200 of that shop's items it is free; below ₹200 the shopper pays ₹30 and the order still goes through. **CropBid keeps the ₹30.** It replaced a hard ₹150 floor that refused small orders outright and that the web cart never even warned about.

The user's calls, and the argument for each:

- **A fee, not a floor.** Nobody is turned away; a small order pays towards its trip.
- **Per shop, not per lot and not per basket.** Per lot punished buying two things from one counter (two ₹120 items were two short orders). Per basket let ₹200 spread over three shops pass as one, when it is still three trips.
- **CropBid keeps it**, although sellers do the retail delivery today. It is not part of any lot's price, so it never enters `Transaction.totalAmount`, the 2% basis or what the seller is paid.
- **One order per shop, one payment per basket.** A shop order is a `RetailOrder` row holding the fee; each lot inside it is still its own `Bid` and `Transaction`, because stock, escrow release, refunds and settlement all stay per lot. The basket is paid once (§3c).

How it holds together:

- **`POST /api/retail-orders`** takes one shop's lines. It refuses lines from two sellers, claims the stock of every line or none (a fee worked out on four items is wrong for three), and replays an order whose every line key it already holds. A basket only partly ordered is refused with a 409 rather than completed, for the same reason.
- **The fee the shopper saw travels with the order** (`deliveryFee`), and a different answer is a 409, not a charge. A re-price across ₹200 between basket and request is the case. The item price is still unbound, see §6.
- **Both sides compute the shop total the same way**: live price times the quantity checkout sends, summed in send order, rounded to paise once. Rounding each row first could land a paisa either side of ₹200 and show "Free" on an order charged ₹30.
- **The smallest thing a shopper can pay for is a whole shop order.** `createOrder` for a lot with a `retailOrderId` pays its shop order, so there is no request that pays a shop's lots piecemeal and skips the fee.
- **The numbers are served** at `GET /browse/retail-rules` (`freeDeliveryFrom`, `deliveryFee`). The web and the app read them; neither keeps a copy. If the fetch fails the bill says so and checkout waits, rather than guessing. `minOrderValue` is still sent, as `0`, because app builds from before this read it as a floor and would otherwise refuse orders the server now takes.
- **`/bids/direct-purchase` still works** for those older builds, as a one-item shop order **with no delivery fee**. Their bill says "Delivery: Free" and they cannot send back what they were shown, so the mismatch guard cannot protect them and charging ₹30 would be a fee nobody displayed. The old contract is honoured, and it heals as people update. It does leave that endpoint as a way to avoid the fee, which is accepted: one lot at a time, and nothing current calls it. They also cannot put two items in one shop order, so an old app ordering twice from one shop gets two orders.
- **Web and app alike:** the cart is grouped by shop with "add ₹X more from this shop for free delivery" on each, and the orders screen shows one card per shop order with delivery in the total.
- **Public pages say it**: `/how-it-works`, `/terms` §6 and §8, and two FAQ answers.

### 3c. One payment for the basket, taken at checkout (decided 2026-09-20)

**A basket is paid for once, the moment it is placed.** Two shops are still two orders with two fees and two deliveries, but one UPI or card approval: two approvals in a row for one basket is how a shopper gets lost. And checkout opens the payment itself, because the app used to end with "Pay from the Orders tab" on a tab with no pay button, and every order placed in the app sat unpaid.

- **`RetailPayment` is created when the shopper presses Pay, not when the basket is placed.** It covers whichever unpaid shop orders are being paid (`POST /payments/order` with `retailOrderIds`): the basket right after checkout, or everything still owed from the orders screen. Placing stays one shop at a time, untouched. The same set asked for again gets the same Razorpay order back.
- **The Razorpay ids live on `RetailPayment`**, not on `RetailOrder`, which only records `paidAt`. The migration that moved them carried any existing ones across before dropping the columns.
- **Capture is one database transaction** that stamps the payment and every order it covers, and moves their lots into ESCROW; each write is conditional, so the callback and the webhook can both arrive.
- **An order can sit in more than one payment** (the basket was opened and closed, then paid on its own). Whichever captures first pays for it. If another one is paid as well, capture pays only what is still unpaid, writes `retail_payment.overpaid` to the audit log with the refund due, and sends every admin a `RETAIL_OVERPAID` notification: that money went in twice and has to go back by hand.
- **Closing the payment window leaves the orders placed.** The orders screen then leads with "₹X to pay" and one Pay button for everything owed. On the website, an order's own page can still pay that one shop order.
- **"Did it arrive?"** sits on app orders that the seller has marked delivered, and only those: one tap confirms every delivered item on that card, which is the step that marks the seller due their money. The website's order page already had it.
- **`RazorpayCheckout` still has no web implementation** (§9), so the app's payment window can only be exercised on a phone.

### 3d. Cancelling a shop order (decided 2026-09-20)

**Either side can call a shop order off until the shop marks it on the way.** `POST /api/retail-orders/:id/cancel`, open to the shopper who placed it, the shop it was placed with, and admins.

- **Whole order, never part of it.** It is one delivery with one fee, and the fee was worked out on the whole; half an order is not something the rest of the system can price. Every lot goes back on the shelf together, and a lot whose listing had sold out goes back on sale.
- **The cut-off is the only one the data supports.** `PENDING → IN_TRANSIT` is the shop saying it has gone. `/terms` promises cancellation "until the shop marks it as on the way" for that reason, and the check is repeated inside the write transaction, so a shop pressing "on the way" at the same moment wins and the cancellation rolls back whole.
- **A shop or an admin must give a reason, a shopper need not.** Both are calling off somebody else's order, and whoever did not press the button is shown what they said.
- **An admin cancelling tells both sides, and tells them CropBid did it** (2026-09-22). The server always let admins cancel, but it treated anyone who was not the shopper as the shop: it told the shopper alone that "the shop cancelled", and the shop was never told its order was off.
- **Unpaid lots end `CANCELLED`, paid lots end `REFUNDED`** and every admin gets a `RETAIL_REFUND_DUE` notification, because that transfer is manual (§6). Both are new enum values; `CANCELLED` means no money ever moved.
- **A cancelled order cannot be paid for.** Opening a payment refuses it, and if one was already open and is somehow paid, capture treats it exactly like an order already paid: the money is recorded as owed back and the admins are told (§3c).
- **Where it lives:** the shopper's order page and the app's order card; the shop uses the "Can't fulfil this order?" form on `/transactions/:id`, which is where it already marks orders on the way, and an admin uses the same page ("Cancel this shop order"), reached from **View** on Admin → Transactions. That link was a 403 for every admin until 2026-09-22, because `getTransaction` let only the two sides of the deal in. The app has no seller delivery screen at all, so a shop on a phone cannot cancel there either.

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

### Signing up: a password, and no code (decided 2026-09-18)

**One form on both surfaces: name, email or phone number (one box), password, confirm password.** Nothing is sent and nothing is verified. The account is made on the spot as a `CONSUMER` and signed in. The user's call: phone verification is to be integrated later, and a new shopper does not wait on it. This reverses the 2026-08-21 decision (#120) that there would be no password anywhere in the UI.

- **Every new account is a shopper, on every lane.** No sign-up path takes a role any more. Someone who arrived through a partner door is sent to the application form once their account exists (`routeAfterAuth(user, created)`), and approval is what makes them a partner.
- **Web:** the sign-in window (`AuthModal`) now opens on **password sign-in**, with a **Create an account** lane beside it. `/signup` and a signed-out click on "Apply" at `/partner` open it on create-an-account (`startWith: 'signup'`).
- **The storefront header** carries a **Sign up** button beside Sign in (folded into the ☰ menu below 520px), and once signed in an **account menu with Sign out**. Before this a signed-in shopper had no way to sign out from the homepage at all; Sign out lived only in the app navbar a page away.
- **"Sell your harvest" and "Start selling free" go to `/partner`, not `/signup`.** Sign-up makes a shopper and stops, so a farmer sent there never reached the application. From `/partner`, "Apply as ..." makes the account and opens the form.
- **The code lane stays, as the third option.** Accounts made through it before this date have no password and no other way in. It is also the only recovery for a **phone-only** account, because forgot-password sends an emailed link and such an account has no email.
- **Server:** `POST /auth/signup` has no role field, and `signup()` writes `CONSUMER` whatever it is handed. App builds from before 2026-09-13 still send `FARMER` from their old picker; zod drops it unread. `phone` is optional as long as `email` is present, because one of them is the login identifier. The code lane matches: `startPhoneSignIn` no longer takes `intendedRole`, and `verifyPhoneSignIn` creates `CONSUMER` even from a challenge row written before this rule.
- **The buyer's emailed-code sign-up is unreachable.** Buyers used to sign up as buyers, get a 202 and verify their email first (`startBuyerSignup`). Nobody signs up as a buyer now, so `/signup/verify` and `/signup/resend` only finish signups already in flight, and that code is dead. Removing it is a separate cleanup.
- **App:** `SignupScreen` asks the same four things. The fifteen-country picker is gone, since the product is India only and the server defaults to India and INR.

### Support can reset a password, and the user must then choose their own (shipped 2026-09-25)

**A button on Admin → Users sets a temporary password and shows it once, for the admin to read down the phone.** The account that rings support is exactly the one forgot-password cannot help: sign-up takes a phone number OR an email, the reset link is emailed, and a phone-only account has no email.

- **What makes it safe is what the password can do.** It signs them in and nothing else. `mustChangePassword` on the row goes into the access token, and `authenticate` refuses every request but the change itself, `/auth/me` and logout. So a password spoken aloud is never a working account, and the rule holds for anything driving the API, not just a screen that behaves.
- **Refusing is a 403 with `PASSWORD_CHANGE_REQUIRED`, never a 401.** A 401 reads as "sign in again", which sends them back to type the temporary password they were just given, which is the loop this exists to end.
- **The plaintext is returned once and never stored**: the column holds its bcrypt hash like any other password, so a second look means a second reset. The reset is audited before the password is set, not through `recordAudit` which swallows its failures, and the audit row never holds the password.
- **Every credential write is conditional on the state it was decided from**, which is what makes the reset stick. Review found five paths that read, then wrote unconditionally, so anything in flight when the reset landed could undo it: login, refresh, the phone-code sign-in, the password change and the emailed link each now write with an `updateMany` conditioned on the password or token they read, and a miss is refused. Same idiom as the retail-order cancel (§3d).
- **The skip is tied to the reset it belongs to.** `passwordResetAt` stamps the reset and the token carries it, because a flagged token outlives its own change by five minutes: without the comparison, a second reset inside that window would let the old token skip the check again.
- **It ends every session the account had**, and any emailed reset link in flight. The claim rides the refresh as well, so refreshing cannot launder a temporary password into an ordinary session. A session already open when the reset happens keeps working for up to five minutes, which is the access token's life; the refresh token is gone, so nothing outlives that.
- **The change does not ask for the temporary password.** Two ways into that state and neither is helped by the question: they typed it a moment ago, or they signed in by phone code and never knew it. An account nobody reset is still held to its current password, and a test pins that.
- **Not another admin, and not yourself.** An admin account is where this would be a way to take over somebody's access rather than restore it, the same reason deleting one is refused.
- **The app refuses to sign such an account in** and sends them to the website, because `mobile/` has no change-password screen. Building one there is unbuilt, not decided against.

**Sessions are stored as a hash.** `User.refreshToken` holds the SHA-256 of the refresh token, never the token (`utils/refreshToken.ts`), because the column is otherwise a live session for every signed-in account and a database dump hands them all over. The schema said "stored hashed" for months while it stored them raw; fixed 2026-09-20, and the migration cleared the existing values, which signed everyone out once. The same rule already covered reset tokens and sign-in codes.

**Knowingly unverified.** Nothing proves the email or number belongs to the person typing it. A typo'd email means the reset link goes to a stranger, and anyone can claim a number before its owner arrives. That is the price of no code, and it is the thing phone OTP is meant to fix.

**Phone numbers are matched exactly as stored**, and nothing adds a country code. `98220 55667` is stored as `9822055667` and `+91 98220 55667` as `+919822055667`, so an account made one way cannot sign in typed the other way. This predates the sign-up form, but it bites more now that everyone types a number into a password form. Fixing it means choosing one canonical form (probably `+91` on any 10-digit number) and backfilling the column.

**A business buyer may have no email on file.** Sign-up no longer asks a would-be buyer for one, and the buyer application (`completeBuyerOnboarding`) never did. The FAQ and privacy page used to say business buyers give an email; both are corrected. If order paperwork is to be emailed, the application form is where to ask.

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

### 4a. Where a seller's money goes (shipped 2026-09-21)

**A UPI id, or a bank account, and at least one before anybody can be paid.** Money had been reaching escrow since payments went live with nowhere to send it afterwards: `FarmerProfile.bankDetails` existed, was never written by anything, and the only code that touched it cleared it on account deletion. Four typed columns replace it (`payoutUpiId`, `payoutAccountName`, `payoutAccountNumber`, `payoutIfsc`); the JSON column is left in place, unused, because dropping a column is a destructive migration and it costs nothing to keep.

**Asked on the application, required before payout, never a gate on approval.** A blank is a bad reason to hold up a review, and a reviewer approves people, not bank accounts. What makes it arrive in time is the nag: when a capture puts money into escrow for a seller who cannot be paid, that seller is told (`notifySellersMissingPayoutDetails`, both capture paths). **One open nag at a time** by design, since a shop with six orders in a morning would otherwise get six of them, which is how a bell stops being read.

**Three audiences, three answers, and this is the part to not undo:**

- **The seller sees their own details masked.** `safeUser()` in `auth.service.ts` now does both jobs for every user response: strips the credential columns as before, and masks the payout ones. It is one function because it used to be an inline destructure at seven return sites and a new endpoint only has to forget once. The account number keeps its last four; the UPI id keeps its provider; the **IFSC and the account name stay readable on purpose**, because an IFSC names a branch rather than an account and a seller who cannot read any of it cannot tell a right entry from a wrong one.
- **Admins see it in full, one seller at a time, and every read is logged.** `GET /admin/partners/:id/payout`. The application queue carries `hasPayoutDetails`, a boolean, and never the columns: a reviewer working a queue has no business reading forty account numbers to decide one application. **The audit row is written before the details are returned, and not through `recordAudit`**, which swallows its own failures by design: here the log IS the control, so if it cannot be written the details are not shown.
- **Nobody else sees anything.** `PUBLIC_SELLER_SELECT` is an allow-list, so these cannot leak to a buyer by existing.

**The mask must never round-trip.** The seller's form is the same component in both places (`PayoutFields`, one per surface) and it **starts empty even when an account is on file**, showing what is stored as text above it, because a prefilled mask posts straight back into the column and turns an account number into bullet points. `parsePayoutDetails` refuses any value containing the mask character as well, which is the guard for the client that gets it wrong.

**Two thirds of a bank account is refused.** Name, number and IFSC together or none of them: a partial record is not something to complete later, it is money that cannot be sent, and storing it would put a half-filled account in front of whoever makes the transfer. An explicit clear of all four is allowed, or a wrong number could only be removed by writing in.

**Account deletion takes them with it.** The anonymising scrub is a hand-written column list, which is exactly the kind of list a new column is left out of, and `/privacy` promises bank details are removed. A test pins it.

**Where a seller enters them:** the application (web and app), the app's profile editor, and a **card on the web seller dashboard**, which exists because the website has no seller profile page at all. That gap was survivable until money needed somewhere to go. The app's profile editor also stopped demanding an acreage and a crop list from shops and wholesalers while this was done, because it is the screen a shop now has to reach to be paid and they could not save it at all.

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
| households have "no minimums" | a ₹150 floor refused small orders (since 2026-09-20, a ₹30 delivery fee under ₹200 a shop instead, §3b) |
| "16 crops rated & forecast" | The board carries 30, and the forecast maps over the same list |
| "verifies every lot ourselves" | We do not test lots, which the Quality section on that same page said in as many words |
| "No passwords, ever" | Password sign-in is a real second lane |

Review then caught **three more that the rewrite introduced**, which is the same failure one turn later, so they are worth naming:

- "the load gets checked on the way through". Owning the booking is what would MAKE an inspection possible and that is the whole argument in §2a, but `ShipmentStatus` runs `PENDING_PICKUP → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED` with no inspection step, no result field, and §2a itself says nobody does it today. **Writing the rationale as though it were the feature** is how this one gets made; the honest line is that we book the carrier so the delivery is ours to answer for.
- "the app counts down to the nightly cutoff". True of `mobile/lib/freshWindow`, wrong to put on the website, where the reader has no such clock and no server refuses a late order either.
- **"grower" is not a synonym for "seller".** Fixing the scope word above, I reached for "ordered separately from its grower", on the very page arguing that a kirana is not a farm. The whole retail flow had it: the cart's reprice line, its empty state, the phone-number hint on checkout, and three lines of `BillDetails` including "Paid by the grower". The comments above those strings said grower too, which is where each new one came from, so they were changed with them. `grower` is now correct only where the subject really is a farm (the mission quote, the agent looking for growers, "no farm is selling direct"). See §9.
- "₹150 per seller". **It was per LOT** at the time: checkout posted one purchase per line, so two ₹100 lots from the SAME grower were two ₹100 orders and both refused. The app's cart note and its checkout button said "seller" too, three elements above a `BillDetails` line already saying "one per lot", and the server's own error said "this seller's items". All four were fixed together. The floor itself is gone now (§3b), and the unit really is the shop, so check which word the page uses against `retailOrder.service` before trusting either.

Two of those had a working contradiction elsewhere on the same page, which is the tell: **when a page argues with itself, one half is stale.** Also added, because they were simply missing: the household shelf (shop-first, the two lanes, Pune and Nagpur, 500 g, the ₹150 floor), the three seller kinds and their licences, and the fact that **freight is billed to the seller**, which an applicant could previously not learn from any public page.

**The freight line is on `/how-it-works` but not on `/partner`**, which is the page somebody actually applies from. Same disclosure, not made there yet.

**The nav on this page hides at 1240px, not the 960px the other landing pages use** (`.hiw-nav`). It carries eight links where they carry four, and `.nav` is a space-between row with nothing stopping the middle group colliding with the wordmark. It had been overlapping for a while at ordinary laptop widths.

Still missing for Razorpay live-mode onboarding: **standalone Shipping/Delivery and Contact pages**. Delivery is §8 of the terms, which may or may not satisfy them, so check the dashboard checklist.

## 6. Known gaps: read before touching payments or copy

**Settlement moves no money.** Capture is real; money genuinely reaches the platform account. But the release (inside `updateDeliveryStatus`, when the buyer confirms) and `refundTransaction` **only update a database column**. Paying a seller's bank needs Razorpay Route (not built), and the refund path never calls Razorpay's refund API at all. Every payout and refund is a manual bank transfer.

It is invisible in the UI: an order reads "Released" and looks finished. **Never write copy promising an automatic payout.**

Since 2026-09-21 there is at least somewhere to send it by hand: §4a. **Nothing yet connects the two.** No screen lists who is owed what, the admin transaction list still shows no delivery fees, and a released transaction does not appear anywhere alongside the account it should be paid into. The queue that would fix it is the derived-not-stored kind `/admin/attention` already demonstrates (§2a): released transactions, oldest first, with the seller's payout status on the row.

**Price is unbound at checkout.** Web and mobile send listing + quantity; the server recomputes `totalAmount` from the live `retailPricePerUnit`. A seller re-pricing between the bill and the request charges an amount the shopper never approved. Fix is the same shape as the unit guard and the delivery-fee guard that already ship: send the agreed price, refuse a mismatch. **The delivery fee is bound** (§3b); the item price is not.

**The delivery fee is not refunded with the lots.** Refunds are per lot and only flip a column (above); refunding every lot of a shop order leaves its `RetailOrder.deliveryFee` untouched, so whoever makes the manual refund has to add the ₹30 by hand. The admin panel does not show delivery fees at all, so CropBid's own share of retail revenue is only in the database.

**Nothing checks the goods.** The inspection that the freight arrangement exists to enable is unbuilt and undesigned (§2b), so a settlement can only ever be the agreed price. Never write copy saying we check, test, inspect or grade a lot.

**Cancelling is retail only.** A shop order can be called off before dispatch, by either side (§3d). A trade deal cannot: an accepted bid is undone only by an admin refund, and the terms say so.

**Credits cannot buy anything yet.** The wallet (§9) takes real money in and the credits exist, but `spend()` on the server has no caller: paying with credits changes escrow, refunds and the fee basis. `GET /wallet` returns `canSpend: false` and the app reads that rather than hardcoding it, so wiring checkout flips one flag. Until then the wallet screen says so in plain words above the top-up button.

**Nobody chases an order left at DELIVERED.** The delivery machine is `PENDING → IN_TRANSIT → DELIVERED`, all three moved by the seller, then `DELIVERED → CONFIRMED` by the shopper, which is what flips escrow to RELEASED. Both surfaces now offer "Did it arrive?" on delivered items (§3c), but a shopper who never opens their orders never confirms, and nothing times it out. It matters little while release only writes a column, but it has to be settled before real payouts exist.

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
- Blank `DATA_GOV_API_KEY` → the shared demo key, which is throttled much of the day and returns 10 rows a request, so the rates fall back to static reference prices, badged `ref`, and the API log says why. It looks like a UI bug and is not (§11).

Running the app against a local everything, which is what testing the policy screens needs:

```bash
# the web client, whose pages the app embeds
cd client && npm run dev -- --port 5199

# the app, pointed at both
cd mobile && EXPO_PUBLIC_API_URL=http://localhost:5055/api \
  EXPO_PUBLIC_SITE_URL=http://localhost:5199 npx expo start --web --port 8085
```

Both variables default to production, so an unset one is not a broken build, it is a build reading live data.

Both catalogues can be added to from the admin panel (§10): seeds and fertiliser since 2026-09-21, machinery since 2026-09-24. The loaders below still work for a first or bulk load. Pass an explicit `DATABASE_URL`, because `server/.env` points at production:

```bash
cd server
npx ts-node prisma/seedEquipment.ts    # machinery
npx ts-node prisma/seedAgriInputs.ts   # seed, fertiliser, crop protection
```

Both are **additive and idempotent**: insert and update only, never delete, so they are safe against production and a re-run corrects prices in place. `active` is never written on update, so a row taken off the catalogue by hand stays off. `prisma/seed.ts` is the opposite, wiping every table first, and is development-only. It loads both catalogues as well, placeholder licences included, which is the one place those may be written.

### Removing the seed afterwards (rewritten 2026-09-23)

**The demo accounts, and the rows that belong to them.** A card at the bottom of the admin dashboard shows what would go, the admin types `PURGE_DEMO_DATA`, and `POST /admin/purge-demo-data` removes the accounts whose email ends `@cropbid.test` (plus any emails passed), their lots, the bids and deals on those lots, their shop orders and payments, their demand posts and offers, and their notifications. Catalogues, logistics partners, the waitlist and the audit log are untouched.

- **It used to delete everything.** Every shipment, transaction, retail order, payment, negotiation, bid, listing and notification on the platform, real ones included, keeping only the accounts. That is a production wipe behind the word "demo", and it is why the endpoint had no button for as long as it read like that. `collectDemoData` in `admin.service.ts` is the scope now, and one pass serves both the preview and the delete, so the card cannot show a set the purge does not take.
- **Nothing Razorpay has touched.** A captured deal, a shop payment, a paid shop order or a wallet top-up anywhere in the set refuses the whole purge, and the card says so and offers no button. Money against a demo account is a thing to look at, not to tidy away.
- **Including money that arrives while it runs**, which review caught on both this and the account delete. The set is collected before the delete transaction opens, so a check alone is a check-then-act: a capture committing in between was deleted by ids gathered before it existed. Two guards, because the two writes are different shapes. The accounts and their wallets are locked `FOR UPDATE` first, which is what a new wallet, a new deal and `applyEntry` all conflict with, so a top-up waits for the purge instead of landing inside it. And the deletes carry the rule themselves: a capture is an UPDATE of a row whose id is already held, which no lock above covers, so transactions, shop payments and shop orders are deleted only where money has not reached them and a short count rolls the whole purge back. `deleteUser` takes the same two locks and re-reads the blocker inside its transaction.
- **A basket paid once across two shops is left alone.** One `RetailPayment` can cover a demo shop's order and a real shop's order (§3c), and taking it because of the demo half would cancel the real shop's payment session. A payment is in the set only when every order it covers is.
- **A real buyer's bid on a demo lot goes with the lot**, because the lot cannot be deleted while it is referenced, and a bid on something that never existed is not worth keeping. Their own lots and deals are untouched.
- **No admin account is ever in the set**, not only the one pressing the button. CropBid's own production admin signs in as `admin@cropbid.test`, so "every demo email" would otherwise include a colleague's ops account.
- **The card renders only where demo accounts exist**, so a clean production database shows nothing, and the preview is read-only (`GET /admin/demo-data`).

`seedAgriInputs.ts` warns when a product loaded but is **hidden** by the licence gate. On production that is expected until a licence has been entered in the admin panel (§10), since the loader never writes one.

**The machinery loader is now for a first or bulk load only**, and a panel edit is what ends its usefulness. `seedEquipment.ts` finds a dealer by `(name, state)` and a machine by `(dealerId, title)`, so renaming or moving a dealer in the panel takes them out from under the file's key: the next run **creates a second dealer** under the old name and rebuilds their machines beneath it, and a farmer sees the yard twice. A town, phone or email corrected in the panel is written back over by any re-run, which for a phone number means a farmer enquiring gets the old one. It touches neither claim, nor `active`, nor anything the file does not name, so dealers and machines added in the panel are safe. **Once the panel is in use on production, change a file row in the file, or stop re-running the loader.** Giving each row a stable key of its own, so the file and the panel can both write it, is the fix nobody has made yet; the same hazard sits under the inputs loader below, minus the duplicates.

**The loader and the admin panel now write the same rows.** A re-run overwrites every field of a product the file names, and a shop's town, phone and email, so it puts the file's values back over an edit made in the panel. It never touches licences, `active` or anything the file does not name, so products and shops added in the panel are safe. Once the panel is in use on production, change a file row in the file, or stop re-running the loader. On a development database it means a catalogue row names a shop not licensed for that category: fix the licence or drop the row.

**CI runs the server test suite** (`Test (vitest)` in the server job, `.github/workflows/ci.yml`). The client job is lint + build and the mobile job is typecheck, neither of which runs tests, because neither has a suite. Client typecheck needs `tsc -b`, not `tsc --noEmit` (project references).

**A migration runs while the old API is still live.** The deploy goes build, then `migrate deploy`, then restart, so for the length of every migration the previous code is still serving requests against a database it does not know is changing. Any migration that **adds a constraint over existing rows** (a unique index, a NOT NULL, a check) has to survive that: clean the rows and add the constraint inside one transaction that first takes `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE`, or a write from the old code can land between the two and fail the constraint, which aborts the deploy half way. Review caught this on the equipment-enquiry index (#149) and it was reproduced before it was fixed. Readers are not blocked by that lock; writers wait for the migration.

**Prisma sends a migration file as one batch**, which Postgres runs as a single implicit transaction: a `LOCK TABLE` line, which Postgres refuses outside a transaction, applies cleanly through `migrate deploy`. Write `BEGIN`/`COMMIT` out anyway where the transaction matters, rather than depend on how the tool sends the file.

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

**A wallet that has ever moved blocks deleting the account.** The wallet and its entries cascade with the user row, so an admin hard-delete would keep the money and lose the record of whose it is. `userDeleteBlocker` in `admin.service.ts` is the rule, for this and for accounts with deals, and the admin user list sends its answer on every row so the panel never offers a delete the server refuses.

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

- **Orders is a history, plus the two things a shopper has to do.** One card per shop order; a "₹X to pay" banner when something is unpaid, and "Did it arrive?" on items the seller has marked delivered (§3c). It used to render `buyer/SettleScreen`, a B2B escrow record ("Contracts", contract terms, per-quintal bid quantities), to households buying two kilos of tomatoes. It is behind Profile rather than a tab: a history is checked now and then, and the slot is better spent on what a shopper switches to many times a session.
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

## 10. The two lead-gen marketplaces

`/equipment` and `/inputs` share one shape, and it is **not** the trading shape. Get this wrong and the legal position goes with it.

Both are web only. The app dropped its equipment screen (§9) and never had an inputs one.

- **Neither creates a `Transaction`, a `Bid`, or touches Razorpay.** They write `EquipmentEnquiry` / `AgriInputEnquiry` rows. Leads, not orders. CropBid takes no payment for a tractor or a bag of urea.
- **Dealers and suppliers are not `User`s.** No login and no self-serve, so no dealer or shop writes anything. Both catalogues are written by an **admin**, from the panel or the loader file (§7): seeds and fertiliser since 2026-09-21, machinery since 2026-09-24. If either ever gets self-service, the row gains an optional `userId` rather than being replaced.
- **The contact rule.** To anyone who is not an admin, a partner's phone number is returned by **exactly one function per catalogue**, `createEnquiry`, which requires auth. Browse and detail expose name, location, rating and verified status only. That is what stops the catalogue being harvested into a contact list, and it is the same instinct as `contactVisibility.ts` on the trading side. **A new read path a user can reach must not include `contactPhone`.** The admin lead lists do include it, on purpose and behind `requireRole('ADMIN')`, because working a lead means calling both sides. This rule used to say "exactly one function" flat, which the equipment lead list had already made untrue; a rule that the code visibly breaks stops being read as a rule.
- **Auth alone does not stop the harvest**, which review caught on `/inputs`. Every product id is on the public browse, so one signed-in account could enquire on each in turn and leave with every number. Two guards, for two different harms. A unique index on `(userId, agriInputId)` means a repeat gets back the lead already on file (200, not 201) instead of writing another, so the table cannot be filled with copies. `enquiryLimiter` caps enquiries at 20 a day per **account**, not per IP, because what is being rationed is what one account may collect, and an IP in the key hands out a fresh allowance to anyone who changes network.
- **`/equipment` has both since 2026-09-21**, with two differences worth not undoing:
  - **Intent is in its key**: `(userId, equipmentId, intent)`, where inputs need only `(userId, agriInputId)`. Buying a tractor and hiring one are different leads a dealer acts on differently, so a farmer who asked to buy and now wants to hire must reach the dealer again rather than be handed back their own offer to buy. A repeat does **not** overwrite the dates or message on file: the dealer may already have called about the first one. The migration deletes existing duplicates first, keeping the oldest, because a unique index cannot be added over rows that violate it and a migration failing mid-deploy is what took production down on 2026-09-20. It locks the table against writes before it does either, because the old API is still taking enquiries while it runs (§7).
  - **`equipmentEnquiryLimiter` is its own instance**, not `enquiryLimiter` mounted twice. Each `rateLimit()` carries its own store, so sharing one would make a single twenty-a-day budget across both catalogues, and a farmer who priced twenty seed packets could not then ask about hiring a tractor. A test reads the route's middleware chain, because the bug being fixed was a route with no limiter, and a test of the limiter alone passes on that.
- **Admins see both catalogues' leads** at `/admin/enquiries`, switched by `?kind=inputs`. Until 2026-09-21 input leads were visible to nobody but the farmer who raised them (`getMyEnquiries`), so a lead `/inputs` produced could not be followed up or even counted. The list is **not** filtered by `SELLABLE`: that gate governs what a farmer may enquire about, not what an admin may read, and a shop whose licence has lapsed with farmers waiting on it is exactly when someone should be calling. It carries the shop's phone and never a licence number. Status changes take a `kind` because the two tables have separate id spaces; it defaults to equipment so an older admin page keeps working.

### The licence rule (inputs only, and it is the load-bearing one)

Selling seed, fertiliser or pesticide in India is a licensed trade: the **Seeds (Control) Order 1983**, the **Fertiliser (Control) Order 1985**, the **Insecticides Act 1968**. Licences are issued per state, per premises, by the state agriculture department.

CropBid holds none of them and must never need to. That is only true while **CropBid does not own the stock**: the shop is seller of record. It also leaves spurious-seed liability with the licensed seller whose label is on the packet rather than with the platform, which matters because a failed seed lot is among the most litigated claims in Indian agriculture.

`SELLABLE` in `agriInput.service.ts` is therefore a **query filter, not a post-filter**. Every read path composes it, so browse, detail, meta and enquiry are bound by the same rule and a guessed URL cannot walk around it. **Do not "simplify" it into a `.filter()` after the fetch.**

`ORGANIC`, `MICRONUTRIENT` and `SEEDLING` are ungated on purpose. Vermicompost, a zinc supplement and a mango sapling are not controlled the way certified seed is, and gating them would empty the catalogue for no legal gain.

**Corollary, and the one to remember: never make CropBid buy and resell inputs.** That needs all three licences in every state it operates, plus the crop-failure liability it currently does not carry. Any "we could hold stock and margin on it" proposal starts here.

Licence *numbers* never leave the server. Clients get booleans, enough to render "licensed seed dealer" without publishing a document reference someone could copy onto a fake shopfront.

**A licence reaches the production database only when a person who has checked the paperwork enters it**, in the admin panel since 2026-09-21 (below). The catalogue's licence numbers are placeholders in real state formats, and `SELLABLE` can only test that a column is not null, so whatever writes that column is the actual gate. `seed.ts` writes them, because a development database is where placeholders belong. `seedAgriInputs.ts`, the loader that runs against production, writes **no licence and no `verified` flag** on create or update: it goes through `supplierLoadFields` in the catalogue, and a test pins what that returns. A fresh production load therefore shows organic inputs, micronutrients and saplings and hides every seed, fertiliser and crop-protection row until a person enters the checked licence for that shop. That is the correct state, not a bug. Review caught the version before it, which loaded the placeholders: they passed the gate, put "holds a valid licence, checked by CropBid" over shops nobody had checked, and every re-run wrote them back over a licence someone had cleared.

### What ops see and do: `/admin/inputs` (shipped 2026-09-21)

**Every product in the catalogue, whether a farmer can see it and what each hidden one is waiting on; and the place ops add shops and products and enter licences.** Every read path above goes through `SELLABLE`, so before this an admin could not tell what the catalogue held, and "why is there no seed on /inputs" had no answer short of reading the database. A Shops view lists each shop's licences as on file or not, and which licences **its own stock** is waiting on: a shop selling only compost needs none and is not told otherwise.

Reading it:

- **Live is decided by running `SELLABLE` over the page**, not re-derived, so this screen cannot disagree with `/inputs`. Its headline live count is the number public browse returns, and a test pins that.
- **The explanation is `REQUIRED_LICENCE`**, the same rule written as data, because a query can say a row is hidden but not why. Two statements of one rule can drift, so `agriInput.admin.test.ts` runs every category against every licence mix on a real Postgres and fails if they disagree. It was watched failing with a gate removed from each side in turn. The same map tells the add-product form which licence a category needs, so the browser keeps no copy of the rule.
- **Every reason, not the first.** A product taken off at an unlicensed shop needs both put right; naming one sends someone to fix it and nothing changes.

Writing to it (the user's call, 2026-09-21: seeds and fertiliser are added from the admin panel, not only from the file):

- **Adding a product does not go round the gate.** A seed added to a shop with no seed licence is saved and stays hidden, exactly like a loaded one, and the form says so before the button is pressed.
- **The label rules live in the service**, so they bind any caller: a government-set price only on fertiliser, germination and seed treatment only on seed, at least one crop. They are checked on the product as it will be saved, so an edit that only changes the category cannot leave a germination figure on a bag of urea.
- **Crop names are matched to the catalogue's own spelling**, because `/inputs` filters on an exact match: "cotton" typed next to an existing "Cotton" would make a second chip and hide the product from the first.
- **A product's town and state are the shop's**, copied on save. **A shop's town and state cannot be edited**: a licence covers one premises in one state, so a shop that moves is a new shop. The API refuses the edit out loud rather than dropping the field.
- **A shop's state must be one on the server's list** (`server/src/utils/indianStates.ts`), matched whatever its case and stored in the list's spelling, because `/inputs` files products under the stored state and "Maharastra" would be a second state with the shop's products missing from Maharashtra. The add-shop picker reads that list from the API rather than keeping a copy.
- **Entering a licence needs the admin to tick that they have seen the document**, because `/inputs` then prints "holds a valid licence to sell this category, checked by CropBid" under that shop's products, and the tick is someone taking responsibility for that sentence. Removing one needs only a second click: taking a claim down is always safe. Licence entry is in the panel because without it a seed added there could never show on production, where no shop holds a licence yet.
- **The licence and its audit row are one transaction**, not written through `recordAudit`, which swallows its own failures. A licence with no record of who vouched for it must not exist. The row names which licences were entered or cleared and by whom, **never the numbers**: an audit table copying every licence number is a second place to copy them from, the same argument as §4a's payout details.
- **Still no phone numbers and no licence numbers going out**, admin included, and not even straight after saving one. Editing a shop's phone starts blank and blank means keep. Tests check the responses for both.
- **Every farmer-visible field is editable**, "Details" (`specs`) included, so a wrong line loaded from the file can be corrected in the panel.
- **Taking off** a product or a whole shop is `active: false`, reversible, and asks once before it acts. There is no delete: a product can have enquiries hanging off it.

Each product shows its enquiry count, linked to where the leads themselves are worked (`/admin/enquiries?kind=inputs`, above).

**Knowingly unbuilt:** an admin cannot mark a shop `verified` or upload product images from the panel. The machinery panel below can make its two claims, because they are the whole trust signal on `/equipment`; an input shop's is its licence, which the panel already handles.

### What ops see and do: `/admin/equipment` (shipped 2026-09-24)

**The machinery yard: dealers, their machines, and the two claims CropBid makes about a dealer.** The same screen as `/admin/inputs`, and it exists for the same reason: the catalogue reached the database through `prisma/seedEquipment.ts` alone, so a new dealer meant editing a file and waiting for a deploy.

- **No licence gate, and that is the difference.** Selling or hiring machinery is not a licensed trade the way selling certified seed is, so nothing is hidden from farmers by rule: a row is live unless somebody took it, or its dealer, off. `VISIBLE` in `equipment.service.ts` is that rule, composed by browse, detail, meta and the admin view alike, so the panel cannot disagree with `/equipment` about what is live.
- **The pricing rules are the ones `/equipment` already assumes**, and they live in the service so any caller is held to them: a machine offered for sale has a sale price, one offered for hire has a day rate or an hourly rate, and a sale-only machine carries neither a rate nor a deposit. `/equipment` filters a sale search on the sale price and a hire search on the day rate falling back to the hourly one, so a machine offered for something it has no price for is a row the farmer looking for it can never find. Checked on the machine as it will be saved, so an edit that only switches the mode is held to the same rules.
- **A machine is where its dealer is**, copied on save. **A dealer's town and state ARE editable**, unlike an input shop's, whose licence covers one premises: nothing about a machinery dealer is tied to an address that way. The move carries their machines with it in one transaction, because `/equipment` files a machine under its own state and a yard that moved to Nashik must not still answer Pune searches.
- **`verified` and `smamEmpanelled` are claims, not fields.** One badges the dealer and sorts them above everyone else; the other tells a farmer they can claim a government subsidy there, which they will act on and be out of pocket over if it is wrong. So they have their own endpoint, making one needs the admin to tick that they have checked, and the row and its audit entry are written in one transaction, never through `recordAudit`, which swallows its own failures. Taking one down needs only a second click.
- **The loader no longer writes those two** (`dealerLoadFields`, pinned by a test). It wrote them on create *and* update, so a re-run would have put a badge back over an admin who had taken it down, and badged dealers nobody had checked: exactly the mistake the inputs catalogue made with licences. `seed.ts` still writes them, because a development database is where a realistic mix belongs. **Dealers already carrying `verified` on production got it from the file, not from a person**, and nothing clears them; deciding whether to take them down is a job for whoever checks the paperwork.
- **Editing what the badge vouched for takes it down.** The tick is specific: this business exists at this town, in this state, and this number reaches them. So changing the name, town, state or phone of a verified dealer withdraws the claim, with its own audit row, and it has to be made again after checking; the form says so before saving. SMAM empanelment is about the scheme rather than the address, so it stands. Review caught the version without this, where an edit left the badge over details nobody had checked.
- **Still no phone numbers going out**, admin included, and not even straight after saving one, exactly as on the inputs panel. Editing a dealer's phone starts blank and blank means keep. A dealer's number leaves the server from `createEnquiry` alone.
- **Taking off** a machine or a whole dealer is `active: false`, reversible, and asks once. There is no delete: a machine can have enquiries hanging off it. Each machine shows its enquiry count, linked to where the leads are worked.

### Smaller calls worth not reversing

- **Crop leads the filter on `/inputs`, not category.** A farmer does not want "fertiliser", they want to know what goes on cotton, and it is the one filter they can always complete without knowing a product name.
- **Prices are per pack**, because that is how the trade sells: seed in 475g packets, urea in 45kg bags. A per-kg price would make every screen reconstruct the number the farmer actually pays.
- **Urea, DAP and MOP carry a statutory MRP.** Those rows are flagged `subsidised`, and the page says the price is set by government, identical at every licensed shop, and that paying more is overcharging reportable to the district agriculture officer. Presenting a controlled price as this shop's own offer would be misleading.

## 11. Mandi rates (rebuilt 2026-09-21)

**The whole day's feed is downloaded, held in memory, and every rate is computed from that one copy** (`services/mandiFeed.ts`). The board, a state's view, one crop's mandi table, the listing anchor and the forecast all read it. A request can start a refresh but never waits for one, except the first request after a restart, and `warmMandiFeed()` at boot usually has the day loaded before anyone asks. It refreshes every two hours, serving the old copy while the new one downloads.

It used to ask the feed per crop and per state, and the day it was checked properly (2026-09-21) every number on the board was wrong, for four reasons that are properties of the feed, measured, not guesses:

1. **Its filters match any shared word.** `filters[commodity]=Onion` returned spring onion too; "Green Chilli" and "Ginger(Green)" pulled in anything green; `filters[state]=Andhra Pradesh` returned all four Pradesh states, so a state's mandi table listed other states. The exact filter is `filters[<field>.keyword]`, and commodity names are matched on our side.
2. **No request reaches past row 10,000** (offset + limit), and a full day is about 17,000 rows. So the day is fetched one state at a time, and the states' totals must add up to the day's `total` before the copy counts as complete. **Every state is read before that check**, never stopping on a running total: the feed grows while it is read, so the states read first can reach the opening count while others are still unread.
3. **The shared demo key returns 10 rows whatever `limit` asks,** and replies `limit: 10`. The old pager took a page shorter than asked as "the end", so production quoted every crop as the median of the first 10 rows the feed happened to return. Maharashtra's onion was missing from /rates because its first row was number 24. Completeness is now judged on `total`, never on page length.
4. **A key is refused for a minute or two after a burst.** Thirty crops fetched at once was a burst; the same 28 requests one after another went through without a single 429. Requests are strictly sequential, and a 429 is waited out.

**Only a complete copy is ever served.** A half-read day (the first page after a restart, a sweep throttled half way, the demo key's 10 rows) is a slice of the country, and the board, a listing's anchor and the forecast would all show it as live national prices with no way to say otherwise. Until a complete copy exists, and once the last one is three days old, they get reference prices, labelled as such.

**The last complete copy is kept in the database, so a restart does not lose it** (2026-09-26). Every deploy restarts the API, and the copy used to live in memory alone: on 2026-09-26 data.gov.in was down all day, a deploy threw away the only complete copy of the 25th, and the rates went to reference prices until the feed came back. Each complete download is now also saved to `MandiFeedCopy` (`services/mandiFeedStore.ts`), one row rewritten in place, about 300 KB gzipped; a restart serves it at once and downloads afresh behind it.
- **A save only moves the copy forward**, with the condition in the write itself: in a deploy's overlap the old process's download can finish second while being older.
- **A restored copy never replaces a fresher one** already downloaded, and one older than three days is not served, the same rule as in memory. It is handed to the same subscribers as a download, so "vs usual" is there after a restart.
- **The database is never in the way.** A failed read or save is logged and the feed carries on as before the store existed, and a cold visitor waits at most ten seconds for the database and the download together, released by whichever produces a copy first, so a hung read cannot hold them while a fresh download sits ready.

**`services/mandiCommodities.ts` says what each of the feed's ~260 names is**: its group, a readable label, and which names are one product. Merges were checked against the day's prices first: bhindi and "Ladies Finger", capsicum and "Chilly Capsicum", both mango codes, and "Paddy(Common)" into the board's paddy, whose own name had no rows at all. Lemon (₹150/kg) and lime (₹50/kg) stay apart, as do onion and spring onion. Livestock, flowers, wood and fodder are left out. **A name the table does not know is shown under "Other farm produce", not dropped**, so a new crop reaches the page the day it is first reported.

**Every commodity's icon comes from `EMOJI` in the same file, the 30 board crops included** (2026-09-25). `BOARD` carries no icon of its own, so there is one table to edit. A crop with no emoji of its own falls back to its group's icon. Before this, every commodity outside the 30 board crops showed its group's icon, so the whole vegetable list was 🥬. Unicode has about forty food emoji, so most gourds, dals and millets still share a group icon. Real photos are the fix, and those are being collected. A test fails if an `EMOJI` key is not a real commodity id, because a typo'd key does not error: that crop just keeps the group icon.

**What the numbers mean:**
- The price is the median of the mandis' modal prices. The range beneath it is **where most mandis sat** (10th to 90th percentile) once five or more reported, not the single lowest and highest report: with hundreds of reports the extremes are always somebody's typo. Patti (Punjab) reported onion at ₹0.07 a quintal and the card read "₹0 to ₹120".
- A report under a tenth or over ten times the crop's median is left out of every figure, and the mandi table says how many were. They are typos or per-piece prices (Pune radish at ₹10 a quintal is a price per bunch).
- **The date on the rates is the feed's newest `arrival_date`, not the calendar date**, so on a morning before mandis report, or a day data.gov.in is down, it is yesterday or older. The headings say "Today's mandi rates" only when that date is today in IST, "Latest mandi rates · reported 25 Sep" when it is older, and plain "Mandi rates" while loading or over reference prices, which the server stamps with today's date although no report carried them. They re-render at IST midnight, so a page left open overnight does not go on calling yesterday today. `client/src/utils/ratesDate.ts` on the web, `mobile/src/lib/ratesDate.ts` in the app.
- The feed spells five states its own way ("Keralam", "Chattisgarh", "NCT of Delhi", "Pondicherry", "Andaman and Nicobar"). Rows are stored under `utils/indianStates` spelling, so "Kerala" from a listing or a picker finds Kerala.

**The board stays 30 crops; the rates pages show everything.** `GET /rates/board` is what the storefront strip, the dashboards, the app's rates rail and the forecast read, and they are built around 30. `GET /rates/all` is every commodity the day reported (about 220), grouped, and both full rates pages read it: `/rates` on the web and the app's `RatesScreen`. Each has a search box and a state picker listing the states that actually reported, and a crop's mandis open over the page (a dialog on the web, a bottom sheet in the app, both closed with a ×) rather than unfolding under the card, which on a group of sixty vegetables pushed the rest of the page out of reach. On a phone the web dialog lists each mandi as a row, market with its place underneath and price on the right, because the nine-column table put the price off screen. While it is open the rest of the page is `inert` and Tab cycles inside it, since `aria-modal` alone let focus walk into the cards behind. The app keeps its own group titles, because the English title is the key its Hindi and Marathi translations are looked up by. With a state picked, `/rates/all` lists what that state reported plus the 30 board crops through their usual fallback. **With no copy of the feed at all**, it lists every commodity CropBid has an average for (`usualCommodities()`), at that all-India average and labelled reference like the board crops, instead of shrinking to the 30 with typed-in prices (2026-09-26, the day that happened). Only then: with a copy, a crop that did not report is still left out, because a reference row among the day's reports would read as one of them.

**Production had no registered key until 2026-09-21.** It is set in the Lightsail `.env` now. A registered key is also shared by anything else that uses it, local development included.

**"Vs usual" is learned, not typed in (2026-09-22).** It compares today's price with what the crop has sold for lately: a running average kept in `UsualPrice` (`services/usualPrices.ts`), a plain mean for the first 30 days and then each new day weighted a thirtieth, so it follows the seasons unattended. Every commodity has one, not only the 30. It replaced a price typed in per crop that nobody updated, which had onion's "usual" at ₹18/kg against ₹47 and made the forecast read that gap as scarcity.
- **It compares state by state, never an all-India price with an all-India average.** The day's reports arrive unevenly: on 2026-09-22 at 14:50 Tamil Nadu's farmer markets (potato ₹35/kg) had all reported and Uttar Pradesh's bulk mandis (₹5.5) a third of theirs, so the all-India median read ₹18 against the previous day's ₹11, "+57%", while neither state's price had moved. So there is one average per crop per state (plus an all-India row, state `""`, used only as the fallback price); a state is compared with its own past, and the all-India "vs usual" is the median change across the states that have reported. The same day that read +57.5% for potato and +22.6% for garlic reads −6.2% and −1.6%. A "wait until enough mandis report" rule was proposed first and rejected: two-thirds of potato's reports were already in.
- **It started from nothing on 2026-09-22** (the user's call, over backfilling from data.gov's history dataset, which does exist and is current). A crop with no earlier day on record shows **no comparison**, not 0%: `/rates/all` sends `usual: null`, the board sends `usualDays: 0`, and the landing page, dashboard and forecast all treat that as "nothing to compare" rather than "steady". A state's price against today's national one is a gap between places, never a move against usual.
- **A day counts once, with its last price**, folded in when the feed first shows the next date: a morning refresh carries only the mandis that have reported by then.
- **The database does the folding, and every process reads the result back.** Each row carries the day it is watching and that day's latest price (`pendingDay`, `pendingPerQuintal`), written with every refresh; the first write of a later date folds the watched day into the average in the same UPDATE, from the row as committed, and `RETURNING` is what each process keeps in memory. Review caught the first version, which folded in memory and wrote once a day: a restart between a day's last refresh and the next date lost that day for good, and two processes in a deploy's overlap could each keep an average the other had overwritten. An older copy (a stale download) changes nothing.
- **One row per crop per state, updated in place**: about 1,600 rows (perhaps 3,000 once a year of seasonal crops has passed) and under 1 MB for good. It is written with each refresh, at most every two hours and only when someone asks for rates, so the free-plan Neon database is awake anyway; the user agreed to "once a day" first and was told when review changed it. They asked about the size before agreeing: 0.5 GB is the free limit, CropBid uses about 10 MB, and the "LIMIT 50" in Neon's table viewer is its paging, not a limit on rows.
- `fallbackPerQuintal` on the board is now only a last resort: the reference price for a board crop CropBid has no history for at all. A crop the feed stops reporting falls back to its own recent average instead.

