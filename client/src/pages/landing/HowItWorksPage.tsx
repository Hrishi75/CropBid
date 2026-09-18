// =============================================================================
// How It Works — the simple version
// =============================================================================
// One story, told in order, in plain language: what CropBid is (hero), the
// four steps of a deal (#how), who sells here (#partner), the household shelf
// (#consumers), quality standards (#quality), the live price anchor (#rates),
// the 7-day forecast (#forecast), everything else in the box (#features),
// pricing (#pricing), mission, CTA.
//
// Two rules for this page:
//   1. Every claim describes something that ships TODAY.
//   2. Every section uses the same centered shell (.hiw-sec > .hiw-inner >
//      .hiw-head) so the whole page lines up on one axis.
// The rates board and the forecast preview are LIVE — real API output, not
// screenshots.
//
// RULE 1 IS NOT DECORATION, and this page had drifted a long way off it before
// the 2026-09-14 pass. What was on screen and untrue:
//
//   - "the agent watches lots and bids for you". agent.service.ts exports three
//     functions: read config, write config, toggle. There is no scheduler in
//     the server and nothing anywhere places a bid on your behalf. What does
//     exist is two-sided: when BOTH parties have an active agent, either can
//     hand one bid over and the pair negotiate it out (negotiation.service).
//   - "Book a transport partner in-app". Booking became ADMIN-only in #133.
//     A farmer cannot book, and the seller pays the freight, which this page
//     did not mention at all.
//   - "no minimums" for households, next to a server that refuses anything
//     under MIN_RETAIL_ORDER.
//   - "16 crops rated & forecast every day". The board carries 30.
//   - "verifies every lot ourselves" in the mission quote, on the same page as
//     a Quality section explaining that we do not test lots.
//   - "No passwords, ever", when password sign-in is a real second lane.
//
// Every one of those was a sentence somebody wrote when it was true. The way
// they go stale is that the product moves and the page does not, so when you
// change something, grep this file for it.
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
  ['Households',   '#consumers'],
  ['Quality',      '#quality'],
  ['Live rates',   '#rates'],
  ['Forecast',     '#forecast'],
  ['Pricing',      '#pricing'],
] as const;

// The whole product in four steps. Step one is the approval gate — it comes
// first because it is what makes the rest of it trustworthy, and because it is
// genuinely the first thing that happens to anyone selling here.
const STEPS: Array<[emoji: string, title: string, desc: string]> = [
  ['✅', 'Sellers apply, we review', 'Farms, local shops and wholesalers each answer a different form and hand over the licence their trade needs. A person reads every application before anyone can sell.'],
  ['🌾', 'Approved sellers list stock', 'Crop, quantity, quality and their own asking price — from a phone, without travelling to the mandi.'],
  ['🧺', 'Buyers bid, or just buy', 'Businesses bid in open rounds where every offer is visible, or post what they need and let farmers fill it. Households buy off a shop\'s shelf at the listed price.'],
  ['🛡️', 'We move it, escrow settles', 'The buyer pays up front and the money sits on the platform. We book the carrier rather than leaving it to the seller, so the delivery is ours to answer for, and the seller is paid out once the buyer confirms it arrived.'],
];

// Everything else that ships today. Rates, the forecast, the household shelf
// and the partner gate have their own sections, so they are not repeated here.
//
// CHECK THE CODE BEFORE ADDING A CARD. Three of the eight that used to sit
// here described things the server does not do; see the note at the top.
const FEATURES: Array<[emoji: string, title: string, desc: string]> = [
  ['🔨', 'Live auctions', 'Open bidding rounds on bulk lots — every offer visible, updated in real time.'],
  ['🤝', 'Counter-offers', 'Not happy with a bid? Counter it. The whole conversation stays on the record.'],
  ['📋', 'Demand board', 'Buyers post what they need and at what price. Farmers fill it outright or come back with an offer.'],
  ['🤖', 'Agents that haggle for you', 'Set your floor, your ceiling and how hard to push. When both sides have an agent switched on, either can hand a bid over and let the two of them settle it, every round written down.'],
  ['🚚', 'We book the truck, not you', 'One less thing for a farmer to arrange, and a delivery the platform answers for instead of a number the seller gave you. The seller pays the freight, and both sides follow the deal: paid → shipped → delivered.'],
  ['🏛️', 'Govt schemes hub', 'PM-KISAN to KCC — 12 schemes explained in English and Hindi, with how to apply.'],
  ['🪪', 'No anonymous sellers', 'Every seller is a reviewed partner with a name, a place, and the licence their trade needs: FSSAI for a food shop, GSTIN for a wholesale firm.'],
  ['📱', 'Sign up in a minute', 'Your name, an email or phone number, and a password. English, Hindi or Marathi, on the site or the app.'],
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
  ['01', 'Say what you are', 'A farm, a local shop or a wholesale firm. You pick first, and the form you get asks for that trade and nothing else: acreage and crops for a farm, FSSAI and an address for a shop, GSTIN for a firm.'],
  ['02', 'We review', 'A real person checks it, usually within 24–48 hours. If something is missing we ask for it — you don\'t start over.'],
  ['03', 'Go live', 'Approved partners get the full dashboard: listings, orders, bids, deliveries, analytics. You can trade the same day.'],
];

