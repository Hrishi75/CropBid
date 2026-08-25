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
import { SignInLink } from '../../components/auth/SignInLink';

// =============================================================================
// Copy — short sentences, everyday words
// =============================================================================

const NAV_LINKS = [
  ['How it works', '#how'],
  ['Partners',     '#partner'],
  ['Quality',      '#quality'],
  ['Live rates',   '#rates'],
  ['Forecast',     '#forecast'],
  ['What you get', '#features'],
  ['Pricing',      '#pricing'],
] as const;

// The whole product in four steps. Step one is the approval gate — it comes
// first because it is what makes the rest of it trustworthy, and because it is
// genuinely the first thing that happens to anyone selling here.
const STEPS: Array<[emoji: string, title: string, desc: string]> = [
  ['✅', 'Sellers apply, we review', 'Farmers, local shops and wholesalers apply with their licences. Our team checks every application before they can sell to anyone.'],
  ['🌾', 'Approved sellers list stock', 'Crop, quantity, quality and their own asking price — from a phone, without travelling to the mandi.'],
  ['🧺', 'Buyers bid — or just buy', 'Businesses bid in open rounds where every offer is visible. Households simply buy at the listed price.'],
  ['🛡️', 'Escrow pays out on delivery', 'The buyer pays first and the money is held on the platform. Transport is booked in-app; when delivery is confirmed the seller is paid.'],
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
  ['🪪', 'No anonymous sellers', 'Every seller is a reviewed partner with a name, a place and, where the law needs it, a licence on file.'],
  ['📱', 'No passwords, ever', 'Sign in with your phone number and a 6-digit code. Nothing to remember, nothing to reset.'],
];

// =============================================================================
// Quality standards — the published norms a lot gets judged against
// =============================================================================
// This section is REFERENCE, not a description of our grading. It shows the
// limits a lot is measured against once it reaches a mandi, a processor or a
// procurement centre — so a farmer knows the numbers before harvest and a buyer
// knows what to ask for.
//
// Mostly Indian standards, but not exclusively: cocoa is graded on ISO 2451 and
// its cadmium ceiling is the EU's, because that is what actually gates the
// export. Keep `source` on each entry honest about which body sets the number.
//
// DO NOT rewrite this as "what CropBid's Grade A means". Listing.qualityGrade is
// a self-declared A/B/C pill on the create-listing form (defaults to 'A'); there
// is no crop-specific threshold behind it and nothing validates it. Tying these
// figures to that grade would tell buyers a declaration had been measured when
// it hasn't. If the grade ever becomes derived from entered parameters, this
// comment is the thing to revisit.
//
// NOTHING HERE IS INVENTED. Every limit below is a published government figure
// — FCI/DFPD uniform specifications for foodgrains, the PSS FAQ specification
// for oilseeds, FSSAI food product standards, AGMARK grades. Sources are cited
// per crop in `source`, and the section footnote names them. If you edit a
// number, bring the citation with it.

interface QCheck {
  test: string;
  limit: string;
  why: string;
}

interface QStandard {
  id: string;
  label: string;
  emoji: string;
  source: string;   // The document the limits come from — shown on the panel.
  checks: QCheck[];
  note?: string;    // Caveat or sub-limit that doesn't fit a row.
}

