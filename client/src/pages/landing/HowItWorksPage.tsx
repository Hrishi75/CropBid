// =============================================================================
// How It Works — marketing / product page
// =============================================================================
// The former single-page landing content, moved off the homepage (which is now
// a grocery-style storefront). Pitch sections for buyers, farmers, and
// consumers: hero with a live negotiation panel, pillars, the live price
// engine (govt mandi rates), the transparent bid trace, proof stats, mission,
// and CTA. Copy is static; the price engine section renders live rates.
// =============================================================================

import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { RatesBoard } from '../../components/listings/RatesBoard';
import {
  type Country, type CurrencyCode,
  convert, formatMoney, formatCount,
  loadCountry, saveCountry, CountrySelector,
  ArcMark, ArrowIcon, ArrowSmIcon, PlayIcon, CBFooter,
} from './shared';

// =============================================================================
// Static copy — global agri trade
// =============================================================================

// Marketplace lives on the homepage now; everything else anchors on this page.
const NAV_LINKS = [
  ['How it works', '#how'],
  ['Live rates',   '#rates'],
  ['For farmers',  '#farmers'],
  ['Buy direct',   '#consumers'],
  ['Pricing',      '#pricing'],
] as const;

const LOGO_STRIP = ['CARGILL', 'ADM', 'BUNGE', 'OLAM', 'ITC FOODS', 'COFCO', 'LOUIS DREYFUS', 'NESTLÉ'] as const;

const PILLARS = [
  ['01', 'List your crop — stay on your farm', 'Crop, grade, volume, location, and your floor price. Any language, any units. No mandi trips, no travel, no guessing what it\'s worth.'],
  ['02', 'Buyers bid in the open', 'Verified buyers across 20+ countries bid in transparent rounds. You see every offer — including the ones you turn down — with the full spread surfaced, never hidden.'],
  ['03', 'We verify, transport, and settle', 'CropBid inspects every lot for authenticity and grade, arranges third-party logistics farm-to-buyer, and releases escrow on confirmed delivery.'],
] as const;

// The price engine — how CropBid anchors every deal to a real, live number.
const PRICE_POINTS = [
  ['Live govt feed',  'Rates from Agmarknet — 4,600+ regulated mandis reporting daily wholesale prices. The same numbers the trade reads.'],
  ['Local first',     'Nearest mandi → state average → national average — every rate labelled with exactly how local it is. Never a black box.'],
  ['Price signals',   "Today's rate vs the crop's usual band, at a glance — see whether it's a strong day to sell or a day to hold."],
] as const;

// Consumer path — individuals buying any quantity directly from a farmer, no
// bidding. The B2C counterpart to the buyer-agent auctions above.
const CONSUMER_POINTS = [
  ['Any quantity', 'From a single sack to a season’s supply. No minimum order and no auction to win — just buy what you actually need.'],
  ['No bidding, just buy', 'Skip the negotiation entirely. See the farmer’s listed price, place your order, and it’s yours.'],
  ['Straight from the grower', 'The same verified farmers and trust scores that power our auctions — the margin brokers used to take stays with the farmer, and with you.'],
] as const;

// Negotiation panel base values — USD/MT, converted at render.
// HRW wheat 12.5% protein, FOB Gulf — anchored to CBOT + Gulf basis, Jun 2026.
const NEG_BASE = {
  currency: 'USD' as CurrencyCode,
  spotRef: 264.5,
  open: 258.0,
  counter1: 271.5,
  counter2: 265.0,
  final: 267.5,
  competing: 266.0,
  qty: 5000,
  savings: 16050, // ~1.2% of 5,000 MT × $267.5 saved vs broker spread
};

