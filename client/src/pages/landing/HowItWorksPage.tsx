// =============================================================================
// How It Works — the simple version
// =============================================================================
// One story, told in order, in plain language: what CropBid is (hero), the
// four steps of a deal (#how), the live price anchor (#rates), the 7-day
// forecast (#forecast), everything else in the box (#features), buying direct
// (#consumers), pricing (#pricing), mission, CTA.
//
// Two rules for this page:
//   1. Every claim describes something that ships in the app TODAY.
//   2. Every section uses the same centered shell (.hiw-sec > .hiw-inner >
//      .hiw-head) so the whole page lines up on one axis.
// The rates board and the forecast preview are LIVE — real API output, not
// screenshots.
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/axios';
import { RatesBoard } from '../../components/listings/RatesBoard';
import {
  type Country,
  loadCountry, saveCountry, CountrySelector,
  ArcMark, ArrowIcon, CBFooter,
} from './shared';

// =============================================================================
// Copy — short sentences, everyday words
// =============================================================================

const NAV_LINKS = [
  ['How it works', '#how'],
  ['Live rates',   '#rates'],
  ['Forecast',     '#forecast'],
  ['What you get', '#features'],
  ['Pricing',      '#pricing'],
] as const;

// The whole product in four steps.
const STEPS: Array<[emoji: string, title: string, desc: string]> = [
  ['🌾', 'Farmer lists the crop', 'Crop, quantity, quality and asking price — from a phone, without travelling to the mandi.'],
  ['🔨', 'Buyers bid — or just buy', 'Traders bid in open rounds where every offer is visible. Households simply buy at the listed price.'],
  ['🛡️', 'Money goes into escrow', 'The buyer pays first. The money is held safely on the platform — both sides can see it there.'],
  ['🚚', 'Deliver, confirm, get paid', 'Transport is booked in-app and tracked. When delivery is confirmed, the money is released to the farmer.'],
];

// Everything else that ships in the app today. Rates and forecast have their
// own sections above, so they are not repeated here.
const FEATURES: Array<[emoji: string, title: string, desc: string]> = [
  ['🔨', 'Live auctions', 'Open bidding rounds on bulk lots — every offer visible, updated in real time.'],
  ['🤝', 'Counter-offers', 'Not happy with a bid? Counter it. The whole conversation stays on the record.'],
  ['🤖', 'AI trading agent', 'Set your floor and ceiling — the agent watches lots and bids for you, within your rules.'],
  ['🧺', 'Buy any quantity', 'One sack or a truckload — anyone can buy straight from a farmer, no bidding needed.'],
  ['🚚', 'Delivery & tracking', 'Book a transport partner in-app and follow every deal: paid → shipped → delivered.'],
  ['🏛️', 'Govt schemes hub', 'PM-KISAN to KCC — 12 schemes explained in English and Hindi, with how to apply.'],
];

const PRICING: Array<[big: string, label: string, desc: string]> = [
  ['Free', 'to list and browse', 'Listing a crop, browsing the market, rates and the forecast cost nothing.'],
  ['2%', 'only when a deal settles', 'One flat fee on completed deals. No subscriptions, no hidden charges.'],
  ['100%', 'of the money in escrow', 'Held on-platform from payment until confirmed delivery. Nobody can run with it.'],
];

// =============================================================================
// Shared bits
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

// Centered section head — eyebrow, title, one plain-language line.
function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub: string }) {
  return (
    <div className="hiw-head">
      <span className="cb-eyebrow">{eyebrow}</span>
      <h2 className="cb-h1">{title}</h2>
      <p className="cb-body hiw-sub">{sub}</p>
    </div>
  );
}

// =============================================================================
// Sections — in reading order
// =============================================================================