const QUALITY_STANDARDS: QStandard[] = [
  {
    id: 'soybean',
    label: 'Soybean',
    emoji: '🫘',
    source: 'FAQ specification · Price Support Scheme (NAFED / NCCF)',
    checks: [
      { test: 'Moisture', limit: '≤ 12%', why: 'Damp beans heat up inside the bag and turn mouldy before they ever reach the crusher.' },
      { test: 'Foreign matter & impurities', limit: '≤ 2%', why: 'Soil, stones and stray pods — weight the buyer would otherwise pay soybean rates for.' },
      { test: 'Shrivelled, immature & pale beans', limit: '≤ 5%', why: 'Thin beans crush to less oil, so the lot is worth less than the scale says.' },
      { test: 'Weevilled & damaged beans', limit: '≤ 5%', why: 'Insect-bored beans carry the infestation into the rest of the consignment.' },
    ],
    note: 'After unseasonal rain in Kharif 2024–25 the centre relaxed procurement to 15% moisture — but MSP was still paid on the 12% basis, with the difference adjusted down the chain.',
  },
  {
    id: 'wheat',
    label: 'Wheat',
    emoji: '🌾',
    source: 'FCI Uniform Specification · Rabi Marketing Season',
    checks: [
      { test: 'Moisture', limit: '≤ 12%', why: 'The single number that decides whether a lot can be stored for a season or has to move this week.' },
      { test: 'Foreign matter', limit: '≤ 0.75%', why: 'The tightest foreign-matter limit of any Indian foodgrain — wheat is held to three-quarters of one percent.' },
      { test: 'Damaged grains', limit: '≤ 2%', why: 'Grain visibly damaged by weather, heat or sprouting mills into poor flour.' },
      { test: 'Slightly damaged grains', limit: '≤ 4%', why: 'Counted separately and allowed more room, because light discolouration does not ruin the flour.' },
      { test: 'Shrivelled & broken grains', limit: '≤ 6%', why: 'Broken kernels lose flour yield and attract insects faster in storage.' },
      { test: 'Weevilled grains', limit: '≤ 1%', why: 'Live infestation spreads through a godown — so this limit is the strictest of the six.' },
    ],
  },
  {
    id: 'paddy',
    label: 'Paddy / Rice',
    emoji: '🍚',
    source: 'Uniform Specification for paddy · Dept. of Food & Public Distribution (KMS)',
    checks: [
      { test: 'Moisture', limit: '≤ 17%', why: 'Paddy is allowed far more moisture than wheat — it is bought straight off a wet-season harvest.' },
      { test: 'Inorganic foreign matter', limit: '≤ 1%', why: 'Sand, grit and stones, weighed apart from the organic kind.' },
      { test: 'Organic foreign matter', limit: '≤ 1%', why: 'Straw, chaff and weed seed — light, bulky, and easy to hide in a full bag.' },
      { test: 'Damaged, discoloured, sprouted & weevilled', limit: '≤ 5%', why: 'The catch-all defect count. Sprouted grain in particular means the lot got rained on before it was dried.' },
      { test: 'Immature, shrunken & shrivelled', limit: '≤ 3%', why: 'Under-filled grain shatters in the huller, so the miller gets broken rice instead of whole.' },
    ],
    note: 'Inside that 5% band, damaged + sprouted + weevilled grains together may not cross 4% — a sub-limit specifically to stop one bad defect filling the whole allowance.',
  },
  {
    id: 'maize',
    label: 'Maize / Corn',
    emoji: '🌽',
    source: 'FSSAI Food Product Standards 2.4 · whole maize',
    checks: [
      { test: 'Moisture', limit: '≤ 16%', why: 'Maize goes into feed and starch mills, which tolerate more moisture than a flour mill would.' },
      { test: 'Other edible grains', limit: '≤ 3%', why: 'Admixture from a shared threshing floor — still food, but not what the buyer ordered.' },
      { test: 'Damaged grains', limit: '≤ 5%', why: 'Mould-damaged maize is the main route aflatoxin takes into the feed chain.' },
      { test: 'Weevilled grains', limit: '≤ 10% by count', why: 'Counted per grain, not weighed — the only parameter on this list scored that way.' },
      { test: 'Uric acid', limit: '≤ 100 mg/kg', why: 'The lab marker for rodent and insect filth. This is the one test nobody can do by eye.' },
    ],
  },
  {
    id: 'pulses',
    label: 'Pulses — Chana, Tur, Moong, Urad',
    emoji: '🫛',
    source: 'FSSAI standards for whole pulses · AGMARK grades',
    checks: [
      { test: 'Extraneous matter', limit: '≤ 3%', why: 'Of which inorganic matter and impurities of animal origin together may not exceed 0.5%.' },
      { test: 'Total aflatoxin', limit: '≤ 15 µg/kg', why: 'India\'s limit for pulses, cereals, nuts and oilseeds — three times tighter than the 30 µg/kg allowed in spices.' },
      { test: 'Uric acid', limit: '≤ 100 mg/kg', why: 'Storage hygiene, measured. It rises with every week a lot sits in an infested godown.' },
      { test: 'Kesari dal (Lathyrus sativus)', limit: 'nil', why: 'Long prohibited as an adulterant in Indian pulses — sustained consumption causes lathyrism.' },
      { test: 'Live infestation', limit: 'nil', why: 'Weevils breed in transit. A clean lot at loading is not a clean lot at delivery.' },
    ],
  },
  {
    id: 'cocoa',
    label: 'Cocoa',
    emoji: '🍫',
    source: 'ISO 2451 grades · cut test per IS 8832 / ISO 1114',
    checks: [
      { test: 'Mouldy beans', limit: 'I ≤ 3% · II ≤ 4%', why: 'Internal mould is invisible until the bean is cut open, and it carries into the chocolate as off-flavour.' },
      { test: 'Slaty beans', limit: 'I ≤ 3% · II ≤ 8%', why: 'A slate-grey cotyledon means the bean was never properly fermented. No amount of roasting brings the flavour back.' },
      { test: 'Insect-damaged, germinated & flat', limit: 'I ≤ 3% · II ≤ 6%', why: 'Counted together as one allowance. A germinated bean has been pierced by its own shoot, so it is already open to infection.' },
      { test: 'Bean size uniformity', limit: '≤ 12% off-average', why: 'No more than 12% may sit outside ±⅓ of the average bean weight — uneven beans roast unevenly.' },
      { test: 'Moisture', limit: '≤ 8%', why: 'Above this the heap moulds inside the sack. Too far below and the beans turn brittle and shatter in transit.' },
      { test: 'Free fatty acids in the butter', limit: '≤ 1.75%', why: 'The lab measure of bad drying or storage. Past 1.75% the butter is graded inferior, whatever the beans looked like.' },
      { test: 'Cadmium', limit: '≤ 0.60 mg/kg', why: 'The EU limit for cocoa powder. Many buyers reject beans over 0.30 mg/kg outright, so it decides export access.' },
    ],
    note: 'Cocoa is the odd one out on this list: its defects are graded by a cut test, not by weighing. 300 beans are drawn at random and sliced lengthwise, and each bean is scored on the single most serious defect it shows — so no bean is counted twice. The mouldy, slaty, and insect-damaged/germinated/flat percentages are counts of those 300. The last three limits are not: bean size is a weight comparison, and moisture, free fatty acids and cadmium are all measured in a lab.',
  },
  {
    id: 'fresh',
    label: 'Vegetables & fruits',
    emoji: '🥬',
    source: 'FSSAI contaminant & residue rules · AGMARK size grades',
    checks: [
      { test: 'Pesticide residues', limit: 'within FSSAI MRLs', why: 'Screened by GC-MS/MS and LC-MS/MS at NABL labs accredited to ISO/IEC 17025.' },
      { test: 'Artificial ripening', limit: 'no calcium carbide', why: 'Carbide ripening is prohibited in India outright — it is not a limit, it is a ban.' },
      { test: 'Rot, mould & off smell', limit: 'nil', why: 'One rotting crate spoils the pallet around it. This is judged at loading, not on arrival.' },
      { test: 'Size & colour uniformity', limit: 'per AGMARK grade', why: 'The parameter a restaurant buyer actually cares about — portioning depends on it.' },
    ],
    note: 'The national residue programme (MPRNL) puts roughly 70,000 fruit and vegetable samples through 40-odd accredited labs; 3.1% crossed the MRL over the last three years.',
  },
];

