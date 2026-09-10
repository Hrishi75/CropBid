# CropBid Daily

The household grocery app. Shop-first: you pick a city, then a shop, then what
is on its shelf.

It is a **separate app against the same server**. `cropbid-daily/` and `mobile/`
both talk to `server/`, and there is no second backend. The split is about who
is holding the phone, not about the data:

| App | Who | What they do |
|---|---|---|
| **CropBid** (`mobile/`) | Farmers, buyers, wholesalers | Bid, counter, auction, fill demand |
| **CropBid Daily** (this) | Households | Buy groceries by the kilo from a named local shop |

## Why a second app rather than a tab

The two audiences want opposite things from the same screen. A farmer opens the
app to a national market and quantities in quintals; a household opens it to
four shops within delivery range and quantities in grams. One app serving both
either asks who you are at launch, or shows a wholesale surface to somebody
buying 500 g of coriander.

Roles are also exclusive on the server, so a single binary would have to gate
half its screens behind a role check anyway.

## The one rule this app is built around

**The shop is the unit, not the product.**

Tomato costs ₹24/kg at Ramji Sabji Bhandar and ₹28/kg at Green Basket Fresh, and
Daily shows both, under their own shops. It never merges them into one "Tomato,
from ₹24" card.

That is a deliberate anti-Blinkit call, recorded in the root `CLAUDE.md` §3.
Aggregated SKUs are won on capital and dark stores; shop identity is the one
thing that model structurally cannot copy, because it works by making the source
invisible. Swiggy does the same for restaurants.

It also avoids inventing data: `Listing.cropName` is free text, so "Tomato",
"tomatoes" and "Tamatar" are three products. Grouping by seller uses a real
foreign key instead of a match nobody verified.

> The business app's storefront does the opposite today and renders cards like
> "Tomato · 2 FARMERS · from ₹24/kg". That is the model to move away from, not a
> pattern to copy.

## The two lanes

Daily is a **consumer app**. Nothing in it is wholesale: no bidding, no
auctions, no demand board, no quintal quantities.

| Lane | Source | Timing |
|---|---|---|
| **Quick** | Local seller shops holding stock | Same day |
| **Fresh** | The morning mandi | Order before midnight, delivered next morning |

They are not two speeds. Quick is stock a shop already holds, so it goes out
whenever someone orders. **Fresh is a batch**: everything ordered during one day
is bought together at the next morning's mandi and delivered that morning. One
buying run, one delivery round.

That makes the cutoff a real constraint rather than a marketing countdown. Miss
midnight and there is no second mandi run to catch, so the order joins the
following day's batch:

- Order any time on the 9th, even 23:59, and it arrives the morning of the 10th
- Order 00:01 on the 10th and it arrives the morning of the 11th

`lib/freshWindow.ts` holds this, as pure functions taking `now` so the countdown
is testable without freezing a clock. The cutoff rolls the date forward and
zeroes the clock rather than adding 24 hours, so it lands on real local midnight
across a DST shift.

> **The mandi source is not in the data yet.** The schema has no mandi: the only
> mention of one is a comment on the `QUINTAL` unit, and AGMARKNET supplies
> reference *prices*, not stock. So `laneFor()` still resolves Fresh to whoever
> is not a `LOCAL_SHOP`, which today means individual farm sellers, and a card in
> the Fresh tab can read "Farm" under a promise that says mandi. Making the
> promise true needs a real source on the listing, not a rewording.

## The design grammar, and where it comes from

Measured off Blinkit and Zepto's live mobile web in September 2026, not guessed
at. Both converge on the same things, so these are conventions rather than one
company's taste:

- **Small type, big pictures.** Blinkit's product name is 13px/600 and its pack
  size 12px; only the delivery ETA gets 18px/800. Daily was running 15-17px
  names with generous padding, which is what made it read as sparse.
- **Produce goes in a two-column grid**, never a list of rows. A row gives an
  image about 64px, and somebody buying vegetables is choosing on how the
  vegetables look. The grid spends the width on the photograph.
- **The add control sits on the image**, overlapping its bottom edge, because
  the thumb is already there after looking at the picture.
- **Qualifiers go on the photo** (grade, organic), not under it, where they
  compete with the name for the first read.
- **Cards need a ground clearly darker than they are.** Daily's cards were
  #fbf9f3 on #f4f1ea, about 2% apart, so the shadow had nothing to separate.

**What was deliberately NOT copied:** the aggregated product catalogue. Blinkit's
grid is one merged SKU per tile across every source. Daily's grid only ever
shows one shop's shelf, reached through that shop. The layout grammar is worth
borrowing; the information architecture is the thing being competed with.

## Running it

The API must be up first, with this app's origin allowed:

```bash
DATABASE_URL=postgresql://<user>@localhost:5432/cropbid_grocery PORT=5001 CLIENT_URL=http://localhost:5173 CORS_ORIGINS=http://localhost:8081,http://localhost:8082 npm run dev
```

