// =============================================================================
// SEO — Public Route Manifest + Head Management
// =============================================================================
// One list of public pages, consumed twice:
//
//   1. BUILD TIME — scripts/prerender.mjs imports ROUTES (through the compiled
//      SSR bundle) to decide what to prerender, what head tags to bake into
//      each dist/<path>/index.html, and what goes in sitemap.xml.
//   2. RUNTIME — useSeo() re-applies the same title/description when the user
//      navigates inside the SPA, since a client-side route change doesn't
//      reload the document and the baked-in tags would otherwise go stale.
//
// WHY BOTH: the prerendered tags are what crawlers and social scrapers read
// (most of them never run JavaScript). useSeo() is what the browser tab and
// Googlebot's second-pass render see. Neither one covers the other's case.
//
// Adding a public page? Add it to ROUTES and it gets prerendered, gets its own
// head tags, and lands in the sitemap. Nothing else to wire up.
// =============================================================================

import { FAQ_ITEMS } from '../content/faq';

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  /** Sitemap hints. Omitted for pages excluded from the index. */
  priority?: string;
  changefreq?: string;
  /**
   * false → kept out of the sitemap and served with <meta robots="noindex">.
   * The page is still prerendered, so the noindex is visible to crawlers that
   * skip JavaScript. Auth screens are thin and duplicated; they only dilute.
   */
  index?: boolean;
  /** Extra page-level JSON-LD, baked into the prerendered HTML. */
  jsonLd?: Record<string, unknown>;
}

export const SITE = {
  origin: 'https://cropbid.in',
  name: 'CropBid',
  twitter: '@CropBid',
  /** Absolute — every social scraper drops relative image URLs. */
  ogImage: 'https://cropbid.in/og-cover.png',
  /** Fallback description for routes outside the manifest (signed-in pages). */
  description:
    "India's crop exchange — buy and sell crops direct at live government mandi rates.",
};