// The three seller kinds, so an applicant knows which door they are walking
// through before they start typing. Matches SellerType on the server.
const SELLER_KINDS: Array<[emoji: string, title: string, desc: string]> = [
  ['🚜', 'Farms', 'Sell your own harvest by the quintal or tonne to businesses nationwide, and by the kilo to households in your city.'],
  ['🏪', 'Local shops', 'A kirana, a dairy counter or a fruit stall. Your own shopfront on CropBid, with your name on it and today\'s delivery.'],
  ['📦', 'Wholesalers', 'Move volume through the auctions and the demand board, with your firm and GSTIN on the record.'],
];

const PRICING: Array<[big: string, label: string, desc: string]> = [
  ['Free', 'to join, list and browse', 'Applying, listing a crop, browsing the market, rates and the forecast all cost nothing. There is no signup fee.'],
  ['2%', 'only when a deal settles', 'One flat fee on completed deals. No subscriptions.'],
  ['100%', 'of the money in escrow', 'Held on-platform from payment until confirmed delivery. Nobody can run with it.'],
];

// =============================================================================
// Shared bits
// =============================================================================

function Nav({ country, onChangeCountry }: { country: Country; onChangeCountry: (c: Country) => void }) {
  return (
    <header className="nav hiw-nav">
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
        CropBid is a marketplace for food. Farms, local shops and wholesalers apply
        to sell here and are reviewed before they can trade. They list at their own
        price, anchored to the day's government mandi rate. Businesses bid or order
        in bulk, households buy by the kilo from a shop they can name, and the money
        waits in escrow until it's delivered. That's the whole idea.
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
          ['30', 'crops rated and forecast every day'],
          ['2%', 'flat fee, only on a settled deal'],
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

// The household shelf. This section did not exist in any real form before
// 2026-09-14: it was four lines saying "anyone can buy here, no minimums",
// which was both thin and wrong. Retail is now a shop-first shelf with a floor
// on the order and a city it has to be in, and every one of those is a thing a
// shopper finds out at checkout if the page does not say it first.
//
// SHOP-FIRST IS THE ARGUMENT, not an implementation detail, so it leads. The
// same tomato is ₹24 at one Pune shop and ₹28 at another and we do not average
// that away, because averaging it away is what Blinkit does and the whole point
// here is the name over the door.
function BuyDirect() {
  return (
    <section id="consumers" className="hiw-sec alt">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="For your kitchen"
          title={<>You are buying from a shop,<br /><span className="italic">not from an algorithm.</span></>}
          sub="Pick your city, pick a shop, buy what is on its shelf. We do not merge every seller's tomatoes into one anonymous card, because the shop you have bought from for years is the thing worth keeping."
        />

        <div className="hiw-panel">
          <div className="hiw-grid two">
            <div className="hiw-card">
              <span className="hiw-card-e" aria-hidden="true">🏪</span>
              <h3>Local shops, today</h3>
              <p>
                Kiranas, dairies and fruit stalls near you, each with their own shopfront
                and their own prices. Order in the day and it comes the same day.
              </p>
            </div>
            <div className="hiw-card">
              <span className="hiw-card-e" aria-hidden="true">🌾</span>
              {/* The app really does run a live countdown to the nightly
                  cutoff (mobile lib/freshWindow, components/FreshBanner). It is
                  still the wrong thing to describe here: a visitor reading this
                  is on the website, where no such clock exists, and nothing in
                  the server refuses a late order anyway. Name the promise, not
                  a widget on a surface they are not looking at. */}
              <h3>Fresh from the farm, tomorrow</h3>
              <p>
                Produce bought at tomorrow's mandi run and delivered that morning. It is a
                batch rather than a speed: there is one run a day, and what you order joins
                the next one.
              </p>
            </div>
          </div>

          <p className="hiw-note">
            <strong>The small print, up front.</strong> Household delivery runs in
            <strong> Pune and Nagpur</strong> today, and you can only buy from sellers in
            your own city, because a few kilos of vegetables cannot be freighted across the
            country. Produce is priced by the kilo and sold from 500 g up. Each item in
            your basket is ordered separately from its seller, and
            <strong> every one of those orders starts at ₹150</strong>: below that the trip
            costs more than the order is worth. Signing up takes a name, an email or phone
            number and a password, and you only need it at checkout.
          </p>
        </div>

        <div className="hiw-cta-row">
          <Link to="/" className="cb-btn cb-btn-primary">
            Browse shops near you
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Partner() {
  return (
    <section id="partner" className="hiw-sec">
      <div className="hiw-inner">
        <SectionHead
          eyebrow="Selling on CropBid"
          title={<>Not a marketplace <span className="italic">anyone can walk into.</span></>}
          sub="Farms, local shops and wholesalers sell here — but only after we've checked them. That gate is the product: it is why a buyer can trust a name they have never bought from before."
        />

        <div className="hiw-grid three" style={{ marginBottom: 14 }}>
          {SELLER_KINDS.map(([emoji, title, desc]) => (
            <div key={title} className="hiw-card">
              <span className="hiw-card-e" aria-hidden="true">{emoji}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>

        <div className="hiw-grid three">
          {PARTNER_STEPS.map(([n, title, desc]) => (
            <div key={n} className="hiw-card">
              <span className="cb-mono hiw-step-n">STEP {n}</span>
              <h3 style={{ marginTop: 8 }}>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>

        {/* Freight is billed to the seller, and an applicant should read that
            here rather than discover it on their first settlement. It is on
            TransactionDetail and the Deliveries lede in the app, both of which
            are behind the approval they have not got yet.

            DO NOT say the goods are inspected in transit. Owning the booking is
            what would MAKE an inspection possible and that is the argument in
            CLAUDE.md §2a, but ShipmentStatus runs PENDING_PICKUP → PICKED_UP →
            IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED with no inspection step,
            no result field, and nobody doing it. */}
        <p className="hiw-note" style={{ maxWidth: 780, margin: '18px auto 0' }}>
          <strong>Two things to know before you apply.</strong> You keep your own
          prices: we never set them, and every listing shows the day's government
          mandi rate beside yours so the buyer is arguing with the market and not
          with you. And we book the transport rather than you, which means
          <strong> the freight is billed to the seller</strong> and shows as its own
          line on the settlement.
        </p>

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

        {/* "No hidden charges" used to sit in the 2% card. It cannot, now that
            freight is billed to the seller: a charge is not hidden only if it
            is written down somewhere the payer reads. */}
        {/* PER ORDER, and a retail basket becomes one order per lot, so this
            is per lot too. Not per seller and not per basket: two ₹100 lots
            from the same seller are two ₹100 orders and both are refused. See
            the note above MIN_RETAIL_ORDER in bid.service. */}
        <p className="hiw-note" style={{ maxWidth: 780, margin: '18px auto 0' }}>
          <strong>What is not in the 2%.</strong> Transport is charged separately and
          on top, at what the carrier quotes, and it is billed to the seller. Household
          orders have a ₹150 floor, applied to each item ordered rather than to the
          basket. Those two are the only other numbers there are.
        </p>
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
          {/* DO NOT put "we verify every lot" back in here. We do not test
              lots, the Quality section on this same page says so in as many
              words, and the two of them contradicting each other is worse than
              either one alone. What we actually check is the seller, at the
              gate, and the goods in transit once we are the ones booking the
              truck. */}
          <p className="testimonial-quote">
            “Every harvest, growers lose margin to prices they never get to see.
            CropBid checks every seller at the door, runs the bidding in the open against
            the day's government rate, and moves the goods itself — so a farmer gets a
            fair price without ever leaving the field, and a household knows whose shop
            it came from.”
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
            <h2 className="cb-h1">Stop guessing prices.<br />Start trading in the open.</h2>
            <p className="cb-body cta-lede">
              List your first lot, place your first bid, or fill your kitchen from a shop
              down the road. Live mandi rates, open bidding, escrow settlement — bring your
              crop, we'll bring the market.
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
      {/* The two audiences back to back: who may sell, then what a household
          actually gets. Reference material (quality, rates, forecast) follows,
          because it is what you read second. */}
      <Partner />
      <BuyDirect />
      <Quality />
      <LiveRates />
      <Forecast />
      <Features />
      <Pricing />
      <Mission />
      <CTA />
      <CBFooter />
    </div>
  );
}
