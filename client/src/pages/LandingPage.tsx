import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// =============================================================================
// Landing Page — Live Negotiation direction (handoff from Claude Design)
// =============================================================================
// All styling lives in client/src/index.css under the .cb-landing scope so
// nothing leaks into the rest of the app.

const NAV_LINKS = [
  ['How it works', '#how'],
  ['For buyers', '#buyers'],
  ['For farmers', '#farmers'],
  ['Marketplace', '#marketplace'],
  ['Pricing', '#pricing'],
  ['Resources', '#resources'],
] as const;

const HERO_STATS = [
  ['$1.4B', 'contracted YTD'],
  ['7,200+', 'verified growers'],
  ['41s', 'avg. time to bid'],
] as const;

const LOGO_STRIP = ['CARGILL', 'ADM', 'BUNGE', 'OLAM', 'COFCO', 'LOUIS DREYFUS', 'WILMAR', 'NESTLÉ'] as const;

const PILLARS = [
  ['01', 'Brief the agent in plain English', 'Tell your agent what you need. Crop, grade, volume, delivery window, payment terms — and the price you walk away at.'],
  ['02', 'Auctions run while you sleep', 'CropBid invites verified growers, runs sealed-bid or open negotiation, and stays within your guardrails. You get notified only on shortlist.'],
  ['03', 'Contracts close on the platform', 'GAFTA, FOSFA, NGFA templates pre-loaded. Escrow, L/C, and origin certificates handled in one settlement flow.'],
] as const;

const GUARDRAILS = [
  ['Guardrails', 'Price floors, basis bands, counterparty allowlists. Hard-stop, no override.'],
  ['Provenance', 'Every quote ties back to a USDA, EU-RED, or GLOBALG.A.P. credential on chain.'],
  ['Auditability', 'Replayable bid logs. Every counter, every accept, every walk-away.'],
] as const;

const DIAGRAM_ROWS = [
  { label: 'PRICE FLOOR',   val: '$275.00 / MT',          bar: 55, hot: false },
  { label: 'PRICE CEILING', val: '$292.00 / MT',          bar: 92, hot: true },
  { label: 'VOLUME RANGE',  val: '4,500 – 5,500 MT',      bar: 75, hot: false },
  { label: 'PROTEIN MIN',   val: '12.0%',                 bar: 62, hot: false },
  { label: 'DELIVERY',      val: 'Oct 15 – Oct 30 · FOB KC', bar: 45, hot: false },
  { label: 'WALK-AWAY',     val: '$294.00 / MT',          bar: 98, hot: true },
];

const MARKET_ROWS = [
  { crop: 'HRW Wheat',   grade: '12.5% protein',  price: '$288.00', delta: '+0.8%', vol: '5,000 MT',  closing: '03:41', tone: 'pos' as const },
  { crop: 'Yellow Corn', grade: 'US #2',          price: '$176.20', delta: '-0.4%', vol: '12,000 MT', closing: '01:08', tone: 'neg' as const },
  { crop: 'Soybeans',    grade: 'GMO-free',       price: '$412.75', delta: '+1.2%', vol: '3,500 MT',  closing: '06:55', tone: 'pos' as const },
  { crop: 'Arabica',     grade: 'Specialty 85+',  price: '$5,820',  delta: '+2.1%', vol: '240 MT',    closing: '00:42', tone: 'pos' as const },
];

const SPARK_POS = [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12];
const SPARK_NEG = [10, 9, 11, 8, 9, 7, 8, 6, 5, 7, 5];

const HOW_ROWS: Array<[string, string, string, string, string, string, string]> = [
  ['+00:00', 'Brief accepted',         '—',                 '—',          '—',           '—',     '✓'],
  ['+00:12', 'Invite sent',            '14 sellers',        '—',          '5,000',       '—',     '✓'],
  ['+01:03', 'Bids opened',            '11 received',       '$281–$294',  '5,000–5,500', '$13.00','✓'],
  ['+01:24', 'Round 2 counter',        'Hartmann Farms',    '$291.50',    '5,000',       '$9.40', '✓'],
  ['+01:38', 'Round 3 counter',        'Hartmann Farms',    '$288.00',    '5,000',       '$1.20', '✓'],
  ['+01:41', 'Match · GAFTA-49 drafted','Hartmann Farms',   '$288.00',    '5,000',       '—',     '●'],
];