// TITLE/DESCRIPTION LENGTHS: Google truncates titles past roughly 60 characters
// and descriptions past roughly 155. Staying under both is deliberate — a
// clipped description reads as careless and measurably costs click-through.
export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'CropBid — Sell & Buy Crops Direct at Live Mandi Rates',
    description:
      "India's crop exchange. Farmers sell direct to buyers at live government mandi rates from 4,600+ mandis — with escrow payments, auctions and farm-to-door delivery.",
    priority: '1.0',
    changefreq: 'daily',
  },
  {
    path: '/rates',
    title: "Today's Mandi Rates — Live Prices from 4,600+ Mandis",
    description:
      'Live government mandi rates (APMC bhav) for vegetables, fruits, grains and spices across 4,600+ Indian mandis. Updated every day, free to check.',
    priority: '0.9',
    changefreq: 'daily',
    jsonLd: {
      '@type': 'Dataset',
      name: 'Daily mandi rates for Indian agricultural commodities',
      description:
        'Daily wholesale (APMC mandi) prices for vegetables, fruits, grains, pulses and spices across 4,600+ regulated markets in India, sourced from government data.',
      creator: { '@id': 'https://cropbid.in/#organization' },
      spatialCoverage: { '@type': 'Country', name: 'India' },
      temporalCoverage: '2024/..',
      license: 'https://data.gov.in/government-open-data-license-india',
      isAccessibleForFree: true,
      keywords: [
        'mandi rates',
        'mandi bhav',
        'APMC prices',
        'wholesale crop prices India',
        'agricultural commodity prices',
      ],
    },
  },
  {
    path: '/forecast',
    title: 'Crop Price Forecast — Where Mandi Rates Go Next',
    description:
      'See which way mandi prices are trending before you sell. Crop-by-crop price forecasts built on live government rate data from across India.',
    priority: '0.8',
    changefreq: 'daily',
  },
  {
    path: '/schemes',
    title: 'Government Schemes for Farmers — Subsidies & Yojanas',
    description:
      'Every central and state farming scheme you may be owed, in one place — eligibility, benefit amount and how to apply. PM-KISAN, PMFBY, KCC and more.',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/equipment',
    title: 'Farm Equipment to Buy or Rent — Tractors & Machinery',
    description:
      'Buy farm machinery outright or hire it for the season — tractors, tillers, harvesters, sprayers and irrigation kit, with prices and local availability.',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/inputs',
    title: 'Seeds, Fertiliser & Crop Protection from Licensed Shops',
    description:
      'Certified seed, fertiliser, organic inputs and crop protection from licensed dealers near you: pack prices, dose per acre and germination on the tag, before you go.',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/crop-demand',
    title: 'Crop Demand — Buyers Looking to Purchase Now',
    description:
      'See what Indian buyers are purchasing right now — crop, volume, grade, price and delivery town. Processors, restaurant chains, exporters and retailers, updated daily.',
    priority: '0.9',
    changefreq: 'daily',
  },
  {
    path: '/how-it-works',
    title: 'How CropBid Works — Reviewed Sellers, Bidding & Escrow',
    description:
      'Farmers, local shops and wholesalers are reviewed before they can sell. Then they list at their own price, buyers bid or buy outright, and escrow pays out on delivery. The whole CropBid flow, step by step.',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/faq',
    title: 'CropBid FAQ — Buying, Selling, Delivery and Payment',
    description:
      'Answers on household delivery in Pune and Nagpur, buying by the kilo, how seller approval works, escrow payment, the 2% fee, and where the live mandi rates come from.',
    priority: '0.7',
    changefreq: 'monthly',
    // The FAQPage block lives HERE, on the page that actually renders these
    // questions, and is built from the same FAQ_ITEMS the page maps over.
    //
    // It used to sit on /how-it-works with no matching visible content
    // anywhere on that page. Google requires FAQ markup to be visible to the
    // user on the page carrying it, so the block earned nothing and put the
    // site at risk of a manual action. Generating it from the rendered content
    // is what keeps the two from drifting apart again.
    jsonLd: {
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  },
  {
    path: '/terms',
    title: 'Terms and Conditions',
    description:
      'The agreement between you and CropBid: who can trade, how prices and the 2% fee work, escrow and settlement, delivery, cancellations and refunds.',
    priority: '0.3',
    changefreq: 'yearly',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description:
      'How CropBid collects, uses, stores and protects your personal data, and the choices you have over it.',
    priority: '0.3',
    changefreq: 'yearly',
  },

  // Prerendered so the noindex is readable without JavaScript, but kept out of
  // the sitemap and the index.
  {
    path: '/login',
    title: 'Sign in',
    description: 'Sign in to your CropBid account.',
    index: false,
  },
  {
    path: '/signup',
    title: 'Create an account',
    description: 'Create a free CropBid account and shop farm-direct produce.',
    index: false,
  },

  // The partner door — indexable on purpose: "sell on cropbid" searches
  // should land here, not on the shopper signup.
  {
    path: '/partner',
    title: 'Become a partner',
    description: 'Sell on CropBid as a farmer, local shop or wholesaler — or source for your restaurant or business. Apply in minutes, reviewed within 48 hours.',
    changefreq: 'monthly',
  },
];

export const INDEXABLE_ROUTES = ROUTES.filter((r) => r.index !== false);

/** Absolute canonical URL for a route path. "/" stays "https://cropbid.in/". */
export function canonicalUrl(path: string): string {
  return path === '/' ? `${SITE.origin}/` : `${SITE.origin}${path}`;
}

/** Brand suffix, skipped when the title already carries the brand. */
export function fullTitle(title: string): string {
  return title.includes(SITE.name) ? title : `${title} | ${SITE.name}`;
}

export function routeMeta(pathname: string): RouteMeta | undefined {
  // Trailing slashes are equivalent for everything except the root.
  const normalised =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return ROUTES.find((r) => r.path === normalised);
}