// How-it-works trace — USD/MT base values per row.
const HOW_BASE = [
  { t: '+00:00', evt: 'Brief accepted',       counter: '—',                  price: null, spread: null, qty: null,  mark: '✓' as const },
  { t: '+00:12', evt: 'Invite sent',          counter: '14 sellers',         price: null, spread: null, qty: 5000,  mark: '✓' as const },
  { t: '+01:03', evt: 'Bids opened',          counter: '11 received',        price: [258, 274] as [number, number], spread: 16, qty: 5000, mark: '✓' as const },
  { t: '+01:24', evt: 'Round 2 counter',      counter: 'Hartmann Farms',     price: 271.5, spread: 4.0, qty: 5000,  mark: '✓' as const },
  { t: '+01:38', evt: 'Round 3 counter',      counter: 'Hartmann Farms',     price: 267.5, spread: 0.8, qty: 5000,  mark: '✓' as const },
  { t: '+01:41', evt: 'Match · contract drafted', counter: 'Hartmann Farms', price: 267.5, spread: null, qty: 5000, mark: '●' as const },
];

// Static platform totals — demo traction figures shown on the marketing page.
const STATIC_TOTALS = {
  activeListings: 42,
  farmers: 100,
  buyers: 35,
  gmvByCurrency: { INR: 100_000, USD: 0, EUR: 0, GBP: 0 } as Record<CurrencyCode, number>,
  completedDeals: 8,
  activeAuctions: 0,
  countries: 1,
};

function totalGmvInDisplay(byCurrency: Record<CurrencyCode, number>, display: CurrencyCode): number {
  return (Object.keys(byCurrency) as CurrencyCode[]).reduce(
    (acc, c) => acc + convert(byCurrency[c] ?? 0, c, display),
    0,
  );
}

// =============================================================================
// Sections
// =============================================================================

function Nav({ country, onChangeCountry }: { country: Country; onChangeCountry: (c: Country) => void }) {
  return (
    <header className="nav">
      <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
        <ArcMark />
        <span className="wordmark-text">CropBid</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        {NAV_LINKS.map(([label, href]) => (
          <a key={label} href={href}>{label}</a>
        ))}
        <Link to="/">Marketplace</Link>
      </nav>
      <div className="nav-actions">
        <CountrySelector country={country} onChange={onChangeCountry} />
        <Link to="/login" className="nav-signin">Sign in</Link>
        <Link to="/signup" className="cb-btn cb-btn-primary">
          <span className="cb-btn-label">Start trading free</span>
          <span className="cb-btn-label-short">Trade</span>
          <ArrowIcon />
        </Link>
      </div>
    </header>
  );
}

