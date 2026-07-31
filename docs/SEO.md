# SEO & GEO — how CropBid gets found

Two audiences, one pipeline:

- **SEO** — Google, Bing and DuckDuckGo indexing `cropbid.in` and ranking it for
  things people actually search ("onion mandi rate today", "sell wheat online").
- **GEO** (generative engine optimisation) — being the source ChatGPT,
  Perplexity, Gemini, Copilot and Claude quote when someone asks them about
  Indian mandi prices or selling crops direct.

They need mostly the same things, and one thing above all: **HTML a crawler can
read without running JavaScript.**

---

## Why the site wasn't showing up

`cropbid.in` is a Vite SPA. Before this work, every URL on the domain served
this to every crawler:

```html
<head><title>CropBid</title></head>
<body><div id="root"></div></body>
```

That is the entire page. No heading, no copy, no description, one title shared
by all 40+ routes, and `/robots.txt` and `/sitemap.xml` both returned that same
HTML because neither file existed and the SPA rewrite swallowed the request.

The consequences, in rough order of damage:

| Problem | Effect |
| --- | --- |
| Empty `#root` in the served HTML | Googlebot *can* render JS, but on a deferred second pass that lags the first crawl by days-to-weeks. Ranking is throttled behind that queue. |
| Empty `#root`, again | The AI crawlers — GPTBot, PerplexityBot, ClaudeBot, CCBot — **do not run JavaScript at all**. They saw a blank page. GEO was not "weak", it was structurally impossible. |
| One `<title>` for every URL | Nothing to rank. Google had no signal distinguishing `/rates` from `/schemes`. |
| No `<meta description>` | Google writes its own snippet from page text — and there was no page text. |
| No `sitemap.xml` | No crawl seeding. Discovery depended entirely on external links, of which a new domain has ~none. |
| No `robots.txt` | Not fatal on its own, but nothing pointed at a sitemap and AI crawlers had no explicit permission. |
| No Open Graph tags | Every WhatsApp / X / LinkedIn share rendered as a bare grey link. For an India-facing product, WhatsApp sharing *is* the distribution channel. |

---

## What is now in place

### Prerendering (the core fix)

`npm run build` in `client/` now runs three passes:

```
vite build                          → dist/            browser bundle + shell
vite build --ssr entry-server.tsx   → dist-ssr/        Node-loadable renderer
node scripts/prerender.mjs          → dist/<route>/index.html  + sitemap.xml
```

Every public route ships as a real HTML file with its headings, hero copy, nav
and footer already in the markup. Still a fully static deploy — no server, no
serverless function, no added Vercel cost.

React mounts with `createRoot()`, which discards the container's contents, so
there is no hydration contract to satisfy and no mismatch warnings. Crawlers
read the static markup; browsers get the live app a moment later.

**What does not prerender:** anything loaded in a `useEffect` — live mandi
rates, listings, scheme data. Effects don't run during `renderToString`, so
those areas render their loading state. This is the right trade: the durable,
indexable content (headings, explanatory copy, structured data) is exactly the
part that renders statically, and today's prices would be stale in a build
artefact anyway.

### Files

| File | Purpose |
| --- | --- |
| `client/src/lib/seo.ts` | **The one place** route titles, descriptions and per-page JSON-LD are declared. Read at build time by the prerenderer and at runtime by `useSeo`. |
| `client/src/lib/useSeo.ts` | Re-applies head tags on client-side navigation, so tab titles and Googlebot's render pass don't go stale after an in-app route change. |
| `client/src/entry-server.tsx` | Build-only. Renders a route to a string. |
| `client/scripts/prerender.mjs` | Writes `dist/<route>/index.html` and `dist/sitemap.xml`. Throws on failure — a silent miss here ships a site that looks fine and is invisible, which nobody would notice for weeks. |
| `client/index.html` | Head template. Site-wide JSON-LD (Organization, WebSite, WebApplication) lives here as static markup. |
| `client/public/robots.txt` | Opens everything public to every crawler including AI; blocks signed-in routes. |
| `client/public/llms.txt` | Plain-language site summary for LLMs — what CropBid is, how deals work, which pages matter. |
| `client/public/og-cover.png` | 1200×630 share card. Source: `client/scripts/og-cover.svg`. |
| `client/vercel.json` | Trailing-slash normalisation, immutable asset caching, correct content types. |

