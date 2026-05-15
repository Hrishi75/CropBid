import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';

// =============================================================================
// Landing Page — global, currency-aware
// =============================================================================
// Live stats come from GET /api/stats/landing. A country dropdown in the nav
// drives display currency: prices/GMV/example deals are converted from each
// listing's native currency to the viewer's currency via FX_TO_USD. Selection
// persists in localStorage. Page renders against fallback data if the API is
// unreachable so a cold backend doesn't blank the marketing page.

type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
type UnitCode = 'KG' | 'QUINTAL' | 'TONNE';

interface Country {
  code: string;
  name: string;
  flag: string;
  currency: CurrencyCode;
}

const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'IN', name: 'India',         flag: '🇮🇳', currency: 'INR' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'EU', name: 'European Union', flag: '🇪🇺', currency: 'EUR' },
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷', currency: 'USD' },
  { code: 'AU', name: 'Australia',     flag: '🇦🇺', currency: 'USD' },
  { code: 'KE', name: 'Kenya',         flag: '🇰🇪', currency: 'USD' },
  { code: 'AE', name: 'UAE',           flag: '🇦🇪', currency: 'USD' },
];

// USD-anchored FX. Used both to combine multi-currency GMV and to convert
// per-listing prices to the viewer's currency. Replace with a daily feed once
// treasury wires one in.
const FX_TO_USD: Record<CurrencyCode, number> = {
  INR: 0.012,
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
};

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
};

const UNIT_LABEL: Record<UnitCode, string> = {
  KG: 'kg', QUINTAL: 'qtl', TONNE: 'MT',
};

function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const usd = amount * FX_TO_USD[from];
  return usd / FX_TO_USD[to];
}

// =============================================================================
// Static copy — global agri trade
// =============================================================================

const NAV_LINKS = [
  ['How it works', '#how'],
  ['For buyers',   '#buyers'],
  ['For farmers',  '#farmers'],
  ['Marketplace',  '#marketplace'],
  ['Pricing',      '#pricing'],
  ['Resources',    '#resources'],
] as const;

const LOGO_STRIP = ['CARGILL', 'ADM', 'BUNGE', 'OLAM', 'ITC FOODS', 'COFCO', 'LOUIS DREYFUS', 'NESTLÉ'] as const;

const PILLARS = [
  ['01', 'Brief the agent in plain language', 'Crop, grade, volume, delivery window, payment terms — and the price you walk away at. Any language, any units.'],
  ['02', 'Auctions run while you sleep', 'CropBid invites verified growers and FPOs across 20+ countries, runs sealed-bid or live counter rounds, and stays inside your guardrails.'],
  ['03', 'Settle on-platform with escrow', 'GAFTA, FOSFA, NGFA, APMC templates pre-loaded. Escrow, L/C, origin certificates handled in one settlement flow.'],
] as const;

const GUARDRAILS = [
  ['Guardrails',   'Price floors, volume ceilings, counterparty allowlists. Hard-stops the agent will not cross.'],
  ['Provenance',   'Every listing tied to a USDA, EU-RED, GLOBALG.A.P., APMC, or NPOP credential on chain.'],
  ['Auditability', 'Replayable bid logs. Every counter, every accept, every walk-away — exportable for compliance.'],
] as const;

// Example deal — values stored in USD/MT; rendered in the viewer's currency.
const DIAGRAM_BASE = {
  currency: 'USD' as CurrencyCode,
  unit: 'MT' as const,
  floor: 275,
  ceiling: 292,
  walkAway: 294,
  qtyLow: 4500,
  qtyHigh: 5500,
  protein: '12.0%',
  delivery: 'Oct 15 – Oct 30 · FOB hub',
};

const SPARK_POS = [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12];
const SPARK_NEG = [10, 9, 11, 8, 9, 7, 8, 6, 5, 7, 5];

// Negotiation panel base values — USD/MT, converted at render.
const NEG_BASE = {
  currency: 'USD' as CurrencyCode,
  unit: 'MT' as const,
  spotRef: 287.4,
  open: 282.1,
  counter1: 291.5,
  counter2: 286.8,
  final: 288.0,
  competing: 287.2,
  qty: 5000,
  savings: 17400,
};