// Mirrors the three steps on /partner — same words, so somebody who reads it
// here and applies there doesn't get told a different story.
const PARTNER_STEPS: Array<[n: string, title: string, desc: string]> = [
  ['01', 'Apply', 'Tell us who you are, what you sell or buy, and your licence numbers. Ten minutes, from a phone.'],
  ['02', 'We review', 'A real person checks it, usually within 24–48 hours. If something is missing we ask for it — you don\'t start over.'],
  ['03', 'Go live', 'Approved partners get the full dashboard: listings, orders, bids, deliveries, analytics. You can trade the same day.'],
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
        <Link to="/partner" className="nav-signin">Become a partner</Link>
        <SignInLink className="cb-btn cb-btn-primary" label="">
          <span className="cb-btn-label">Sign in</span>
          <span className="cb-btn-label-short">Sign in</span>
          <ArrowIcon />
        </SignInLink>
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
        Checked sellers. Open prices.<br />
        <span className="italic">Nothing hidden in between.</span>
      </h1>
      <p className="cb-body hiw-hero-lede">
        CropBid is a marketplace for food. Farmers, local shops and wholesalers apply
        to sell here and are reviewed before they can trade. They list at their own
        price. Businesses bid or order in bulk, households buy by the kilo, and the
        money waits in escrow until it's delivered. That's the whole idea.
      </p>
      <div className="hiw-hero-actions">
        <Link to="/partner" className="cb-btn cb-btn-primary">
          Become a partner
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

function Quality() {
  const [cropId, setCropId] = useState(QUALITY_STANDARDS[0].id);
  const std = QUALITY_STANDARDS.find((s) => s.id === cropId) ?? QUALITY_STANDARDS[0];

  return (
    <section id="quality" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Quality · what gets checked"
          title={<>Know the numbers<br /><span className="italic">before you harvest.</span></>}
          sub="A lot doesn't get judged on how it looks. At a mandi, a processor's gate or an exporter's warehouse, it is measured against limits that are published in the open — and most farmers never see them. Pick a crop to read them."
        />

        <div className="hiw-panel qc-panel">
          <label className="qc-picker">
            <span className="cb-mono qc-picker-l">Choose a crop</span>
            <select
              className="qc-select"
              value={cropId}
              onChange={(e) => setCropId(e.target.value)}
            >
              {QUALITY_STANDARDS.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji}  {s.label}</option>
              ))}
            </select>
          </label>

          <div className="qc-card">
            <div className="qc-card-head">
              <span className="qc-card-e" aria-hidden="true">{std.emoji}</span>
              <div>
                <h3>{std.label}</h3>
                <span className="cb-mono qc-src">{std.source}</span>
              </div>
              <span className="cb-chip cb-chip-sage qc-count">{std.checks.length} checks</span>
            </div>

            <ul className="qc-list">
              {std.checks.map((c) => (
                <li key={c.test} className="qc-row">
                  <div className="qc-row-top">
                    <span className="qc-test">{c.test}</span>
                    <span className="cb-mono qc-limit">{c.limit}</span>
                  </div>
                  <p className="qc-why">{c.why}</p>
                </li>
              ))}
            </ul>

            {std.note && (
              <p className="qc-note"><strong>Worth knowing —</strong> {std.note}</p>
            )}
          </div>

          <p className="qc-grade-note">
            <strong>About the grade on a listing.</strong> The A/B/C grade you see on CropBid is the
            farmer's own declaration — we don't test lots, and the grade is not calculated from the
            limits above. Treat it as the seller's claim, and use what sits alongside it: photos of
            the actual lot, a lab report where the farmer has one, and a minimum grade you can set
            on a requirement so nobody wastes a trip.
          </p>

          <p className="cb-tiny qc-foot">
            Every limit is a published standard, none of them ours: FCI and Dept. of Food &amp;
            Public Distribution uniform specifications for foodgrains, the Price Support Scheme FAQ
            specification for oilseeds, FSSAI food product standards, AGMARK grades, and
            ISO&nbsp;2451 for cocoa. Foodgrains are analysed by the BIS methods in IS&nbsp;4333
            (Part&nbsp;I and Part&nbsp;II), cocoa by the cut test in IS&nbsp;8832. Cocoa's cadmium
            figure is the EU limit, because that is the one that governs the export.
          </p>
        </div>
      </div>
    </section>
  );
}

