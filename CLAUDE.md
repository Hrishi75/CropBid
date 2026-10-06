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
| **Demand board** | Buyers post what they need | Farmers fill at the posted price or make an offer (a restaurant's request takes offers only, §9) |
| **Retail** | Households | Browse by shop, buy by the kilo. Nagpur only. |

Every listing is anchored to the day's government mandi rate (AGMARKNET, 4,600+ mandis) so both sides negotiate against the same public reference price. §11 says how those rates are read, and why the obvious way is wrong. Money is captured into escrow via Razorpay and settles after delivery is confirmed. **Read §6 before writing anything about payouts.**

Alongside those three channels sit **two lead-gen marketplaces** that sell the farmer their *inputs* rather than buying their output: `/equipment` (machinery to buy or hire) and `/inputs` (seed, fertiliser, crop protection). They are a different shape from everything above and §10 is the section that governs them.

Languages: English, Hindi, Marathi. Sign-up is a name, an email or phone number, and a password, with no code; sign-in is that password. On the website, Continue with Google does either in one tap. A phone code over WhatsApp survives as the secondary lane (§4).

## 2. Business facts

- **India only.** Governing law India, jurisdiction Pune, Maharashtra *(unconfirmed, so confirm it before it matters)*.
- **Not yet incorporated.** Incorporation in progress. `/terms` and `/privacy` say so outright rather than naming a company that does not exist. Wired to an `OPERATOR` constant in `client/src/pages/TermsPage.tsx`. **Fill it the day the certificate arrives** and the interim wording disappears on its own.
- The footer must not say "CropBid, **Inc.**", a US suffix on an unincorporated Indian business. It did for a long time.
- **Fee: flat 2% on a settled deal** (`PLATFORM_FEE_PERCENT`, `transaction.service.ts`). Listing, accounts and mandi rates are free, and **onboarding is free**: there is no signup charge anywhere in the codebase, so nothing on screen may imply one. Freight is charged separately and on top, see §2a. Households also pay a delivery fee on small shop orders, see §3b; the 2% is never taken on it.
- **Household delivery: free from ₹200 of one shop's items, ₹30 below that** (`RETAIL_DELIVERY`, `retailOrder.service.ts`). There is **no minimum order** any more. §3b has the whole of it.
- **Retail footprint: Nagpur only (since 2026-10-03; it was Pune and Nagpur).** `RETAIL_CITIES` in `server/src/utils/retailCities.ts` is the one list, and it is a decision, not a count of stock: Pune shops still hold stock and the seed still loads them, but `/browse/cities`, the shop list, a shop's page and `createRetailOrder` all refuse a city not on it, so no client can order into one. The app sends a shopper whose saved city was dropped back to the city picker and says why. Adding a city means adding it there and changing `/terms` §8, `/how-it-works`, the FAQ, the FAQ's SEO description and the app's About screen in the same PR. Wholesale is national, because a lot can be freighted and a few kilos cannot. **But read §2a before repeating "national":** if every wholesale lot has to be physically inspected, wholesale reaches as far as the inspectors do, and today that is nobody.

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
- **Where it lives:** the shopper's order page and the app's order card; the shop uses the "Can't fulfil this order?" form on `/transactions/:id`, which is where it already marks orders on the way, and an admin uses the same page ("Cancel this shop order"), reached from **View** on Admin → Transactions. That link was a 403 for every admin until 2026-09-22, because `getTransaction` let only the two sides of the deal in. A shop on a phone cancels from its order card on My Shop ("Can't fulfil this order?", 2026-10-05): pick a reason or type one, and the whole order is called off, the same endpoint as the website.

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

**The seed carries the Fresh lane.** Indian farmers are spread across fifteen cities for the wholesale market and only Pune and Nagpur were retail cities when this was written (Nagpur alone since 2026-10-03, §2), so almost no farm lot landed anywhere a household could be delivered from and the lane showed one item. `seed.ts` §7c adds four farms in the two retail cities.

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

### Sign in with Google (web only, 2026-10-06)

**Google's own button at the top of the sign-in and create-account lanes, and one endpoint, `POST /auth/google`, that signs in, links or creates.** The browser gets an ID token from Google and posts it; `utils/googleIdToken.ts` checks its signature, expiry and, most importantly, that it was issued to **our** client id, because without the audience check a token any other Google-sign-in site received would sign its holder in here.

- **Found by Google id first, then by email.** `User.googleId` is the token's `sub`, which never changes, whereas a Google address can.
- **A matching email is linked, not refused** (the user's call, of three options). Google has proved the person owns the address, which is more than CropBid's own sign-up ever checks (above, "Knowingly unverified"). Signing in replaces the account's one refresh token, so anyone else signed in under that email is out at their next refresh.
- **Linking removes the password** (the user's call, reversing the first version after review). Nothing proves who chose it, and kept, it let whoever registered the address before its owner arrived go on signing in, change the password, or delete the account. A pending reset link and an outstanding support reset go with it. The window says the old password has stopped working and points at Forgot password, whose link goes to the address Google proved. Signing in again by Google later never touches a password set after the link.
- **Still open: a phone number on the account.** Profile edits can add one, so whoever registered first may have attached their own, and the WhatsApp-code lane would still let them in. Linking leaves it alone, because clearing it would also strip the owner's own number. Deciding that is the next step if this matters.
- **The link is a conditional write**, on the account still having no Google id and still having the password read. Two different Google accounts racing for one email's account (an address can move between Google accounts) get one winner and one 409; tested ten rounds on a real Postgres and watched failing with the condition removed. An account linked to a different Google id is refused outright rather than moved.
- **A new person is a shopper with no password**, named from Google's profile (or the front of the email), exactly like a phone-code account: change-password sets a first password, and deleting the account needs one first.
- **Never an admin account**, linked or signed in, the same caution as support refusing to reset one. Suspended accounts are refused before anything is written.
- **`googleId` never leaves the server** (`safeUser` strips it), and anonymising a deleted account clears it, or Google would still sign in to the shell. A test pins that.
- **Off until configured.** `GOOGLE_CLIENT_ID` on the API and `VITE_GOOGLE_CLIENT_ID` on the website, the same OAuth "Web application" id, with every site origin listed as an authorised JavaScript origin. Blank, the button is not drawn and the endpoint answers 503. The privacy page discloses what Google sends us; **the FAQ does not mention Google yet**, because it would be false while production has no id set. Add it when the id goes live.
- **Not built: the app.** It needs Android and iOS client ids and a native build to test, and was deferred, not decided against.

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

**One session per account, and tabs take turns refreshing it** (2026-10-05). There is one refresh token per user and every refresh rotates it, so two tabs refreshing at the same moment both sent the same cookie, the first won and the second tab signed itself out. Every web refresh now goes through `refreshSession()` in `client/src/lib/axios.ts`, which holds a browser-wide Web Lock, so a waiting tab sends the cookie the first one just received. Reproduced first (two simultaneous refreshes: 200 and 401), then four under the lock all 200.

**Keeping a session alive is not rate-limited as a sign-in attempt** (2026-10-05). `authLimiter` (15 per 15 minutes) covered all of `/api/auth`, `/refresh` and `/me` included, and a refresh names no account, so it was counted per IP alone: every user behind one office or mobile-carrier address shared 15 refreshes a quarter-hour, and past that the 429 signed them out. `/refresh`, `/me` and `/logout` now skip it (`isSessionRoute`, tested) and fall under the general `apiLimiter`; every route that checks a credential is still counted. **And only a refusal ends a session:** the web and the app both treated any failed refresh as signed out, and the app deleted its stored token on a dropped connection. Now only a 401 or 403 does; a 429, a 5xx or no network keeps the session for the next request. **Still true and unfixed:** signing in on a second device (the app, another browser) replaces the token and ends the first device's session at its next refresh. Fixing that needs a session per device, which touches every conditional credential write above.

**Knowingly unverified.** Nothing proves the email or number belongs to the person typing it. A typo'd email means the reset link goes to a stranger, and anyone can claim a number before its owner arrives. That is the price of no code, and it is the thing phone OTP is meant to fix.

**Phone numbers are matched exactly as stored**, and nothing adds a country code. `98220 55667` is stored as `9822055667` and `+91 98220 55667` as `+919822055667`, so an account made one way cannot sign in typed the other way. This predates the sign-up form, but it bites more now that everyone types a number into a password form. Fixing it means choosing one canonical form (probably `+91` on any 10-digit number) and backfilling the column.

**Admin → Users shows each account's phone and searches by it** (2026-10-03), because support is rung by people and a phone-only account has no email to look up. The search works around the problem above rather than fixing it: both sides are compared as digits only: `phoneSearchDigits` in `admin.service.ts` strips the search and drops a leading `91`, the query strips the stored number, and they match as a substring, so `+91 98220 55667` finds `9822055667`, `+919822055667` and `98220-55667` (the profile editor keeps punctuation). Only text with no letters (any script) and no `@`, holding four or more digits, is a phone search; any other punctuation is let through, since the profile editor stores `98220.55667` as readily as a dash, so "Ward 2026" is a name and does not pull in every number containing 2026.

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

**The website has the same split since 2026-10-05** (`client/src/utils/partner.ts`). Before it, a shopper who applied was sent to `/partner/status`, which found no application because it read the role, and bounced them to the homepage: no web applicant ever saw "under review". Now `partnerApplication()` reads the profile whatever the role, `isPendingPartner()` keeps the role check for navigation, and `hasOpenApplication()` puts "Your application · status" in the homepage account menu and a banner on `/partner`. The status page also waits for the session to be restored before deciding, because opening it from a link or a refresh always bounced to sign-in, and it no longer promises an email to an account made with a phone number alone.

**Unresolved, and now more visible:** roles are exclusive, so an approved seller cannot use the cart (`/cart`, `/checkout`, `/orders` are `allowedRoles={['CONSUMER']}`; `POST /bids/direct-purchase` is `requireRole('CONSUMER')`). `ShopScreen` renders the shelf read-only for them rather than 403ing at checkout, and `JoinScreen` warns before they apply, but both are plasters. If selling should stack on top of shopping, that is a role-to-capabilities refactor nobody has decided.

### A seller can also buy, in a second mode (shipped 2026-10-04)

**One account, two sides, switched in the app. Built for a local shop buying stock for itself; the server allows any seller.** The user's call: apply to buy, and once approved switch between selling and buying, rather than a second account with its own login and wallet.

- **The role does not change.** The account stays `FARMER`; its buyer application is filed alongside (`CAN_APPLY_AS_BUYER` now includes FARMER) and reviewed in the same queue, and approval only approves the buyer profile, because `reviewPartnerApplication` promotes a row still at CONSUMER and nothing else.
- **Buying mode is a header, decided by the database.** While the app is on the buying side it sends `X-Act-As: BUYER`. `authenticate` honours it only after reading an APPROVED buyer profile for that account, then sets `req.user.role = 'BUYER'` and keeps the real role as `accountRole`. So every `requireRole('BUYER')` and every service that branches on the role works unchanged, the seller side is closed while buying, and the header is worth nothing alone. Seven tests in `auth.actAs.test.ts`, and the two refusal tests were watched failing with the check removed.
- **The app shows the account as a buyer** in that mode (`AuthContext` hands out `user` with role BUYER and sends the header in the same render), so the existing buyer tabs and screens appear without knowing modes exist. The side is remembered on the device, reset on sign-out, and dropped if the buyer approval is revoked.
- **Self-dealing was already refused**: a bid on your own lot and filling your own requirement both 400.
- **The website has the switch too (2026-10-05):** in the account menu, the mobile drawer, and on a shop's or wholesaler's dashboard (`components/layout/ModeSwitch`), with the same rules: `AuthContext` hands pages the account as a BUYER and `lib/axios` sends the header. A shop or wholesaler not yet approved gets a card on its dashboard to apply (`components/BuyStockCard`), which opens the buyer form through the same door `/partner` uses.
- **Not covered:** the live-auction socket authenticates separately and ignores the header, so auctions are not open in buying mode; a shop still cannot use the household cart.

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
- Privacy must disclose Cloudflare Web Analytics, browser storage, and that a seller gets the buyer's contact details **when payment clears**, not at checkout (`contactVisibility.ts`).

### The website is hosted on Cloudflare (decided 2026-10-06)

**A Cloudflare Worker serves `client/dist`; the site moved off Vercel on 2026-10-06.** Vercel's free plan is for non-commercial use only, and CropBid takes money, so staying meant Pro at $20 a member a month. Cloudflare's free plan allows commercial sites. The build is unchanged: `npm run build` already prerenders every public page to a file, so any static host works.

- **`client/wrangler.jsonc` is the routing.** `drop-trailing-slash` serves `/faq` from `faq/index.html` and redirects `/faq/` to `/faq`; the default would do the opposite and split every page across two URLs against the canonical tags and the sitemap. `single-page-application` serves the app shell to a browser navigating to a signed-in path. **`client/worker.js` runs only when no file matched**, so real files never invoke it or count against the Workers free allowance: it 404s `/assets/*` and `/api/*` (a missing script must fail as missing, not come back as the homepage with a 200, which is what Vercel's rewrite exclusions used to guarantee) and gives anything else, such as a crawler with no `Sec-Fetch-Mode`, the app shell. `client/public/_headers` carries the cache headers.
- **The Worker is named `cropbid`, and `name` in `wrangler.jsonc` must match the dashboard.** A mismatch fails the build with "Failed to bind worker" and creates no Worker; the first import failed exactly that way.
- **`www` is not a Worker domain.** It is a proxied CNAME to the apex plus a Redirect Rule (`https://www.cropbid.in/*` to `https://cropbid.in/${1}`, 301, query kept), because `CLIENT_URL` is the apex and `www` never needs to serve the site. **Always Use HTTPS is on**, and it is load-bearing: without it `http://www.cropbid.in` returned a 522, since the rule only matches `https`.
- **`vercel.json` is gone** and the privacy page names Cloudflare alone. Deleting the Vercel project itself is a dashboard step, not a code one.
- **Page views are Cloudflare Web Analytics** (`components/ui/PageAnalytics.tsx`), cookie-free like Vercel's was, so the cookie notice stays a notice. It reports only from `cropbid.in` in a production build. Its token is public by design but is a build variable (`VITE_CF_ANALYTICS_TOKEN`), not a literal, because GitGuardian flags any token-shaped string in the repo; unset, nothing reports.
- **DNS is on Cloudflare**, moved from Hostinger (still the registrar). Only `cropbid.in` and `www` are proxied. `api.cropbid.in` stays DNS only (Caddy gets its own certificate, and the auction socket is long-lived), and so do the Zoho MX, DKIM and Brevo link records: proxied, those break email and the links inside it.
- **Every `VITE_` build variable is public**, inlined into the bundle each visitor downloads: the API origin, the Google client id and the analytics token. Secrets live only in the API's `.env` on Lightsail.

### The homepage hero slides to two partner banners (2026-10-06)

`HeroCarousel` in `LandingPage.tsx`: the existing hero, then "Become a Partner to Sell" and "... to Buy" (`client/public/banners/`), on one scroll-snap track with arrows, dots, and a slide every 5 seconds that loops for good (the user's call: it always rotates). It holds only while a finger or mouse button is down on it, and a manual move restarts the 5 seconds. Both banners are one page side by side above 960px, one each below. A banner is a button: signed in, it goes to `/partner#sell` or `#buy`; signed out, it opens the sign-in window with that as `redirectTo`. An approved seller is not shown the sell banner, nor a buyer the buy banner.

**The copy is baked into the artwork, so it is outside this file's reach unless someone regenerates the picture.** As supplied, the sell banner says "Faster Payments" (payouts are a manual transfer, §6) and the buy banner "Quality Produce" (nothing checks a lot, §2b). Both are on screen until the images are redone.

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

These began in `mobile/`. Where the website has caught up, the section says so; where it does not, assume the website lacks it.

### The wallet: prepaid credits

**1 credit is 1 rupee.** No exchange rate, no bonus multiplier, no expiry, because each of those is a pricing decision nobody has taken. A pill in the storefront header shows the balance; `screens/WalletScreen` holds the statement and the top-up.

`WalletEntry` is the record and `Wallet.balance` is a cache of it, both moved inside one transaction by the single function that writes either.

**Two different races, two different guards**, and conflating them is what review caught:

- **The same payment twice** (a retrying client, a webhook racing the callback) loses to the UNIQUE index on `razorpayPaymentId`. A database guarantee, not a check-then-act.
- **Two different payments together** is not covered by that index at all. Under READ COMMITTED both read the same balance and the second `set` erases the first. `applyEntry` takes `SELECT ... FOR UPDATE` on the wallet row.

**A wallet that has ever moved blocks deleting the account.** The wallet and its entries cascade with the user row, so an admin hard-delete would keep the money and lose the record of whose it is. `userDeleteBlocker` in `admin.service.ts` is the rule, for this and for accounts with deals, and the admin user list sends its answer on every row so the panel never offers a delete the server refuses.

**The credited amount is read from Razorpay, never from the request**, or a client could mint credits for free. **Ownership is proved from the ORDER's notes, not the payment's**: Razorpay does not copy order notes onto the payment entity, so the original check found nothing and passed by default, which would have let a signed payment from any other flow be replayed as a top-up. **Captured only**: `authorized` reserves funds that the capture can still fail to take. Floor ₹100, ceiling ₹50,000. 20 tests.

### An exporter's market is export-ready lots (2026-10-05)

**A buyer whose company type is EXPORTER gets a filter row under the market's category chips: Grade A, Organic, and a smallest lot size (any, 10+, 50+, 100+ quintals).** The user's pick of four options for what makes the exporter side different; the export request form and the exporter dashboard followed (below).

- **Grade A and 10+ quintals are on when an exporter arrives.** They are chips on screen, so what is hidden is never a secret, and the count under the row ("32 lots match") is the server's total for those filters.
- **The filters run on the server** (`GET /browse` with `quality`, `organic`, `minQuintals`), not over the page on the phone, because the market loads one page and a filter over that hides every match on the next.
- **The size floor is converted per unit.** Lots are listed in kg, quintals or tonnes, so 50 quintals is matched as 5,000 kg and 5 tonnes, on remaining stock. Compared raw, "50" would let a 60 kg lot through and shut out a 6 tonne one. `browse.minQuintals.test.ts` runs it on a real Postgres.
- **`quality` is now checked against A, B and C.** Anything else used to go straight into the Prisma WHERE clause and come back as a 500.
- **"Grade A" is the seller's own grade.** Nothing checks it (§2b), so the row filters on what the listing says, and no copy may call these lots inspected or certified for export.

**An exporter's request goes to a port (2026-10-05).** For a buyer whose company type is EXPORTER, the post-a-request form swaps the city and state boxes for a port picker and adds a card of what the seller must meet: a moisture limit, the packing, and the documents to hand over. The request is stored on `BuyerRequirement` (`forExport`, `exportPort`, `maxMoisturePct`, `packing`, `requiredDocs`), and the rules live in `server/src/utils/exportSpec.ts`.

- **The port is the delivery address.** The server writes the port's city and state into `deliveryLocation`/`deliveryState` whatever the request sent, so the two cannot disagree and a seller sees one place to deliver to. The demand card says "TO PORT".
- **Eight ports and three documents, served** at `GET /requirements/export-options` (buyers and sellers), so the app keeps no copy. The documents are the ones a seller can produce: a residue lab report, an NPOP organic certificate, a GST invoice. The phytosanitary certificate and shipping bill are the exporter's own filings, and the form says so rather than asking a farmer for them.
- **An organic certificate only on an organic request**, refused otherwise, because no conventional seller could meet it. The form greys the box out until Organic is on.
- **Set when posted, not editable.** Changing the port would move the delivery address under offers already made to the old one, so the edit schema does not accept the export fields at all rather than accepting and ignoring them.
- **A request not for export carries no export details**, even if a client sends some.
- **Nothing checks any of it.** Moisture, packing and documents are what the exporter asked for, not what anyone verified (§2b).
- **Payment and delivery terms are pickers now** (Letter of credit / 7 days / 15 days; FOB / CIF), for every buyer. They were free-text boxes over a server that accepts only those codes, so anything typed there failed the whole request.
- **The website posts them too (2026-10-05):** an exporter's request form on the site has the same port picker, moisture, packing and documents, read from the same endpoint. Its market has the lot-size chips for every buyer, on at Grade A and 10+ quintals for an exporter, beside the grade and organic filters it already had. Sellers on the site's demand pages see "TO PORT" and an "exporter asks for" block (moisture, packing, documents), with the names read from the same endpoint (`client/src/utils/exportOptions.ts`).

**An exporter's dashboard has an export book (2026-10-05)** (`components/ExportBook`), under "Needs your decision", which stays first because it is work and the book is a view.

- **Tonnes, whatever unit each lot was listed in:** contracted across every deal, and received (deals the exporter has confirmed), because an exporter plans containers, not rupees.
- **By crop and sourced from**, as tonnes and shares. The source state is what decides inland freight and the nearest port.
- **On the way:** every unfinished deal by where it is: to pay, booking transport (ops books it, §2a), being collected, on the road, arrived. Read off the deal's own payment, delivery and shipment states, so it cannot disagree with Contracts. A deal the seller marked in transit with no shipment row counts as on the road.
- **Computed on the phone from `GET /transactions`**, which already carries the bid's quantity, the lot's unit and state, and the shipment status (never the carrier, §2a). Cancelled and refunded deals are left out.
- **It never says "shipment to port".** A deal struck on a listing is delivered where the deal says; only an export request names a port.
- **Seed data can link one deal to two buyers.** The seed attached a deal for one buyer to another buyer's bid. A bid holds one deal, and making one is idempotent, so accepting that bid "succeeds" without giving its buyer anything. Only the seed can produce this; test with fresh bids.

### A restaurant negotiates, and its orders repeat (2026-10-05)

**The user's words: restaurants "dont buy on the things they just negotiate".** Asked what that covers, they chose all three: a restaurant counters a seller's offer, its requests cannot be filled at the posted price, and it does not bid on listed lots. Repeat orders were the feature they picked before that, from four options, because a kitchen buys the same onions every week.

- **Counter, and back again.** A seller's offer on a request is PENDING (the buyer's move). The buyer can now counter with a lower price, which makes it COUNTERED (the seller's move, `buyerCounterPrice`). The seller accepts that price (`PUT /offers/:id/accept-counter`, which makes the deal at it) or sends a new one between the two (`/revise`, back to PENDING). Either side can still decline or withdraw. Open to every buyer, not only restaurants, since nothing about countering is restaurant-specific.
- **One deal-making path.** The buyer accepting and the seller accepting a counter both go through `finaliseOffer`, which claims the offer conditional on its status and on the price the decision was made at, so a revise landing during an accept makes the accept miss rather than fill at a stale price. A test races the two six rounds and checks the winner's price survives; it was watched failing with the condition removed.
- **COUNTERED is a live offer.** Every sweep that retires offers (a fill, a close, an edit, a repost) retires PENDING and COUNTERED alike (`LIVE_OFFER`), and a seller with a countered offer cannot open a second one on the same request.
- **Negotiate-only requests.** A RESTAURANT buyer's request is posted with `negotiateOnly`, from the company type at posting. An instant fill is refused, in the claim's own WHERE as well as up front, so no request can fill at its posted price while negotiate-only. The app shows sellers "Make an offer" and no "Fill at".
- **No bids on the market for a restaurant.** `POST /bids` and the live-auction socket both refuse it (`bidsOnMarket`, read from the profile at the moment of bidding, 403 `RESTAURANT_NO_BIDS`). The app shows lots as VIEW, and a lot's page offers "Ask sellers for this", which opens the request form with the crop filled in. The banner reads "Know the rate, then negotiate."
- **Repeat orders.** A request can repeat every 3, 7 or 14 days (`repeatEveryDays`, `nextRepeatAt`, `seriesId`); a restaurant's form starts on weekly. Every 15 minutes the API posts a fresh copy of each one that has fallen due: same terms, the full quantity, the deadline moved on, and the series handed to the copy. The old one stops repeating and, if still open, is closed with its live offers expired, because last week's unfilled need is not this week's. Each repost is claimed on the `nextRepeatAt` it was read with, inside the transaction that creates the copy, so a deploy's two processes cannot both post it (tested, and watched failing unclaimed). Withdrawing a request stops it; the request page has Once / every 3 days / weekly / every 2 weeks. **Changing the repeat is conditional on the repeat as read**, because the repost job claims a request by clearing `nextRepeatAt`: without it, "Once" pressed as the job ran was saved on the old copy while the new one kept repeating (raced ten rounds in a test, watched failing 3 of 3 without the condition). The repeat is not a field on the edit endpoint because it is also allowed on a FULFILLED request.
- **The website (2026-10-05):** buyers counter and sellers answer on the same offer card (`RequirementOfferCard`, a "You countered" tab on a request and "Buyer countered" on My Offers); a restaurant's request shows sellers Make an offer instead of Fill; a restaurant's bid form points it to post a request, with the crop prefilled. Repeats are set on the website's request form ("How often") and changed or stopped from a card on the request's page.
- **Not built:** repeating does not skip a week the kitchen is shut.

### An FMCG buyer buys on supply contracts (2026-10-05)

**One price, a large total, delivered in batches** (`SupplyContract`, `services/supplyContract.service.ts`, `/api/contracts`). The user's pick of four options for what sets FMCG apart; quality specs and many-sellers-one-order were the others and are not built.

- **Proposed from a lot.** On a lot's page an FMCG buyer gets "Need this every month?" under the bid card: a total, a batch size, every 7, 14 or 30 days, and one price, with the sum and the number of batches worked out as they type. The price may not be under the lot's floor, the same as a bid. At most 52 batches; a local shop's lot takes no contracts. **The server holds the FMCG rule too** (403 for any other company type); opening it to others is one line in `assertCanPropose`.
- **The seller accepts or declines** on their Offers tab, where proposals sit above single offers and count in the heading. Either side can end an active contract; the buyer can withdraw a proposal.
- **A contract never reserves the lot's stock.** It runs for months and the lot is today's harvest. Batches do not draw on it.
- **Each batch is an ordinary deal.** When one falls due (the 15-minute tick in `index.ts`, and at once on accepting a contract that starts now) it is made through the same three rows a requirement fill uses: a SOLD Listing marked `isRequirementFill` and `supplyContractId`, an ACCEPTED Bid, and `createTransaction`. So it is paid into escrow, carries the 2% fee, pages ops to book transport (§2a), and appears on both sides' deal screens unchanged. The last batch is the remainder; the contract is COMPLETED once every batch is made.
- **Each batch is claimed** on the `nextBatchAt` and `scheduledQuantity` it was read with, inside the transaction that makes the deal, so two processes cannot both make one and a cancel committing first makes the claim miss. Tested five rounds, and watched failing with the claim removed.
- **Ending a contract stops further batches; batches already made stay deals**, paid or payable, and undoing one is an admin refund like any other deal (§6).
- **The website (2026-10-05):** a Contracts page for both sides (`pages/shared/ContractsPage`, `/contracts`, in the nav), with accept, decline, withdraw and end, and the FMCG proposal under the bid form on a lot (`components/contracts/ContractProposal`). The contract notifications land there; a batch notification opens its deal.
- **A batch sends ops the same new-order alert as any deal** (`alertNewOrder`, channel `SUPPLY_CONTRACT_BATCH`), after its transaction commits. Review caught batches skipping it.
- **A proposed or running contract blocks deleting either account**, on the self-service delete and the admin one (`CONTRACTS` in `userDeleteBlocker`). The contract cascades with the user row, so a delete used to end the other side's agreement without a word, and an anonymised account would have kept getting batches.
- **Not built:** batches cannot be skipped or resized after accepting; nothing nudges a buyer who leaves a batch unpaid while the next one falls due.

**Lots priced in another currency no longer front a rupee card.** Seed lots in USD (an Australian wheat lot at $260/tonne) were compared as rupees, so the grouped wheat card read "from ₹26/qtl" and the compare screen gave that lot BEST PRICE. Both now rank rupee lots first.

### A store restocks with a list (2026-10-05)

**Several crops, one delivery, posted together** (`POST /api/requirements/list`, `screens/buyer/RestockListScreen`). The user's pick of four options for retailers; smaller shelf-ready lots and store locations were the others and are not built.

- **Who gets it:** a RETAILER buyer, and **a local shop on its buying side** (§4, "A seller can also buy"), whatever company type it applied under, because the user pointed out that a local shop restocking is the same job (`mobile/src/lib/restock.ts`). For them "Post" on Requests, the dashboard and the profile opens the list; "Just one crop?" goes to the single form. Anyone can use the endpoint.
- **Each item is an ordinary request.** Sellers offer on the items they have, and every offer, counter (§9 restaurants) and deal works as for one request. The items share `listId` and `listName`, and Requests shows them under one "Restock list" header.
- **All or none.** Two to fifteen items, each crop once, posted in one transaction, so a list is never half up.
- **One address and date for the whole list**, and it can repeat; the items fall due together and the copies keep the list's id and name.
- **The website (2026-10-05):** the same list at `/buyer/requirements/list` (`pages/buyer/RestockList`), the same who-gets-it rule (`client/src/utils/restock.ts`), and the same grouping on the requests page.
- **Not built:** editing a list as a whole (each item is edited or withdrawn on its own).

### A small buyer buys small, from nearby (2026-10-05)

**For a SMALL_BUSINESS buyer and a local shop on its buying side** (`mobile/src/lib/smallBuyer.ts`). The user's pick of four options; buy-at-listed-price and simpler wording were the others and are not built.

- **The market starts near them.** A "Buy from" switch under the category chips: their city, their state (default), or all India, sent to `GET /browse` as `location` or `state`, with the server's count under it. The state is the shop's own (`farmerProfile.state`), or else the state lots in their city are listed under; a buyer profile stores no state.
- **A bid starts small.** About a tonne in the lot's unit (1,000 kg, 10 qtl or 1 t), capped at what is left, with steps under the quantity (e.g. 2 / 5 / 10 qtl) and Whole lot still there. Partial bids were always allowed by the server; the card just used to default to the whole lot.
- **The website matches (2026-10-05):** the same Buy-from row above the market's results and the same small first bid with steps (`client/src/utils/smallBuyer.ts`).
- **Any seller on its buying side no longer sees its own lots** on the market: a shop's own 40 kg of wheat was showing as something to buy, and the server refuses a bid on it. The app sends `excludeSellerUserId` to `GET /browse`, so they leave the server's total as well as the page; trimming them from the first page left the rest in the count. It only hides lots, so it needs no sign-in.

### The website's buyer dashboard (redesigned 2026-10-05)

`client/src/pages/buyer/BuyerDashboard.tsx`, the same shape as the app's: "Your decisions" first (deals to pay, deliveries to confirm, seller counters on bids, offers on requests, each linking to where it is done), then open requests with fill bars and recent bids; on the right, a dark summary card (spent, deals, in escrow, open requests, and "₹X to pay"), the two main actions, business credit and the day's rates. One column below 1000px with the summary first. A failed feed says so rather than reading as zero. The agent card is gone, matching the app; the agent pages still exist at `/agent`. The recent-bids table showed "—" for every seller, because it read `listing.farmer.name` and the name is on `listing.farmer.user`.

**Both website dashboards, polished (2026-10-05).** The dark summary card leads with the number that needs doing something about: a buyer's amount owed, with Pay now under it, and a seller's deals still to be paid while nothing has been released, instead of a large "₹0". Supply contracts get a panel on both (`components/contracts/ContractsPanel`, live ones only, what needs you first, rendered only when there is one), bid statuses are coloured pills worded for the side reading them (a waiting bid says "Answer" to a seller), and the rates panel is headed "Mandi rates" with reference prices marked `ref`, since it said "today" over prices no mandi had reported.

### Business credit: applied for on the wallet, decided by a person (2026-10-04)

**A business buyer can ask for money to stock up, and repay in 30, 60 or 90 days. CropBid does not lend.** The user's call: a card on the buyer's wallet ("Need money to stock up?"), a form, and somebody at CropBid takes the application to a third-party lender. There is no lending partner signed, so nothing on screen may say "instant", "guaranteed", or anything that reads as CropBid lending. The card says it is not instant and that the lender sets the terms.

- **Buyers only**, including a seller in buying mode (`/api/credit` is `requireRole('BUYER')`, and X-Act-As makes a buying shop a BUYER, §4). It is credit for a business, not a household basket.
- **The form asks what a lender asks first**: business name, GSTIN (optional), years running, produce bought a month, the amount (₹10,000 to ₹10,00,000, served by `GET /credit` so the app keeps no copy), 30/60/90 days, what it is for, and a phone number. **No PAN, Aadhaar or bank statements**: those are a lender's to collect under its own KYC, and holding government IDs is a liability CropBid has no reason to take on.
- **Consent is the row's reason to exist.** The buyer ticks that their details may be shared with lending partners; the server refuses without it and stamps `consentAt`. The box starts unticked on every submission.
- **One application per account.** Editable while `SUBMITTED`, open again after `DECLINED`; `IN_REVIEW` and `APPROVED` are a person's decision and the app cannot overwrite them. Every write is an `updateMany` conditioned on the status it was decided from, like the shop-order cancel (§3d), and a test races two reviews ten rounds and checks the winner's decision survives whole.
- **Ops work it at `/admin/credit`** (web): start review, approve a limit, or decline with a reason the buyer is shown. The list pages, 50 at a time; it used to return the newest 200 and nothing past them. Admins are pinged on a new or re-opened application (`CREDIT_APPLICATION`); the buyer is told every decision. Reviews are audited through `recordAudit`, which is a record here, not a control.
- **Approval moves no money.** It records the limit a lender agreed to, and the buyer's card says "we will call you to set it up; nothing is added to your wallet until then". **On the website too (2026-10-05):** a card on the buyer dashboard and an apply page at `/buyer/credit`, the same four states. Loading a lender's money into the wallet as credits is **not built, and should not be built before a lawyer has looked at it**: under the RBI's digital lending rules a platform arranging loans for a lender is a lending service provider, and the loan is meant to go from the lender to the borrower's own bank account (or straight to the seller for a fixed end use), not through a pool the platform holds. Credits also cannot pay for anything yet (§6). Repayment tracking is likewise the lender's, and unbuilt here.
- **Deleting the account deletes the application** (cascade on a hard delete, an explicit delete in the anonymising path, pinned by a test).

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

### A local shop gets its own, smaller app (2026-10-04)

**A local shop sells to households at a fixed shelf price, so the trade half of the seller app is taken away from it rather than relabelled.** Decided by `farmerProfile.sellerType === 'LOCAL_SHOP'`; farms and wholesalers keep everything.

- **Tabs: Home, My Stock, My Shop, You.** No Offers tab: nothing is bargained over.
- **My Shop is `screens/shop/ShopHomeScreen`**, not the farm dashboard: a sales board and the household orders to send, grouped by shop order (§3b) so "Mark on the way" and "Mark delivered" move every lot of one delivery together. An unpaid order shows no send button. **The sales figure is summed from paid orders on the client**, because `/transactions/stats` counts only RELEASED money, which needs the shopper's confirmation, so a shop that had delivered read ₹0.
- **Adding stock is `screens/shop/ShopListingScreen`**: item, price per kg, stock, quality, organic, photos. The one shelf price is sent as floor, ceiling and retail, because the listing model is shared and the server requires all three. The place is the shop's own, never typed per item, and the form warns when that city is not on `RETAIL_CITIES`.
- **Hidden for a shop:** the demand teaser, the bidding banner, forecast and schemes cards and the sell pitch on Home; offer counts on My Stock; offers, demand and the AI helper on the profile.
- **Buying stock for the shop** is a second mode on the same account (§4, "A seller can also buy"): a card on the shop's profile to apply, then a Selling | Buying switch.
- **A wholesaler gets the same two sides** (2026-10-04): the apply card says "Buy stock for your business" and files it as a WHOLESALER buyer, and its Home trades the farm wording for trade wording ("Trade by the lot, priced to the mandi", no farm-schemes card, no "Grow it? Sell it here").
- **Cancelling an order** is on the order card until the shop marks it on the way, with three ready reasons (out of stock, can't deliver today, shop closed) or its own words, because the shop must say why (§3d).

### The rest of the app pass (2026-10-04)

- **Signing in happens on a card that rises from the bottom** (`components/LoginSheet`), from the header's Log in and from a guest pressing ADD or a size, which used to do nothing. It calls the same `signIn` as `LoginScreen`, which still exists.
- **The bottom tabs are a floating pill** (`navigation/FloatingTabBar`), shared by the shopper and seller bars; the buyer bar is still the old one. It keeps its own space rather than floating over the screen, so no screen has to pad its last row clear of it.
- **Home scrolls as one page** with the search and category chips sticky, a notification bell with an unread count, and, for a farm or wholesaler, a "Buyers are asking" card leading to the demand board, which also gained a back button.
- **The shopper and the seller profiles are separate layouts** (`screens/profile/ShopperProfile`, `SellerProfile`); buyers keep the old one. A shopper is shown no trust score; a seller is, and is asked for payout details while none are on file (§4a).
- **Back buttons show only the arrow**, because iOS labelled them with route names like "ConsumerTabs".
- **The buyer side (2026-10-04): no Agents tab.** The user's call: the buying agent is off the app for now, and its tab is **Requests** (the buyer's posted needs and the offers on them). The dashboard lost its agent card and a sparkline drawn from hard-coded numbers, a rising line on an account that had spent ₹0. Buyers get their own profile layout (`screens/profile/BuyerProfile`), the floating tab bar, and no farm-schemes card or sell pitch on Home. Contracts no longer says confirming delivery "releases payment to the farmer" (§6: it marks the seller due). The seller's AI helper is untouched.
- **The buyer's market (Home) is worded for sourcing, not shopping.** Hero "Source by the lot, priced to the mandi"; rail eyebrows count open lots instead of "Farm-fresh · picked this week", because nothing checks when a lot was harvested (§2b); a crop whose lots are in different units is shown per quintal, not per kg; no "% OFF" badge, which on a bidding lot was the seller's own floor-to-ceiling range dressed as a discount; category chips only where a lot is open. No category tiles repeating the chips, and no "How CropBid works". The wallet pill stays, because the wallet is where business credit is applied for (below). The lot count on the hero is the server's total, not the length of the page it loaded (it read "20 LOTS OPEN" with 85 open), and a trader now gets a 50-lot page. Bidding on a lot (`components/BidPanel`) knows about an open bid: price chips off the seller's range on a new one, and on a countered one "Meet ₹X", which re-sends the bid at their price because the server has no buyer accept-counter.

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

**The whole day's feed is downloaded, held in memory, and every rate is computed from that one copy** (`services/mandiFeed.ts`). The board, a state's view, one crop's mandi table, the listing anchor and the forecast all read it. A request never waits for a download, except in the first ten seconds after a restart, a window shared by every request rather than ten seconds each, and `warmMandiFeed()` at boot usually has the day loaded before anyone asks. It refreshes every two hours **on a timer, whether or not anyone visits**, serving the old copy while the new one downloads.

It used to ask the feed per crop and per state, and the day it was checked properly (2026-09-21) every number on the board was wrong, for four reasons that are properties of the feed, measured, not guesses:

1. **Its filters match any shared word.** `filters[commodity]=Onion` returned spring onion too; "Green Chilli" and "Ginger(Green)" pulled in anything green; `filters[state]=Andhra Pradesh` returned all four Pradesh states, so a state's mandi table listed other states. The exact filter is `filters[<field>.keyword]`, and commodity names are matched on our side.
2. **No request reaches past row 10,000** (offset + limit), and a full day is about 17,000 rows. So the day is fetched one state at a time, and the states' totals must add up to the day's `total` before the copy counts as complete. **Every state is read before that check**, never stopping on a running total: the feed grows while it is read, so the states read first can reach the opening count while others are still unread.
3. **The shared demo key returns 10 rows whatever `limit` asks,** and replies `limit: 10`. The old pager took a page shorter than asked as "the end", so production quoted every crop as the median of the first 10 rows the feed happened to return. Maharashtra's onion was missing from /rates because its first row was number 24. Completeness is now judged on `total`, never on page length.
4. **A key is refused for a minute or two after a burst.** Thirty crops fetched at once was a burst; the same 28 requests one after another went through without a single 429. Requests are strictly sequential, and a 429 is waited out.

**Only a complete copy is ever served.** A half-read day (the first page after a restart, a sweep throttled half way, the demo key's 10 rows) is a slice of the country, and the board, a listing's anchor and the forecast would all show it as live national prices with no way to say otherwise. Until a complete copy exists, and once the last one is three days old, they get reference prices, labelled as such.

**Why the homepage rates sat as an empty skeleton (fixed 2026-10-06).** Opened after two quiet days, the rates strip and the forecast showed a blank box for ten seconds and then reference prices, every load. Three things together: refreshing only ever happened when someone asked, so a site nobody opened let its copy age past the three-day limit; every request finding no copy then waited its own ten seconds for a download that, on a throttled key, runs for minutes; and every rates endpoint, the forecast included, sent `max-age=1800` whatever it held, so the browser kept those reference prices for half an hour after live rates were back. Now a timer refreshes the copy (`warmMandiFeed`), the ten-second wait is one window per process, and browsers keep live rates five minutes and reference prices not at all (`cacheFor` in `rates.controller.ts`).

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

**The board stays 30 crops; the rates pages show everything.** `GET /rates/board` is what the storefront strip, the dashboards, the app's rates rail and the forecast read, and they are built around 30. `GET /rates/all` is every commodity the day reported (about 220), grouped, and both full rates pages read it: `/rates` on the web and the app's `RatesScreen`. Each has a search box and a state picker listing the states that actually reported, and a crop's mandis open over the page (a dialog on the web, a bottom sheet in the app, both closed with a ×) rather than unfolding under the card, which on a group of sixty vegetables pushed the rest of the page out of reach. On a phone the web dialog lists each mandi as a row, market with its place underneath and price on the right, because the nine-column table put the price off screen. While it is open the rest of the page is `inert` and Tab cycles inside it, since `aria-modal` alone let focus walk into the cards behind. The app keeps its own group titles, because the English title is the key its Hindi and Marathi translations are looked up by. With a state picked, `/rates/all` lists what that state reported plus the 30 board crops through their usual fallback. **With no copy of the feed at all**, the all-India view lists every commodity CropBid has an average for (`usualCommodities()`), at that all-India average and labelled reference like the board crops, instead of shrinking to the 30 with typed-in prices (2026-09-26, the day that happened). Only then: with a copy, a crop that did not report is still left out, because a reference row among the day's reports would read as one of them. And never in a state's view, where an all-India average would pass off a national price as that state's.

**Production had no registered key until 2026-09-21.** It is set in the Lightsail `.env` now. A registered key is also shared by anything else that uses it, local development included.

**"Vs usual" is learned, not typed in (2026-09-22).** It compares today's price with what the crop has sold for lately: a running average kept in `UsualPrice` (`services/usualPrices.ts`), a plain mean for the first 30 days and then each new day weighted a thirtieth, so it follows the seasons unattended. Every commodity has one, not only the 30. It replaced a price typed in per crop that nobody updated, which had onion's "usual" at ₹18/kg against ₹47 and made the forecast read that gap as scarcity.
- **It compares state by state, never an all-India price with an all-India average.** The day's reports arrive unevenly: on 2026-09-22 at 14:50 Tamil Nadu's farmer markets (potato ₹35/kg) had all reported and Uttar Pradesh's bulk mandis (₹5.5) a third of theirs, so the all-India median read ₹18 against the previous day's ₹11, "+57%", while neither state's price had moved. So there is one average per crop per state (plus an all-India row, state `""`, used only as the fallback price); a state is compared with its own past, and the all-India "vs usual" is the median change across the states that have reported. The same day that read +57.5% for potato and +22.6% for garlic reads −6.2% and −1.6%. A "wait until enough mandis report" rule was proposed first and rejected: two-thirds of potato's reports were already in.
- **It started from nothing on 2026-09-22** (the user's call, over backfilling from data.gov's history dataset, which does exist and is current). A crop with no earlier day on record shows **no comparison**, not 0%: `/rates/all` sends `usual: null`, the board sends `usualDays: 0`, and the landing page, dashboard and forecast all treat that as "nothing to compare" rather than "steady". A state's price against today's national one is a gap between places, never a move against usual.
- **A day counts once, with its last price**, folded in when the feed first shows the next date: a morning refresh carries only the mandis that have reported by then.
- **The database does the folding, and every process reads the result back.** Each row carries the day it is watching and that day's latest price (`pendingDay`, `pendingPerQuintal`), written with every refresh; the first write of a later date folds the watched day into the average in the same UPDATE, from the row as committed, and `RETURNING` is what each process keeps in memory. Review caught the first version, which folded in memory and wrote once a day: a restart between a day's last refresh and the next date lost that day for good, and two processes in a deploy's overlap could each keep an average the other had overwritten. An older copy (a stale download) changes nothing.
- **One row per crop per state, updated in place**: about 1,600 rows (perhaps 3,000 once a year of seasonal crops has passed) and under 1 MB for good. It is written with each refresh, at most every two hours and only when someone asks for rates, so the free-plan Neon database is awake anyway; the user agreed to "once a day" first and was told when review changed it. They asked about the size before agreeing: 0.5 GB is the free limit, CropBid uses about 10 MB, and the "LIMIT 50" in Neon's table viewer is its paging, not a limit on rows.
- `fallbackPerQuintal` on the board is now only a last resort: the reference price for a board crop CropBid has no history for at all. A crop the feed stops reporting falls back to its own recent average instead.

