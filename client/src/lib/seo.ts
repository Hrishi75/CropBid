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
    path: '/how-it-works',
    title: 'How CropBid Works — Bidding, Escrow & Delivery Explained',
    description:
      'List a crop, take bids or let an AI agent negotiate, settle through escrow and ship farm-to-door. The whole CropBid deal flow, step by step.',
    priority: '0.7',
    changefreq: 'monthly',
    // An FAQPage block is the single highest-leverage bit of structured data for
    // GEO: answer engines lift these question/answer pairs almost verbatim.
    jsonLd: {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do farmers sell crops on CropBid?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A farmer lists the crop with quantity, quality grade and an asking price. Buyers place bids; the farmer accepts, rejects or counters. The listing can also be run as a live timed auction, or handed to an AI agent that negotiates within price limits the farmer sets. Live government mandi rates sit alongside every listing so both sides negotiate against the same reference price.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does payment work on CropBid?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Once a price is agreed the buyer pays into escrow via Razorpay. The money is held, not released. The crop then ships through a logistics partner, and the payment releases to the farmer once delivery is confirmed. The buyer is protected against non-delivery and the farmer against non-payment.',
          },
        },
        {
          '@type': 'Question',
          name: 'What are live mandi rates and where do they come from?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Mandi rates are the daily wholesale prices set at India’s regulated APMC markets. CropBid pulls them from government data covering more than 4,600 mandis and shows them free, so a farmer can see what a crop is actually fetching nearby before agreeing to any price.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does it cost anything to join CropBid?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Creating an account, listing crops and checking mandi rates are free. CropBid is available in English, Hindi and Marathi.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who buys on CropBid?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Buyers of every size use the same exchange — food processors, FMCG companies, exporters, retailers and restaurants buying in bulk, alongside individual consumers buying household quantities direct from the grower.',
          },
        },
      ],
    },
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
    description: 'Create a free CropBid account as a farmer or a buyer.',
    index: false,
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