// How-it-works trace — USD/MT base values per row.
const HOW_BASE = [
  { t: '+00:00', evt: 'Brief accepted',       counter: '—',                  price: null, spread: null, qty: null,  mark: '✓' as const },
  { t: '+00:12', evt: 'Invite sent',          counter: '14 sellers',         price: null, spread: null, qty: 5000,  mark: '✓' as const },
  { t: '+01:03', evt: 'Bids opened',          counter: '11 received',        price: [281, 294] as [number, number], spread: 13, qty: 5000, mark: '✓' as const },
  { t: '+01:24', evt: 'Round 2 counter',      counter: 'Hartmann Farms',     price: 291.5, spread: 9.4, qty: 5000,  mark: '✓' as const },
  { t: '+01:38', evt: 'Round 3 counter',      counter: 'Hartmann Farms',     price: 288.0, spread: 1.2, qty: 5000,  mark: '✓' as const },
  { t: '+01:41', evt: 'Match · contract drafted', counter: 'Hartmann Farms', price: 288.0, spread: null, qty: 5000, mark: '●' as const },
];

const FOOTER_COLS = [
  { title: 'Product',     items: ['How it works', 'For buyers', 'For farmers', 'Marketplace', 'Pricing', 'Security'] },
  { title: 'Commodities', items: ['Wheat & barley', 'Corn & soy', 'Rice', 'Coffee & cocoa', 'Spices', 'See all'] },
  { title: 'Company',     items: ['About', 'Customers', 'Careers', 'Press', 'Blog', 'Contact'] },
  { title: 'Resources',   items: ['Documentation', 'Trust center', 'Status', 'Reports', 'Glossary', 'API'] },
];

// =============================================================================
// Live data types + fallbacks
// =============================================================================

type MarketRow = {
  id: string;
  crop: string;
  variety: string | null;
  grade: 'A' | 'B' | 'C';
  organic: boolean;
  location: string;
  state: string;
  country: string;
  unit: UnitCode;
  currency: CurrencyCode;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  quantity: number;
  bidCount: number;
  trustScore: number;
  farmerName: string;
  tone: 'pos' | 'neg';
  deltaPct: number;
  spark: number[];
};

type LandingStats = {
  totals: {
    activeListings: number;
    farmers: number;
    buyers: number;
    gmvByCurrency: Record<CurrencyCode, number>;
    completedDeals: number;
    activeAuctions: number;
    countries: number;
  };
  marketplace: MarketRow[];
};

const FALLBACK_STATS: LandingStats = {
  totals: {
    activeListings: 0,
    farmers: 0,
    buyers: 0,
    gmvByCurrency: { INR: 0, USD: 0, EUR: 0, GBP: 0 },
    completedDeals: 0,
    activeAuctions: 0,
    countries: 0,
  },
  marketplace: [],
};

const FALLBACK_MARKET: MarketRow[] = [
  { id: 'f1', crop: 'HRW Wheat',   variety: '12.5% protein', grade: 'A', organic: false, location: 'Kansas City', state: 'Kansas',     country: 'USA',    unit: 'TONNE',   currency: 'USD', pricePerUnitMin: 285, pricePerUnitMax: 292, quantity: 5000, bidCount: 8,  trustScore: 86, farmerName: 'Hartmann Farms',  tone: 'pos', deltaPct: 0.8,  spark: SPARK_POS },
  { id: 'f2', crop: 'Yellow Corn', variety: 'US #2',         grade: 'B', organic: false, location: 'Des Moines',  state: 'Iowa',       country: 'USA',    unit: 'TONNE',   currency: 'USD', pricePerUnitMin: 172, pricePerUnitMax: 180, quantity: 12000, bidCount: 11, trustScore: 92, farmerName: 'John Miller',     tone: 'neg', deltaPct: -0.4, spark: SPARK_NEG },
  { id: 'f3', crop: 'Soybeans',    variety: 'GMO-free',      grade: 'A', organic: false, location: 'São Paulo',   state: 'São Paulo',  country: 'Brazil', unit: 'TONNE',   currency: 'USD', pricePerUnitMin: 408, pricePerUnitMax: 418, quantity: 3500,  bidCount: 6,  trustScore: 78, farmerName: 'Carlos Silva',    tone: 'pos', deltaPct: 1.2,  spark: SPARK_POS },
  { id: 'f4', crop: 'Arabica',     variety: 'Specialty 85+', grade: 'A', organic: true,  location: 'Nairobi',     state: 'Central',    country: 'Kenya',  unit: 'TONNE',   currency: 'USD', pricePerUnitMin: 5750, pricePerUnitMax: 5890, quantity: 240,  bidCount: 9,  trustScore: 88, farmerName: 'James Mwangi',    tone: 'pos', deltaPct: 2.1,  spark: SPARK_POS },
];