function LiveRates() {
  return (
    <section id="rates" className="hiw-sec alt">
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
    <section id="forecast" className="hiw-sec">
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
    <section id="features" className="hiw-sec alt">
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
    <section id="consumers" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Not a trader?"
          title={<>Buy for your kitchen,<br /><span className="italic">straight from the source.</span></>}
          sub="Anyone can buy here — one sack or a week's vegetables, at the seller's own listed price. No bidding, no minimums, no middlemen. Your phone number and a 6-digit code is the whole sign-up; you only need it when you check out."
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

function Partner() {
  return (
    <section id="partner" className="hiw-sec alt">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Selling on CropBid"
          title={<>Not a marketplace <span className="italic">anyone can walk into.</span></>}
          sub="Farmers, local shops and wholesalers sell here — but only after we've checked them. That gate is the product: it is why a buyer can trust a name they have never bought from before."
        />
        <div className="hiw-grid three">
          {PARTNER_STEPS.map(([n, title, desc]) => (
            <div key={n} className="hiw-card">
              <span className="cb-mono hiw-step-n">STEP {n}</span>
              <h3 style={{ marginTop: 8 }}>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
        <div className="hiw-cta-row">
          <Link to="/partner" className="cb-btn cb-btn-primary">
            Become a partner
            <ArrowIcon />
          </Link>
          <Link to="/partner#buy" className="cb-btn cb-btn-ghost">
            Buying for a business?
          </Link>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="hiw-sec alt">
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
            <Link to="/partner" className="cb-btn cta-primary">
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
      <Partner />
      <Quality />
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