function Hero() {
  return (
    <section className="hiw-hero">
      <span className="cb-chip cb-chip-sage" style={{ marginBottom: 22 }}>
        <span className="cb-live-dot sm" />
        An online mandi — live today
      </span>
      <h1 className="cb-h0 hiw-hero-title">
        Farmers sell. Buyers bid.<br />
        <span className="italic">Everyone sees the real price.</span>
      </h1>
      <p className="cb-body hiw-hero-lede">
        CropBid is a marketplace for crops. A farmer lists their harvest from the farm.
        Buyers bid for it — or buy it at the listed price. The money waits in escrow until
        the crop is delivered. That's the whole idea.
      </p>
      <div className="hiw-hero-actions">
        <Link to="/signup" className="cb-btn cb-btn-primary">
          Start trading free
          <ArrowIcon />
        </Link>
        <Link to="/" className="cb-btn cb-btn-ghost">Browse the market</Link>
      </div>
      <div className="hiw-facts">
        {([
          ['4,600+', 'govt mandis in the live price feed'],
          ['16', 'crops rated & forecast every day'],
          ['2%', 'flat fee — nothing else'],
        ] as const).map(([n, l]) => (
          <div key={l} className="hiw-fact">
            <div className="hiw-fact-n">{n}</div>
            <div className="cb-tiny hiw-fact-l">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section id="how" className="hiw-sec alt">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="How it works"
          title={<>A deal in <span className="italic">four steps.</span></>}
          sub="From the field to the buyer's gate — without the farmer ever leaving home."
        />
        <div className="hiw-steps">
          {STEPS.map(([emoji, title, desc], i) => (
            <div key={title} className="hiw-step">
              <span className="cb-mono hiw-step-n">STEP {i + 1}</span>
              <span className="hiw-step-e" aria-hidden="true">{emoji}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LiveRates() {
  return (
    <section id="rates" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Before any deal · know the price"
          title={<>Today's real mandi price,<br /><span className="italic">on every crop.</span></>}
          sub="We pull daily wholesale prices from 4,600+ government-regulated mandis (Agmarknet). Both sides see the same number, so nobody negotiates blind."
        />
        <div className="hiw-panel">
          <RatesBoard />
          <div className="hiw-cta-row">
            <Link to="/rates" className="cb-btn cb-btn-ghost">
              Full board — every mandi, every state
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Live forecast preview — real output from /api/rates/predictions.
interface PreviewPrediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL';
  outlook: { direction: 'rise' | 'hold' | 'ease'; pct7d: number; low: number; high: number };
  supply: { level: string };
  demand: { level: string };
}

function Forecast() {
  const [rows, setRows] = useState<PreviewPrediction[]>([]);

  useEffect(() => {
    let on = true;
    api.get('/rates/predictions')
      .then(({ data }) => { if (on && data?.predictions?.length) setRows(data.predictions.slice(0, 3)); })
      .catch(() => { /* section still reads fine without the live preview */ });
    return () => { on = false; };
  }, []);

  return (
    <section id="forecast" className="hiw-sec alt">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="New · the prediction engine"
          title={<>And where the price<br /><span className="italic">goes next.</span></>}
          sub="Our model reads today's arrivals, the harvest calendar and live demand, then says it plainly: rising, steady or easing over the next 7 days — with the reasons attached."
        />
        <div className="hiw-panel">
          {rows.length > 0 && (
            <div className="fc-hiw-cards">
              <span className="cb-mono fc-hiw-src">LIVE MODEL OUTPUT · BIGGEST MOVERS · NEXT 7 DAYS</span>
              {rows.map((p) => {
                const dir = p.outlook.direction;
                const arrow = dir === 'rise' ? '▲' : dir === 'ease' ? '▼' : '▬';
                const cls = dir === 'rise' ? 'pos' : dir === 'ease' ? 'neg' : 'flat';
                const u = p.unit === 'KG' ? 'kg' : 'qtl';
                return (
                  <div key={p.commodity} className="fc-hiw-card">
                    <span className="e" aria-hidden="true">{p.emoji}</span>
                    <div className="t">
                      <span className="n">{p.label}</span>
                      <span className="cb-mono m">supply {p.supply.level} · demand {p.demand.level}</span>
                    </div>
                    <div className="v">
                      <span className={`d ${cls}`}>{arrow} {dir === 'hold' ? 'steady' : `${p.outlook.pct7d > 0 ? '+' : ''}${p.outlook.pct7d.toFixed(1)}%`}</span>
                      <span className="cb-mono band">₹{p.outlook.low.toLocaleString('en-IN')}–{p.outlook.high.toLocaleString('en-IN')}/{u}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="hiw-cta-row">
            <Link to="/forecast" className="cb-btn cb-btn-ghost">
              The full forecast — every crop, with the why
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="What you get · all live today"
          title={<>Everything here <span className="italic">ships right now.</span></>}
          sub="No roadmap promises. Sign up and all of this is on your dashboard today."
        />
        <div className="hiw-grid">
          {FEATURES.map(([emoji, title, desc]) => (
            <div key={title} className="hiw-card">
              <span className="hiw-card-e" aria-hidden="true">{emoji}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuyDirect() {
  return (
    <section id="consumers" className="hiw-sec alt">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Not a trader?"
          title={<>Buy for your kitchen,<br /><span className="italic">straight from the farm.</span></>}
          sub="Anyone can buy from the farmers on CropBid — one sack or a season's supply, at the farmer's listed price. No bidding, no minimums, no middlemen."
        />
        <div className="hiw-cta-row">
          <Link to="/" className="cb-btn cb-btn-primary">
            Start buying direct
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Pricing"
          title={<>Simple, like the <span className="italic">rest of it.</span></>}
          sub="One fee, and only when a deal actually settles."
        />
        <div className="hiw-grid three">
          {PRICING.map(([big, label, desc]) => (
            <div key={label} className="hiw-card center">
              <div className="hiw-price-n">{big}</div>
              <h3>{label}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
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
            <Link to="/forecast" className="cb-btn cta-ghost">
              See the 7-day forecast
            </Link>
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

  const handleChangeCountry = (next: Country) => {
    setCountry(next);
    saveCountry(next);
  };

  return (
    <div className="cb-landing">
      <Nav country={country} onChangeCountry={handleChangeCountry} />
      <Hero />
      <Steps />
      <LiveRates />
      <Forecast />
      <Features />
      <BuyDirect />
      <Pricing />
      <Mission />
      <CTA />
      <CBFooter />
    </div>
  );
}