const PROOF = [
  ['1.6%', 'avg. price improvement', 'vs. broker-mediated benchmark on identical lots'],
  ['14×',  'faster to bind',         'median 41s vs. 9 minutes by phone or terminal'],
  ['0',    'unverified counterparties', 'every grower KYC + USDA / EU-RED credentialed'],
  ['23',   'origin countries',       'CONAB, USDA, ABARES, EU CAP data ingested live'],
] as const;

const FOOTER_COLS = [
  { title: 'Product',     items: ['How it works', 'For buyers', 'For farmers', 'Marketplace', 'Pricing', 'Security'] },
  { title: 'Commodities', items: ['Wheat & barley', 'Corn & soy', 'Coffee', 'Cocoa', 'Specialty crops', 'See all'] },
  { title: 'Company',     items: ['About', 'Customers', 'Careers', 'Press', 'Blog', 'Contact'] },
  { title: 'Resources',   items: ['Documentation', 'Trust center', 'Status', 'Reports', 'Glossary', 'API'] },
];

// ── Inline SVG icons ───────────────────────────────────────────────────────
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

// ── Sections ───────────────────────────────────────────────────────────────
function Nav() {
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
        <Link to="/login" className="nav-signin">Sign in</Link>
        <Link to="/signup" className="cb-btn cb-btn-primary">
          Request a buyer agent
          <ArrowIcon />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <span className="cb-chip cb-chip-sage" style={{ marginBottom: 22 }}>
            <span className="cb-live-dot sm" />
            Now contracting · Q3 2026 hard red wheat
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
            {HERO_STATS.map(([n, l]) => (
              <div key={l}>
                <div className="hero-stat-n">{n}</div>
                <div className="cb-tiny hero-stat-l">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <NegotiationPanel />
      </div>
    </section>
  );
}

function NegotiationPanel() {
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
              <div className="cb-small neg-lot-meta">5,000 MT · FOB Kansas City · Delivery Oct 15–30</div>
            </div>
            <div className="neg-lot-ref">
              <div className="cb-tiny">Spot ref</div>
              <div className="cb-mono neg-lot-ref-val">$287.40/MT</div>
            </div>
          </div>
        </div>

        <div className="neg-msgs">
          <Msg side="buyer" name="Buyer · Cargill-04" time="14:22:01">
            Opening at <b>$282.10/MT</b>. Looking for 5,000 MT HRW 12.5% protein, FOB KC, Oct 15–30 delivery, std GAFTA 49.
          </Msg>
          <Msg side="seller" name="Seller · Hartmann Farms" time="14:22:04">
            Counter <b>$291.50/MT</b>. Can do 5,000 MT clean — 13.1% protein, falling number 320+. Need 50% L/C on signing.
          </Msg>
          <Msg side="buyer" name="Buyer · Cargill-04" time="14:22:11">
            Premium acknowledged for protein. <b>$286.80/MT</b>, 30% L/C, balance NET-15 post-discharge. Confirm origin certs.
          </Msg>
          <Msg side="seller" name="Seller · Hartmann Farms" time="14:22:15">
            <b>$288.00/MT</b> — final. USDA-FGIS certs attached, EU-RED traceable. Will release lot on signature.
          </Msg>
          <Msg side="system" name="Settlement engine" time="14:22:19">
            Match found. Drafting GAFTA-49 contract — ETA 11s.
          </Msg>
        </div>

        <div className="neg-settle">
          <div>
            <div className="cb-mono neg-settle-label">SETTLEMENT</div>
            <div className="neg-settle-val">$288.00/MT · $1.44M total</div>
          </div>
          <button type="button" className="cb-btn">
            Review contract
            <ArrowSmIcon />
          </button>
        </div>
      </div>

      <div className="cb-card neg-float bid">
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Competing bid</div>
        <div className="cb-mono neg-float-bid-val">ADM-12 · $287.20/MT</div>
        <div className="cb-tiny" style={{ marginTop: 4 }}>Outbid 1.4s ago</div>
      </div>

      <div className="cb-card neg-float savings">
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Savings vs. broker</div>
        <div className="neg-float-sv-n">+$17,400</div>
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

function AgentAnatomy() {
  return (
    <section id="buyers" className="anatomy">
      <div className="anatomy-inner">
        <div>
          <span className="cb-eyebrow">Inside the agent</span>
          <h2 className="cb-h2">Negotiation, not chatter.</h2>
          <p className="cb-body anatomy-lede">
            CropBid agents are deterministic at the edges: hard price floors, hard volume ceilings,
            cryptographic identity. The negotiation in between uses a proprietary value model
            calibrated on 18 years of physical commodity settlements.
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
            {DIAGRAM_ROWS.map((r) => (
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
            <div className="body">Open with floor + $7, accept at ceiling -$4. Match competing within 0.5%.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketSnapshot() {
  return (
    <section id="marketplace" className="market">
      <div className="market-inner">
        <div className="market-head">
          <div>
            <span className="cb-eyebrow">Marketplace · live</span>
            <h2 className="cb-h2">287 auctions clearing right now.</h2>
          </div>
          <a className="cb-btn cb-btn-ghost" href="#marketplace">
            Open marketplace
            <ArrowIcon />
          </a>
        </div>
        <div className="market-grid">
          {MARKET_ROWS.map((row) => (
            <div key={row.crop} className="market-cell">
              <div className="market-row">
                <span className="market-name">{row.crop}</span>
                <span className={`market-d ${row.tone}`}>{row.delta}</span>
              </div>
              <div className="cb-tiny market-grade">{row.grade}</div>
              <div className="market-price">{row.price}</div>
              <MiniChart
                data={row.tone === 'pos' ? SPARK_POS : SPARK_NEG}
                color={row.tone === 'pos' ? '#9bc97a' : '#e07a3f'}
              />
              <div className="market-foot">
                <span className="cb-tiny market-vol">{row.vol}</span>
                <span className="market-closing">● closes {row.closing}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
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
            loops that compound.
          </p>
        </div>

        <div className="cb-card how-table">
          <div className="how-row head">
            <span>T+</span><span>Event</span><span>Counter</span><span>Price</span><span>Vol (MT)</span><span>Spread</span><span>—</span>
          </div>
          {HOW_ROWS.map((row, i) => {
            const isMatch = i === HOW_ROWS.length - 1;
            return (
              <div key={row[0]} className={`how-row${isMatch ? ' match' : ''}`}>
                <span className="t">{row[0]}</span>
                <span>{row[1]}</span>
                <span className="counter">{row[2]}</span>
                <span className="price">{row[3]}</span>
                <span className="vol">{row[4]}</span>
                <span className="spread">{row[5]}</span>
                <span className={isMatch ? 'match-mark' : 'ok'}>{row[6]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section id="pricing" className="proof">
      <div className="proof-grid">
        {PROOF.map(([n, l, d]) => (
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
              The autonomous procurement layer for bulk crop trading. Built in St. Louis &amp; Buenos Aires.
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
          <span>© 2026 CropBid, Inc.  ·  All rights reserved</span>
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

export function LandingPage() {
  return (
    <div className="cb-landing">
      <Nav />
      <Hero />
      <LogoStrip />
      <Pillars />
      <AgentAnatomy />
      <MarketSnapshot />
      <HowItWorks />
      <Proof />
      <Testimonial />
      <CTA />
      <CBFooter />
    </div>
  );
}