function Hero({ currency }: { currency: CurrencyCode }) {
  const gmv = totalGmvInDisplay(STATIC_TOTALS.gmvByCurrency, currency);
  const heroStats: ReadonlyArray<readonly [string, string]> = [
    [gmv > 0 ? formatMoney(gmv, currency, { compact: true }) : '—', 'GMV settled on-platform'],
    [formatCount(STATIC_TOTALS.farmers), 'verified growers & FPOs'],
    [STATIC_TOTALS.activeAuctions > 0 ? `${STATIC_TOTALS.activeAuctions}` : '—', 'auctions clearing now'],
  ];

  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <span className="cb-chip cb-chip-sage" style={{ marginBottom: 22 }}>
            <span className="cb-live-dot sm" />
            Now contracting · {new Date().getFullYear()} wheat, corn, soy &amp; coffee
          </span>
          <h1 className="cb-h0 hero-title">
            Today's mandi price,<br />
            <span className="italic">on every listing,</span><br />
            before you deal.
          </h1>
          <p className="cb-body hero-lede">
            CropBid anchors every lot to the Government of India's live mandi feed — 4,600+ regulated
            markets — so sellers and buyers negotiate around the real number, not a guess. Open bidding,
            escrow settlement, tracked delivery.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="cb-btn cb-btn-primary">
              Start trading free
              <ArrowIcon />
            </Link>
            <Link to="/" className="cb-btn cb-btn-ghost">
              <PlayIcon />
              Browse the live market
            </Link>
          </div>
          <div className="hero-stats">
            {heroStats.map(([n, l]) => (
              <div key={l}>
                <div className="hero-stat-n">{n}</div>
                <div className="cb-tiny hero-stat-l">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <NegotiationPanel currency={currency} />
      </div>
    </section>
  );
}

function NegotiationPanel({ currency }: { currency: CurrencyCode }) {
  const fmt = (v: number) => formatMoney(convert(v, NEG_BASE.currency, currency), currency, { decimals: 2 });
  const total = NEG_BASE.final * NEG_BASE.qty;
  const totalDisplay = formatMoney(convert(total, NEG_BASE.currency, currency), currency, { compact: true });
  const savingsDisplay = formatMoney(convert(NEG_BASE.savings, NEG_BASE.currency, currency), currency, { compact: true });

  return (
    <div className="neg-wrap">
      <div className="cb-card neg-card">
        <div className="neg-header">
          <div className="neg-header-left">
            <span className="cb-live-dot" />
            <span className="cb-mono neg-header-id">AUCTION #B-22841 · LIVE</span>
          </div>
          <span className="cb-mono neg-header-time">03:47 remaining</span>
        </div>

        <div className="neg-lot">
          <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Lot</div>
          <div className="neg-lot-row">
            <div>
              <div className="neg-lot-title">Hard Red Winter Wheat · 12.5% protein</div>
              <div className="cb-small neg-lot-meta">5,000 MT · FOB origin · Delivery Oct 15–30</div>
            </div>
            <div className="neg-lot-ref">
              <div className="cb-tiny">Spot ref</div>
              <div className="cb-mono neg-lot-ref-val">{fmt(NEG_BASE.spotRef)}/MT</div>
            </div>
          </div>
        </div>

        <div className="neg-msgs">
          <Msg side="buyer" name="Buyer · Cargill-04" time="14:22:01">
            Opening at <b>{fmt(NEG_BASE.open)}/MT</b>. Looking for 5,000 MT HRW 12.5% protein, FOB origin, Oct 15–30 delivery, std contract.
          </Msg>
          <Msg side="seller" name="Seller · Hartmann Farms" time="14:22:04">
            Counter <b>{fmt(NEG_BASE.counter1)}/MT</b>. Can do 5,000 MT clean — 13.1% protein, falling number 320+. Need 50% L/C on signing.
          </Msg>
          <Msg side="buyer" name="Buyer · Cargill-04" time="14:22:11">
            Premium acknowledged for protein. <b>{fmt(NEG_BASE.counter2)}/MT</b>, 30% L/C, balance NET-15 post-discharge. Confirm origin certs.
          </Msg>
          <Msg side="seller" name="Seller · Hartmann Farms" time="14:22:15">
            <b>{fmt(NEG_BASE.final)}/MT</b> — final. USDA-FGIS certs attached, EU-RED traceable. Will release lot on signature.
          </Msg>
          <Msg side="system" name="Settlement engine" time="14:22:19">
            Match found. Drafting contract — ETA 11s.
          </Msg>
        </div>

        <div className="neg-settle">
          <div>
            <div className="cb-mono neg-settle-label">SETTLEMENT</div>
            <div className="neg-settle-val">{fmt(NEG_BASE.final)}/MT · {totalDisplay} total</div>
          </div>
          <button type="button" className="cb-btn">
            Review contract
            <ArrowSmIcon />
          </button>
        </div>
      </div>

      <div className="cb-card neg-float bid">
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Competing bid</div>
        <div className="cb-mono neg-float-bid-val">ADM-12 · {fmt(NEG_BASE.competing)}/MT</div>
        <div className="cb-tiny" style={{ marginTop: 4 }}>Outbid 1.4s ago</div>
      </div>

      <div className="cb-card neg-float savings">
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Saved vs. spot benchmark</div>
        <div className="neg-float-sv-n">+{savingsDisplay}</div>
        <div className="cb-tiny" style={{ marginTop: 2 }}>1.2% over benchmark</div>
      </div>
    </div>
  );
}

function Msg({
  side, name, time, children,
}: {
  side: 'buyer' | 'seller' | 'system';
  name: string;
  time: string;
  children: ReactNode;
}) {
  return (
    <div className={`msg msg-${side}`}>
      <div className="msg-head">
        <span className={`msg-dot ${side}`} />
        <span className="cb-mono msg-name">{name}</span>
        <span className="cb-mono msg-time">{time}</span>
      </div>
      <div className={side === 'system' ? 'msg-body-system' : undefined}>{children}</div>
    </div>
  );
}

function LogoStrip() {
  return (
    <div className="logo-strip">
      <div className="logo-strip-inner">
        <span className="cb-eyebrow">Procurement teams at</span>
        <div className="logo-strip-names">
          {LOGO_STRIP.map((n) => <span key={n}>{n}</span>)}
        </div>
      </div>
    </div>
  );
}

function Pillars() {
  return (
    <section id="how" className="pillars">
      <div className="pillars-inner">
        <div className="pillars-head">
          <span className="cb-eyebrow">How CropBid works</span>
          <h2 className="cb-h1">From your field to the buyer —<br />without leaving home.</h2>
        </div>
        <div className="pillars-grid">
          {PILLARS.map(([n, title, body]) => (
            <div key={n} className="pillar">
              <span className="cb-mono pillar-eyebrow">{n}</span>
              <h3 className="cb-h3">{title}</h3>
              <p className="cb-body">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceEngine() {
  return (
    <section id="rates" className="anatomy">
      <div className="anatomy-inner">
        <div>
          <span className="cb-eyebrow">Inside the price engine</span>
          <h2 className="cb-h2">The fair price, surfaced.</h2>
          <p className="cb-body anatomy-lede">
            Every negotiation on CropBid is anchored to the Government of India's live mandi feed —
            so neither side starts from a guess. Today's rate, the min–max wholesale band, and a
            simple signal for where the price sits against usual. That's the whole trick: when both
            sides see the same real number, the deal is fair by construction.
          </p>
          <ul className="anatomy-list">
            {PRICE_POINTS.map(([t, d]) => (
              <li key={t}>
                <span className="t">{t}</span>
                <span className="d">{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="cb-app" style={{ background: 'transparent', padding: 0 }}>
          <RatesBoard />
          <Link to="/rates" className="cb-btn cb-btn-ghost" style={{ marginTop: 4 }}>
            Full board — every mandi, every state
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ForConsumers() {
  return (
    <section id="consumers" className="consumers">
      <div className="consumers-inner">
        <div className="consumers-head">
          <span className="cb-eyebrow">For consumers · buy direct</span>
          <h2 className="cb-h1 consumers-title">
            Not buying by the container?<br />
            <span className="italic">Buy straight from the farm.</span>
          </h2>
          <p className="cb-body consumers-lede">
            You don’t have to be a processor or an exporter. Anyone can buy any quantity directly
            from the farmers on CropBid — no bidding, no minimums, no markups. Fresh from the field,
            at a price that’s fair to the person who grew it.
          </p>
          <Link to="/" className="cb-btn cb-btn-primary">
            Start buying direct
            <ArrowIcon />
          </Link>
        </div>
        <div className="consumers-grid">
          {CONSUMER_POINTS.map(([t, d]) => (
            <div key={t} className="consumer-card">
              <h3 className="cb-h3 consumer-card-title">{t}</h3>
              <p className="cb-small">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ currency }: { currency: CurrencyCode }) {
  const fmt = (v: number) => formatMoney(convert(v, NEG_BASE.currency, currency), currency, { decimals: 2 });

  return (
    <section id="farmers" className="how">
      <div className="how-inner">
        <div className="how-head">
          <div>
            <span className="cb-eyebrow">Transparent by construction</span>
            <h2 className="cb-h1">You see every bid.<br /><span className="italic">Including the ones you lost.</span></h2>
          </div>
          <p className="cb-body">
            Old-school trades hide the spread. CropBid surfaces it. Every counterparty quote, every counter,
            every walk-away decision is timestamped and exportable. Compliance gets a clean audit trail;
            trading gets feedback loops that compound across seasons.
          </p>
        </div>

        <div className="cb-card how-table">
          <div className="how-row head">
            <span>T+</span><span>Event</span><span>Counter</span><span>Price</span><span>Vol (MT)</span><span>Spread</span><span>—</span>
          </div>
          {HOW_BASE.map((row, i) => {
            const isMatch = i === HOW_BASE.length - 1;
            const priceCell = row.price === null
              ? '—'
              : Array.isArray(row.price)
                ? `${fmt(row.price[0])} – ${fmt(row.price[1])}`
                : fmt(row.price);
            const spreadCell = row.spread === null ? '—' : fmt(row.spread);
            return (
              <div key={row.t} className={`how-row${isMatch ? ' match' : ''}`}>
                <span className="t">{row.t}</span>
                <span>{row.evt}</span>
                <span className="counter">{row.counter}</span>
                <span className="price">{priceCell}</span>
                <span className="vol">{row.qty === null ? '—' : row.qty.toLocaleString('en-US')}</span>
                <span className="spread">{spreadCell}</span>
                <span className={isMatch ? 'match-mark' : 'ok'}>{row.mark}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Proof() {
  const items: ReadonlyArray<readonly [string, string, string]> = [
    ['1.6%', 'avg. price improvement', 'vs. offline benchmark on identical lots'],
    ['14×',  'faster to bind',         'median 41s vs. 9 minutes by phone or terminal'],
    [`${STATIC_TOTALS.farmers + STATIC_TOTALS.buyers}`, 'verified counterparties', 'KYC + USDA / EU-RED / GAFTA / APMC credentialed'],
    [`${STATIC_TOTALS.countries || 23}`, 'origin countries', 'CONAB, USDA, ABARES, EU CAP, eNAM data ingested live'],
  ];

  return (
    <section id="pricing" className="proof">
      <div className="proof-grid">
        {items.map(([n, l, d]) => (
          <div key={l} className="proof-item">
            <div className="proof-n">{n}</div>
            <div className="proof-l">{l}</div>
            <div className="cb-small proof-d">{d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mission() {
  return (
    <section className="testimonial">
      <div className="testimonial-inner">
        <div className="img-slot">
          <img src="/mandi.jpg" alt="Farmers and traders at an Indian mandi" loading="lazy" />
        </div>
        <div>
          <span className="cb-eyebrow">Why we built CropBid</span>
          <p className="testimonial-quote">
            “Every harvest, growers lose margin to prices they never get to see.
            CropBid runs transparent, auditable auctions, verifies every lot ourselves, and
            handles transport farm-to-buyer — so farmers get fair prices without ever leaving
            the field.”
          </p>
          <div className="testimonial-attribution">
            <div className="name">The CropBid team</div>
            <div className="cb-small">Building fair price discovery for agriculture</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="cta">
      <div className="cta-card">
        <div className="cta-grid-bg" />
        <div className="cta-inner">
          <div>
            <h2 className="cb-h1">Stop guessing prices.<br />Start running auctions.</h2>
            <p className="cb-body cta-lede">
              List your first lot or place your first bid in minutes. Live mandi rates, open
              bidding, escrow settlement — bring your crop, we'll bring the market.
            </p>
          </div>
          <div className="cta-actions">
            <Link to="/signup" className="cb-btn cta-primary">
              Start trading free
              <ArrowIcon />
            </Link>
            <a href="#resources" className="cb-btn cta-ghost">
              Talk to our trading team
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Page
// =============================================================================

export function HowItWorksPage() {
  const [country, setCountry] = useState<Country>(loadCountry);
  const currency = country.currency;

  const handleChangeCountry = (next: Country) => {
    setCountry(next);
    saveCountry(next);
  };

  return (
    <div className="cb-landing">
      <Nav country={country} onChangeCountry={handleChangeCountry} />
      <Hero currency={currency} />
      <LogoStrip />
      <Pillars />
      <PriceEngine />
      <ForConsumers />
      <HowItWorks currency={currency} />
      <Proof />
      <Mission />
      <CTA />
      <CBFooter />
    </div>
  );
}