### Adding a public page

Add an entry to `ROUTES` in `client/src/lib/seo.ts`. It is then prerendered,
gets its own head tags, and lands in the sitemap. Nothing else to wire.

### Regenerating the share card

Edit `client/scripts/og-cover.svg`, then (sharp lives in the server workspace):

```bash
cd client && node -e "
const sharp = require('../server/node_modules/sharp');
sharp('scripts/og-cover.svg', { density: 144 })
  .resize(1200, 630, { fit: 'fill' }).png({ compressionLevel: 9 })
  .toFile('public/og-cover.png').then(i => console.log(i.width + 'x' + i.height));
"
```

---

## Do these by hand — nothing ranks until you do

Code alone doesn't get a site indexed. These are the highest-value manual steps,
in order.

### 1. Google Search Console — the single most important one

<https://search.google.com/search-console>

1. Add a **Domain** property for `cropbid.in` (not URL-prefix — domain covers
   `www`, apex and all subdomains).
2. Verify via DNS TXT record wherever the domain is registered.
3. **Sitemaps → submit `https://cropbid.in/sitemap.xml`.**
4. **URL Inspection** → paste `https://cropbid.in/` → *Request indexing*.
   Repeat for `/rates`, `/how-it-works`, `/schemes`, `/equipment`, `/forecast`.
5. Check **Pages** after a few days for anything reported as
   *Crawled – currently not indexed*.

Until step 3 happens, everything else in this document is theoretical.

### 2. Bing Webmaster Tools — matters twice as much as it looks

<https://www.bing.com/webmasters>

Bing's index is what **ChatGPT search and Microsoft Copilot** read. Being in
Bing is a direct GEO lever, not just a small slice of extra search traffic.

Import the property straight from Search Console (one click), then submit the
same sitemap.

### 3. IndexNow — near-instant recrawl

Bing, Yandex, Seznam and Naver support push-based indexing. Generate a key,
host it at `https://cropbid.in/<key>.txt`, and ping on deploy:

```bash
curl "https://api.indexnow.org/indexnow?url=https://cropbid.in/rates&key=<key>"
```

Worth wiring into the Vercel deploy hook once the mandi pages below exist.

### 4. Verify the deploy actually serves prerendered HTML

After the next Vercel deploy — this is the check that proves the whole pipeline:

```bash
# Should print the page's own title, NOT the homepage title
curl -s https://cropbid.in/rates | grep -o "<title>[^<]*</title>"

# Should print real markup, not an empty div
curl -s https://cropbid.in/how-it-works | grep -c "<h1"

# Should be plain text and XML, not HTML
curl -sI https://cropbid.in/robots.txt   | grep -i content-type
curl -sI https://cropbid.in/sitemap.xml  | grep -i content-type

# What an AI crawler sees
curl -s -A "GPTBot" https://cropbid.in/ | grep -o "<h1[^>]*>[^<]*"
```

Then run the homepage through:
- Rich Results Test — <https://search.google.com/test/rich-results>
- Schema validator — <https://validator.schema.org/>
- OG preview — <https://www.opengraph.xyz/>

### 5. Off-site — the part that actually moves rankings

A new domain with no inbound links will not rank on technical merit alone.
Google needs corroboration that CropBid exists.

- **Google Business Profile** — if there's a registered address. Unlocks Maps
  and the local pack, and this is the "geo" half if you meant *geographic*.