// =============================================================================
// Currency formatting
// =============================================================================

function formatMoney(amount: number, currency: CurrencyCode, opts: { compact?: boolean; decimals?: number } = {}): string {
  const { compact = false, decimals = 0 } = opts;
  const sym = CURRENCY_SYMBOL[currency];
  const abs = Math.abs(amount);

  if (compact) {
    // INR groups by lakh/crore; others use K/M/B.
    if (currency === 'INR') {
      if (abs >= 1e7) return `${sym}${(amount / 1e7).toFixed(amount >= 1e8 ? 0 : 1)} Cr`;
      if (abs >= 1e5) return `${sym}${(amount / 1e5).toFixed(amount >= 1e6 ? 0 : 1)} L`;
      if (abs >= 1e3) return `${sym}${(amount / 1e3).toFixed(0)}K`;
      return `${sym}${amount.toFixed(0)}`;
    }
    if (abs >= 1e9) return `${sym}${(amount / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sym}${(amount / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sym}${(amount / 1e3).toFixed(0)}K`;
    return `${sym}${amount.toFixed(0)}`;
  }

  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${amount.toLocaleString(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
  return `${n}`;
}

function totalGmvInDisplay(byCurrency: Record<CurrencyCode, number>, display: CurrencyCode): number {
  return (Object.keys(byCurrency) as CurrencyCode[]).reduce(
    (acc, c) => acc + convert(byCurrency[c] ?? 0, c, display),
    0,
  );
}

function formatMarketPrice(row: MarketRow, display: CurrencyCode): string {
  const mid = (row.pricePerUnitMin + row.pricePerUnitMax) / 2;
  const converted = convert(mid, row.currency, display);
  // Per-unit prices: never use K/M compaction — exact figures matter.
  return formatMoney(converted, display, { decimals: converted >= 1000 ? 0 : 2 });
}

function formatQuantity(row: MarketRow): string {
  const unit = UNIT_LABEL[row.unit];
  if (row.quantity >= 1000) return `${(row.quantity / 1000).toFixed(1)}K ${unit}`;
  return `${Math.round(row.quantity)} ${unit}`;
}

// =============================================================================
// SVG icons + chart
// =============================================================================

function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 7h8M7 3l4 4-4 4" />
    </svg>
  );
}
function ArrowSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h6M6 3l3 3-3 3" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3 1l8 5-8 5z" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2.5 4l2.5 2.5L7.5 4" />
    </svg>
  );
}
function ArcMark({ size = 27, accent = '#c8602b' }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M5 30C5 17 10 8 20 8s15 9 15 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="5" cy="30" r="3.6" fill="currentColor" />
      <circle cx="35" cy="30" r="3.6" fill="currentColor" />
      <circle cx="20" cy="8" r="2.6" fill={accent} />
    </svg>
  );
}

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const W = 170, H = 36;
  const max = Math.max(...data), min = Math.min(...data);
  const rng = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (W - 2) + 1;
    const y = H - 2 - ((v - min) / rng) * (H - 4);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const fill = `${pts} L${W - 1} ${H} L1 ${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={fill} fill={color} opacity="0.12" />
      <path d={pts} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =============================================================================
// Country selector
// =============================================================================

function CountrySelector({ country, onChange }: { country: Country; onChange: (c: Country) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="nav-signin"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '4px 8px', borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{country.flag}</span>
        <span>{country.currency}</span>
        <ChevronIcon />
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
            minWidth: 220, listStyle: 'none', margin: 0, padding: 6,
            background: 'var(--cb-paper, #fff)', color: 'var(--cb-ink)',
            border: '1px solid var(--cb-line)', borderRadius: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.08)',
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {COUNTRIES.map((c) => {
            const selected = c.code === country.code;
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(c);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 6,
                    background: selected ? 'rgba(20,20,15,0.06)' : 'transparent',
                    border: 'none', cursor: 'pointer', font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{c.flag}</span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span className="cb-mono" style={{ fontSize: 12, opacity: 0.7 }}>{c.currency}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
      </nav>
      <div className="nav-actions">
        <CountrySelector country={country} onChange={onChangeCountry} />
        <Link to="/login" className="nav-signin">Sign in</Link>
        <Link to="/signup" className="cb-btn cb-btn-primary">
          Request a buyer agent
          <ArrowIcon />
        </Link>
      </div>
    </header>
  );
}

function Hero({ stats, currency }: { stats: LandingStats; currency: CurrencyCode }) {
  const gmv = totalGmvInDisplay(stats.totals.gmvByCurrency, currency);
  const heroStats: ReadonlyArray<readonly [string, string]> = [
    [gmv > 0 ? formatMoney(gmv, currency, { compact: true }) : '—', 'GMV settled on-platform'],
    [formatCount(stats.totals.farmers), 'verified growers & FPOs'],
    [`${stats.totals.activeAuctions}`, 'auctions clearing now'],
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
            Your buyer agent<br />
            <span className="italic">never sleeps,</span><br />
            never overpays.
          </h1>
          <p className="cb-body hero-lede">
            CropBid gives procurement teams an autonomous agent that finds growers, negotiates terms, and closes
            forward contracts on bulk commodities — without brokers, without phone trees, without margin leakage.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="cb-btn cb-btn-primary">
              Deploy a buyer agent
              <ArrowIcon />
            </Link>
            <a href="#marketplace" className="cb-btn cb-btn-ghost">
              <PlayIcon />
              Watch a live auction
            </a>
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
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Savings vs. broker</div>
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
          <span className="cb-eyebrow">The procurement stack, reduced</span>
          <h2 className="cb-h1">Three steps replace a six-week RFQ.</h2>
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

function AgentAnatomy({ currency }: { currency: CurrencyCode }) {
  const fmt = (v: number) => formatMoney(convert(v, DIAGRAM_BASE.currency, currency), currency, { decimals: 2 });

  const rows = [
    { label: 'PRICE FLOOR',   val: `${fmt(DIAGRAM_BASE.floor)} / MT`,   bar: 55, hot: false },
    { label: 'PRICE CEILING', val: `${fmt(DIAGRAM_BASE.ceiling)} / MT`, bar: 92, hot: true  },
    { label: 'VOLUME RANGE',  val: `${DIAGRAM_BASE.qtyLow.toLocaleString('en-US')} – ${DIAGRAM_BASE.qtyHigh.toLocaleString('en-US')} MT`, bar: 75, hot: false },
    { label: 'PROTEIN MIN',   val: DIAGRAM_BASE.protein,                bar: 62, hot: false },
    { label: 'DELIVERY',      val: DIAGRAM_BASE.delivery,                bar: 45, hot: false },
    { label: 'WALK-AWAY',     val: `${fmt(DIAGRAM_BASE.walkAway)} / MT`, bar: 98, hot: true  },
  ];

  const openDelta = DIAGRAM_BASE.floor + 7;
  const closeDelta = DIAGRAM_BASE.ceiling - 4;
  const strategy = `Open at floor + ${fmt(7)}, accept at ceiling − ${fmt(4)}. Match competing bids within 0.5%.`;
  void openDelta; void closeDelta;

  return (
    <section id="buyers" className="anatomy">
      <div className="anatomy-inner">
        <div>
          <span className="cb-eyebrow">Inside the agent</span>
          <h2 className="cb-h2">Negotiation, not chatter.</h2>
          <p className="cb-body anatomy-lede">
            CropBid agents are deterministic at the edges: hard price floors, hard volume ceilings, cryptographic
            identity. The negotiation in between uses a value model calibrated on 18 years of physical commodity
            settlements across 20+ countries.
          </p>
          <ul className="anatomy-list">
            {GUARDRAILS.map(([t, d]) => (
              <li key={t}>
                <span className="t">{t}</span>
                <span className="d">{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="cb-card diagram cb-grid-bg">
          <div className="diagram-head">
            <span className="cb-eyebrow">Agent: Cargill-04</span>
            <span className="diagram-active">● ACTIVE · 12 lots</span>
          </div>
          <div className="diagram-rows">
            {rows.map((r) => (
              <div key={r.label} className="diagram-row">
                <span className="lbl">{r.label}</span>
                <div className={`diagram-bar${r.hot ? ' hot' : ''}`}>
                  <div style={{ width: `${r.bar}%` }} />
                </div>
                <span className="val">{r.val}</span>
              </div>
            ))}
          </div>
          <div className="diagram-strategy">
            <div className="head">STRATEGY</div>
            <div className="body">{strategy}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketSnapshot({ rows, activeCount, currency }: { rows: MarketRow[]; activeCount: number; currency: CurrencyCode }) {
  const display = rows.length > 0 ? rows : FALLBACK_MARKET;
  const headline = activeCount > 0 ? `${activeCount} auctions clearing right now.` : 'Live marketplace.';

  return (
    <section id="marketplace" className="market">
      <div className="market-inner">
        <div className="market-head">
          <div>
            <span className="cb-eyebrow">Marketplace · live</span>
            <h2 className="cb-h2">{headline}</h2>
          </div>
          <Link to="/buyer/browse" className="cb-btn cb-btn-ghost">
            Open marketplace
            <ArrowIcon />
          </Link>
        </div>
        <div className="market-grid">
          {display.map((row) => {
            const color = row.tone === 'pos' ? '#9bc97a' : '#e07a3f';
            const deltaLabel = `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%`;
            return (
              <div key={row.id} className="market-cell">
                <div className="market-row">
                  <span className="market-name">{row.crop}</span>
                  <span className={`market-d ${row.tone}`}>{deltaLabel}</span>
                </div>
                <div className="cb-tiny market-grade">
                  {row.variety ? `${row.variety} · ` : ''}Grade {row.grade}{row.organic ? ' · Organic' : ''} · {row.state}, {row.country}
                </div>
                <div className="market-price">{formatMarketPrice(row, currency)}<span className="cb-tiny" style={{ marginLeft: 6, opacity: 0.6 }}>/{UNIT_LABEL[row.unit]}</span></div>
                <MiniChart data={row.spark} color={color} />
                <div className="market-foot">
                  <span className="cb-tiny market-vol">{formatQuantity(row)}</span>
                  <span className="market-closing">● {row.bidCount} bids</span>
                </div>
              </div>
            );
          })}
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
            Brokers hide spread. CropBid surfaces it. Every counterparty quote, every counter, every walk-away
            decision is timestamped and exportable. Compliance gets a clean audit trail; trading gets feedback
            loops that compound across seasons.
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

function Proof({ stats }: { stats: LandingStats }) {
  const items: ReadonlyArray<readonly [string, string, string]> = [
    ['1.6%', 'avg. price improvement', 'vs. broker-mediated benchmark on identical lots'],
    ['14×',  'faster to bind',         'median 41s vs. 9 minutes by phone or terminal'],
    [`${stats.totals.farmers + stats.totals.buyers}`, 'verified counterparties', 'KYC + USDA / EU-RED / GAFTA / APMC credentialed'],
    [`${stats.totals.countries || 23}`, 'origin countries', 'CONAB, USDA, ABARES, EU CAP, eNAM data ingested live'],
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

function Testimonial() {
  return (
    <section className="testimonial">
      <div className="testimonial-inner">
        <div className="img-slot">customer · grain buyer portrait</div>
        <div>
          <span className="cb-eyebrow">Customer · Aria Mills, NA</span>
          <p className="testimonial-quote">
            “We replaced three brokers and a six-person desk. The agent runs 40 forward contracts a week
            and we audit every one. Our basis improved 90 bps in the first quarter.”
          </p>
          <div className="testimonial-attribution">
            <div className="name">Marta Okafor</div>
            <div className="cb-small">VP of Grain Procurement, Aria Mills</div>
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
            <h2 className="cb-h1">Stop calling brokers.<br />Start running auctions.</h2>
            <p className="cb-body cta-lede">
              Spin up a buyer agent in under a day. Bring your own commodity, your own guardrails,
              your own counterparty list. Or use ours.
            </p>
          </div>
          <div className="cta-actions">
            <Link to="/signup" className="cb-btn cta-primary">
              Deploy a buyer agent
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

function CBFooter() {
  return (
    <footer id="resources" className="cb-footer">
      <div className="cb-footer-inner">
        <div className="cb-footer-cols">
          <div>
            <Link to="/" className="wordmark" style={{ color: '#f4f1ea' }}>
              <ArcMark size={28} />
              <span className="wordmark-text" style={{ fontSize: 20 }}>CropBid</span>
            </Link>
            <p className="cb-footer-blurb">
              The autonomous procurement layer for global crop trading. Built for growers, FPOs, and procurement teams across 20+ countries.
            </p>
            <div className="cb-footer-badges">
              {['SOC 2', 'GAFTA', 'ISO 27001'].map((b) => (
                <span key={b} className="cb-chip">{b}</span>
              ))}
            </div>
          </div>

          {FOOTER_COLS.map((c) => (
            <div key={c.title} className="cb-footer-col">
              <div className="cb-footer-col-title">{c.title}</div>
              <ul>
                {c.items.map((i) => <li key={i}><a href="#">{i}</a></li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="cb-footer-bottom">
          <span>© {new Date().getFullYear()} CropBid, Inc.  ·  All rights reserved</span>
          <span className="cb-mono">EBOL // L3 GAFTA license #04428</span>
          <span className="cb-footer-bottom-links">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Disclosures</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// Page
// =============================================================================

const LS_KEY = 'cb-landing-country';

function loadCountry(): Country {
  if (typeof window === 'undefined') return COUNTRIES[0];
  const code = window.localStorage.getItem(LS_KEY);
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function LandingPage() {
  const [country, setCountry] = useState<Country>(loadCountry);
  const [stats, setStats] = useState<LandingStats>(FALLBACK_STATS);

  useEffect(() => {
    let cancelled = false;
    api
      .get<LandingStats>('/stats/landing')
      .then(({ data }) => {
        // Defensive: when no backend is wired (e.g. Vercel without
        // VITE_API_URL), a misrouted /api/* request can return HTML.
        // Only swap in the response if it actually looks like LandingStats.
        if (!cancelled && data && typeof data === 'object' && 'totals' in data) {
          setStats(data);
        }
      })
      .catch(() => {
        // API down — fallback stays. Page still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currency = country.currency;

  const handleChangeCountry = useMemo(
    () => (next: Country) => {
      setCountry(next);
      try {
        window.localStorage.setItem(LS_KEY, next.code);
      } catch {
        // ignore storage errors (private mode, quota)
      }
    },
    [],
  );

  return (
    <div className="cb-landing">
      <Nav country={country} onChangeCountry={handleChangeCountry} />
      <Hero stats={stats} currency={currency} />
      <LogoStrip />
      <Pillars />
      <AgentAnatomy currency={currency} />
      <MarketSnapshot rows={stats.marketplace} activeCount={stats.totals.activeAuctions} currency={currency} />
      <HowItWorks currency={currency} />
      <Proof stats={stats} />
      <Testimonial />
      <CTA />
      <CBFooter />
    </div>
  );
}