Then, from this directory:

```bash
EXPO_PUBLIC_API_URL=http://localhost:5001/api npx expo start --web --port 8082
```

`EXPO_PUBLIC_API_URL` defaults to production, so **it must be set** or the app
will quietly read live data.

CORS is a browser rule and only bites the `--web` preview. A native build sends
no `Origin` header and is unaffected.

## What it talks to

Three endpoints, all of which already existed and none of which the business app
calls:

- `GET /browse/cities` — cities with live direct-sale stock
- `GET /browse/shops?city=` — the city's shops
- `GET /browse/shops/:id?city=` — one shop's whole shelf

Every one carries a city, because the server refuses a shop lookup without one.
A shop's stock is deliverable from where the **stock** sits, not from where the
owner's profile says they are.

## The app

Three tabs: **Shop**, **Basket**, **You**.

- **Shop** is the shop list and the shop shelf, stacked. Opening a shop goes
  deeper into browsing rather than switching task, so it lives in this tab's
  stack and not a tab of its own.
- **Basket** re-prices every line against the live listing before it shows a
  total, groups by lane (a basket spanning Quick and Fresh arrives on two
  different days and the shopper is told before paying, not after), and takes a
  delivery address and phone.
- **You** is orders, name, delivery city, sign out. Changing city warns first
  when it would strand basket rows from another city, then removes them.

**Orders live under You, not beside it.** A tab is for something you switch to
many times a session, and orders is not that: a shopper checks an order while
they are waiting for one, a handful of times per order and never while
shopping. It belongs with the other things that are true about your account.
The practical gain is the tab it frees, which puts Basket in the middle of the
bar where a thumb reaches it.

Orders groups by the day an order was placed. One basket becomes many orders,
because the server settles one lot per transaction, so grouping puts the
shopping trip back together without pretending the records are one thing.

A **floating basket bar** sits over both shop screens whenever the basket has
anything in it, the way Blinkit and Zepto both do it. Its total is the cart
SNAPSHOT, not the re-priced bill: pricing every line live costs a request per
row, which is right on the cart screen where the shopper is about to pay and
wrong on a bar that has to paint while they browse.

### Rules the cart enforces

- **The basket stores kilograms, never the seller's unit.** Half a kilo of a
  quintal lot is 0.005; at 2dp that rounds to 0.01 and the shopper is billed for
  double. The conversion back happens in exactly one place, at checkout, at 6dp,
  against the LIVE listing unit, because a seller can re-denominate a lot while
  it sits in a basket.
- **The snapshot is never billed.** Each row keeps a copy of the listing for
  fast paint; `lib/cartLines` refetches every lot and the bill comes off that.
  Unbuyable rows stay visible and are excluded from the total rather than
  vanishing and silently changing it.
- **Orders are placed sequentially, not in parallel.** Each one decrements
  stock, and only what actually became an order leaves the basket.
- **Each line carries an idempotency key**, re-minted whenever its amount moves,
  so retrying a failed order replays that purchase rather than doubling it.
- **Storage is keyed by user id**, so a shared phone never shows one shopper
  another's basket, and signing out sets the basket aside rather than binning it.
  The persist effect will not write until the basket in state is known to belong
  to the key being written to. Both effects depend on the storage key, so a
  sign-in re-runs them in the same commit, and a `ready` flag cannot guard it:
  a state update has not applied yet, so the write would land the previous
  account's items on the new account's key before that key had been read.
  Whichever basket was emptier won, silently.

### Sign-in

Phone plus a six-digit code. No password: a household buying vegetables should
not have to invent one. `intendedRole` is pinned to `CONSUMER`, so an account
made here can never arrive as a partner.

A guest picks a delivery city at the gate and it is kept on the device. On
sign-in that city is **adopted onto the new account**, because the server
refuses a purchase from an account with no city ("Choose your delivery city
before ordering") and without this a guest who filled a basket hits that wall at
checkout having already chosen a city once. It never overwrites a city the
account already has.

Locally there is no SMS or WhatsApp configured, so **the code is printed to the
API log**. That is expected in dev, not a failure.

## Knowingly unbuilt

- **Payment.** Orders are placed and the money is recorded, but Razorpay is not
  wired into this app yet. Root `CLAUDE.md` §6 also applies: settlement moves no
  money, so no copy here may promise an automatic payout, and none does.
- **Cancelling an order.** There is no path, in this app or on the web.
- **Shop hours.** `FarmerProfile` has no open/close time, so "Arrives today"
  keeps promising after the shop has shut. This is the first thing that makes
  the app lie.
- **Per-shop minimum order and delivery fee.** A ₹40 order of coriander cannot
  pay for a delivery run.
- **Search across shops**, and a real per-shop item model. A kirana's shelf is
  currently `Listing` rows, which are crop-shaped: `cropName`, `qualityGrade`,
  `harvestDate`. Packaged groceries need pack size, brand and MRP instead.