- Directory listings: Crunchbase, LinkedIn company page, IndiaMART,
  AgFunder, YourStory / Inc42 startup databases, Product Hunt.
- The **India 2047 Ventures** portfolio page — a portfolio backlink from an
  investor site is high-trust and usually easy to get.
- Wikidata entry for CropBid. Cheap, and disproportionately effective for GEO:
  several answer engines use Wikidata for entity grounding.
- Get the mandi-rates data mentioned in agri press or a farming subreddit /
  WhatsApp group. Citations in text are what AI engines actually weight.

---

## What to build next, in impact order

### 1. Programmatic mandi-rate pages — the largest opportunity by far

Right now `/rates` is one page. The search demand is in the long tail:
*"onion mandi rate today"*, *"kanda bajar bhav"*, *"tomato rate Nashik"*,
*"soybean bhav Latur"*. That is millions of monthly searches in India, and
almost none of it can land on a single generic page.

4,600 mandis × ~50 commodities is a very large addressable URL space:

```
/rates/onion                    → onion prices across every mandi
/rates/onion/maharashtra        → state roll-up
/rates/onion/nashik             → single mandi, with history
```

**The pipeline for this already exists.** `scripts/prerender.mjs` iterates
`ROUTES`; making it `await` a build-time fetch of crop/mandi combinations from
the API and generating entries dynamically is the natural next step. Start with
the top ~200 crop × mandi pairs by search volume rather than all 230,000 —
thin auto-generated pages at full scale invite a quality penalty.

Each page wants the `Dataset` schema already modelled on `/rates`, plus a real
price table and a short written summary of the trend.

### 2. Make crop listings publicly viewable

`/listings/:id` is behind auth, so every listing is invisible to search. Public
listing pages with `Product` + `Offer` schema would be eligible for rich results
and are the highest-intent pages on the site. Keep seller contact behind login —
show the crop, grade, quantity, price and location to everyone.

This is a product decision, not just an SEO one, which is why it isn't done here.

### 3. Serve Hindi and Marathi on their own URLs

The app translates via `localStorage`, so `hi` and `mr` content has no URL and
cannot be indexed. For an India-facing product that forfeits the majority of the
addressable search market — *"कांदा बाजार भाव"* has more search volume than its
English equivalent.

The fix is language-prefixed routes (`/hi/rates`, `/mr/rates`) with reciprocal
`hreflang` tags. The prerenderer would emit each route once per locale. This is
the second-biggest win after the mandi pages, and hreflang is deliberately
omitted from the current build because with one URL per page it would be a lie.

### 4. Split the JavaScript bundle

`dist/assets/index-*.js` is ~1.2 MB (334 KB gzipped) in a single chunk. Core Web
Vitals are a ranking signal, and this audience is on rural 4G. Prerendering
already fixed the worst of it — content now paints before the bundle
arrives — but route-level `React.lazy()` on the dashboard pages would cut what
the landing page has to download to a fraction.

### 5. Answer-shaped content

GEO rewards pages that answer a question directly and are cheap to quote. The
`FAQPage` schema on `/how-it-works` is a start. Extend with genuinely useful
reference pages: *"How is MSP different from mandi price?"*, *"What does an APMC
licence cost?"*, *"How do I read a mandi rate sheet?"* — each targeting a real
question, each with `FAQPage` or `HowTo` markup.

---

## Notes and caveats

- **Prerendered copy is English.** A visitor with Hindi selected sees English
  markup for the ~200 ms before React takes over. Fixed properly by item 3 above.
- **Not cloaking.** Crawlers and users get byte-identical HTML. The only
  difference is that browsers then execute the JavaScript.
- **`dist-ssr/` is a build artefact** and is already gitignored.
- **Verify after every deploy** that `curl https://cropbid.in/rates` still
  returns the per-route title. If the prerender step is ever dropped from the
  build command, the site silently reverts to being invisible — the failure mode
  is invisible in a browser, which is why `prerender.mjs` throws rather than warns.
