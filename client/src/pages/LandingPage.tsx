// =============================================================================
// Landing Page — grocery-style storefront (public homepage)
// =============================================================================
// Blinkit-pattern homepage: the store IS the page. Sticky search header with a
// rotating placeholder, category chips, promo banner, category tiles, and
// horizontally scrolling product rails of live lots. Everything else (how it
// works, buyer agents, pricing) lives on /how-it-works, linked from the header
// and footer.
//
// Product catalogue is STATIC demo data; the price layer is LIVE — the top
// ticker, hero floating chips, and the mandi rates board all pull today's
// real wholesale prices from /api/rates/board (Govt Agmarknet feed) and fall
// back to static reference numbers if the API is unreachable. Prices are
// ₹-native and converted to the viewer's currency via the shared FX table.
// Product photos load from /products/<slug>.jpg with an emoji-tile fallback.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import {
  type Country, type CurrencyCode, type UnitCode,
  UNIT_LABEL, formatUnitPrice,
  loadCountry, saveCountry, CountrySelector,
  ArcMark, ArrowIcon, ChevronIcon, SearchIcon, CBFooter,
} from './landing/shared';

// =============================================================================
// Catalog — static demo lots
// =============================================================================

type RailId = 'veg' | 'fruits' | 'grains' | 'spices';

interface Produce {
  slug: string;          // image filename: /products/<slug>.jpg
  name: string;
  variety: string;
  emoji: string;         // fallback tile until the photo is uploaded
  cat: RailId;
  unit: UnitCode;
  priceMin: number;      // ₹ per unit — farmer's floor (what you pay today)
  priceMax: number;      // ₹ per unit — wholesale ceiling (anchor price)
  qty: number;           // available, in `unit`
  location: string;
  state: string;
  bids: number;
  grade: 'A' | 'B';
  organic?: boolean;
}

const PRODUCTS: Produce[] = [
  // Fresh vegetables — ₹/kg
  { slug: 'tomato',       name: 'Tomato',        variety: 'Hybrid',             emoji: '🍅', cat: 'veg', unit: 'KG', priceMin: 26,  priceMax: 34,  qty: 1200, location: 'Nashik',    state: 'Maharashtra',      bids: 4, grade: 'A' },
  { slug: 'onion',        name: 'Onion',         variety: 'Nashik Red',         emoji: '🧅', cat: 'veg', unit: 'KG', priceMin: 18,  priceMax: 24,  qty: 2500, location: 'Lasalgaon', state: 'Maharashtra',      bids: 6, grade: 'A' },
  { slug: 'potato',       name: 'Potato',        variety: 'Kufri Jyoti',        emoji: '🥔', cat: 'veg', unit: 'KG', priceMin: 14,  priceMax: 19,  qty: 3000, location: 'Agra',      state: 'Uttar Pradesh',    bids: 3, grade: 'B' },
  { slug: 'okra',         name: 'Okra (Bhindi)', variety: 'Arka Anamika',       emoji: '🌿', cat: 'veg', unit: 'KG', priceMin: 28,  priceMax: 38,  qty: 450,  location: 'Vadodara',  state: 'Gujarat',          bids: 2, grade: 'A' },
  { slug: 'cauliflower',  name: 'Cauliflower',   variety: 'Snowball',           emoji: '🥦', cat: 'veg', unit: 'KG', priceMin: 22,  priceMax: 30,  qty: 800,  location: 'Pune',      state: 'Maharashtra',      bids: 3, grade: 'A' },
  { slug: 'brinjal',      name: 'Brinjal',       variety: 'Bharta',             emoji: '🍆', cat: 'veg', unit: 'KG', priceMin: 18,  priceMax: 26,  qty: 600,  location: 'Kolar',     state: 'Karnataka',        bids: 2, grade: 'B' },
  { slug: 'green-chilli', name: 'Green Chilli',  variety: 'G4',                 emoji: '🌶️', cat: 'veg', unit: 'KG', priceMin: 45,  priceMax: 60,  qty: 350,  location: 'Guntur',    state: 'Andhra Pradesh',   bids: 5, grade: 'A' },
  { slug: 'spinach',      name: 'Spinach',       variety: 'All Green',          emoji: '🥬', cat: 'veg', unit: 'KG', priceMin: 15,  priceMax: 22,  qty: 300,  location: 'Indore',    state: 'Madhya Pradesh',   bids: 1, grade: 'A', organic: true },

  // Seasonal fruits — ₹/kg
  { slug: 'mango',        name: 'Mango',         variety: 'Kesar',              emoji: '🥭', cat: 'fruits', unit: 'KG', priceMin: 90,  priceMax: 140, qty: 900,  location: 'Junagadh',  state: 'Gujarat',          bids: 8, grade: 'A' },
  { slug: 'banana',       name: 'Banana',        variety: 'G9 Cavendish',       emoji: '🍌', cat: 'fruits', unit: 'KG', priceMin: 28,  priceMax: 38,  qty: 2000, location: 'Jalgaon',   state: 'Maharashtra',      bids: 4, grade: 'A' },
  { slug: 'pomegranate',  name: 'Pomegranate',   variety: 'Bhagwa',             emoji: '🍒', cat: 'fruits', unit: 'KG', priceMin: 110, priceMax: 160, qty: 700,  location: 'Solapur',   state: 'Maharashtra',      bids: 5, grade: 'A' },
  { slug: 'grapes',       name: 'Grapes',        variety: 'Thompson Seedless',  emoji: '🍇', cat: 'fruits', unit: 'KG', priceMin: 70,  priceMax: 95,  qty: 1100, location: 'Nashik',    state: 'Maharashtra',      bids: 3, grade: 'A' },
  { slug: 'guava',        name: 'Guava',         variety: 'Allahabad Safeda',   emoji: '🍐', cat: 'fruits', unit: 'KG', priceMin: 40,  priceMax: 60,  qty: 500,  location: 'Prayagraj', state: 'Uttar Pradesh',    bids: 2, grade: 'A' },
  { slug: 'papaya',       name: 'Papaya',        variety: 'Red Lady',           emoji: '🍈', cat: 'fruits', unit: 'KG', priceMin: 25,  priceMax: 35,  qty: 850,  location: 'Coimbatore', state: 'Tamil Nadu',      bids: 2, grade: 'B' },
  { slug: 'apple',        name: 'Apple',         variety: 'Royal Delicious',    emoji: '🍎', cat: 'fruits', unit: 'KG', priceMin: 120, priceMax: 170, qty: 1500, location: 'Shimla',    state: 'Himachal Pradesh', bids: 6, grade: 'A' },
  { slug: 'watermelon',   name: 'Watermelon',    variety: 'Sugar Baby',         emoji: '🍉', cat: 'fruits', unit: 'KG', priceMin: 12,  priceMax: 18,  qty: 4000, location: 'Kurnool',   state: 'Andhra Pradesh',   bids: 3, grade: 'B' },

  // Grains & pulses — ₹/quintal
  { slug: 'wheat',        name: 'Wheat',         variety: 'Sharbati',           emoji: '🌾', cat: 'grains', unit: 'QUINTAL', priceMin: 2480,  priceMax: 2760,  qty: 320, location: 'Sehore',     state: 'Madhya Pradesh', bids: 3, grade: 'A' },
  { slug: 'basmati-rice', name: 'Basmati Paddy', variety: 'Pusa 1509',          emoji: '🍚', cat: 'grains', unit: 'QUINTAL', priceMin: 3600,  priceMax: 4200,  qty: 210, location: 'Karnal',     state: 'Haryana',        bids: 5, grade: 'A' },
  { slug: 'maize',        name: 'Maize',         variety: 'Yellow Dent',        emoji: '🌽', cat: 'grains', unit: 'QUINTAL', priceMin: 2100,  priceMax: 2350,  qty: 400, location: 'Davangere',  state: 'Karnataka',      bids: 2, grade: 'B' },
  { slug: 'bajra',        name: 'Bajra',         variety: 'HHB-67',             emoji: '🌾', cat: 'grains', unit: 'QUINTAL', priceMin: 2350,  priceMax: 2600,  qty: 180, location: 'Jodhpur',    state: 'Rajasthan',      bids: 1, grade: 'A' },
  { slug: 'chana',        name: 'Chana',         variety: 'Desi Gram',          emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 5720,  priceMax: 6180,  qty: 180, location: 'Kota',       state: 'Rajasthan',      bids: 4, grade: 'A', organic: true },
  { slug: 'tur-dal',      name: 'Tur (Arhar)',   variety: 'Maruti',             emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 7400,  priceMax: 7900,  qty: 150, location: 'Kalaburagi', state: 'Karnataka',      bids: 3, grade: 'A' },
  { slug: 'moong',        name: 'Moong',         variety: 'SML-668',            emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 8200,  priceMax: 8700,  qty: 120, location: 'Merta',      state: 'Rajasthan',      bids: 2, grade: 'A' },
  { slug: 'masoor',       name: 'Masoor',        variety: 'KLS-218',            emoji: '🫘', cat: 'grains', unit: 'QUINTAL', priceMin: 6400,  priceMax: 6800,  qty: 140, location: 'Sagar',      state: 'Madhya Pradesh', bids: 1, grade: 'B' },

  // Spices & oilseeds — ₹/quintal
  { slug: 'turmeric',       name: 'Turmeric',       variety: 'Salem',        emoji: '🫚', cat: 'spices', unit: 'QUINTAL', priceMin: 13800, priceMax: 15200, qty: 90,  location: 'Erode',     state: 'Tamil Nadu',     bids: 6, grade: 'A' },
  { slug: 'red-chilli',     name: 'Red Chilli',     variety: 'Teja S17',     emoji: '🌶️', cat: 'spices', unit: 'QUINTAL', priceMin: 15500, priceMax: 17800, qty: 110, location: 'Guntur',    state: 'Andhra Pradesh', bids: 7, grade: 'A' },
  { slug: 'cumin',          name: 'Cumin (Jeera)',  variety: 'GC-4',         emoji: '🌱', cat: 'spices', unit: 'QUINTAL', priceMin: 24500, priceMax: 27000, qty: 60,  location: 'Unjha',     state: 'Gujarat',        bids: 4, grade: 'A' },
  { slug: 'coriander-seed', name: 'Coriander Seed', variety: 'Eagle',        emoji: '🌿', cat: 'spices', unit: 'QUINTAL', priceMin: 6800,  priceMax: 7600,  qty: 130, location: 'Kota',      state: 'Rajasthan',      bids: 2, grade: 'A' },
  { slug: 'soybean',        name: 'Soybean',        variety: 'JS-335',       emoji: '🫘', cat: 'spices', unit: 'QUINTAL', priceMin: 5420,  priceMax: 5880,  qty: 260, location: 'Latur',     state: 'Maharashtra',    bids: 2, grade: 'A' },
  { slug: 'mustard',        name: 'Mustard',        variety: 'Pusa Bold',    emoji: '🌼', cat: 'spices', unit: 'QUINTAL', priceMin: 5650,  priceMax: 6050,  qty: 220, location: 'Bharatpur', state: 'Rajasthan',      bids: 3, grade: 'A' },
  { slug: 'groundnut',      name: 'Groundnut',      variety: 'Bold 40/50',   emoji: '🥜', cat: 'spices', unit: 'QUINTAL', priceMin: 6400,  priceMax: 6900,  qty: 190, location: 'Rajkot',    state: 'Gujarat',        bids: 4, grade: 'A' },
  { slug: 'cotton',         name: 'Cotton',         variety: 'Shankar-6',    emoji: '☁️', cat: 'spices', unit: 'QUINTAL', priceMin: 7800,  priceMax: 8350,  qty: 140, location: 'Rajkot',    state: 'Gujarat',        bids: 4, grade: 'A' },
];

const RAILS: Array<{ id: RailId; eyebrow: string; title: string }> = [
  { id: 'veg',    eyebrow: 'Farm-fresh · picked this week', title: 'Fresh Vegetables' },
  { id: 'fruits', eyebrow: 'In season now',                 title: 'Seasonal Fruits' },
  { id: 'grains', eyebrow: 'MSP-anchored floors',           title: 'Grains & Pulses' },
  { id: 'spices', eyebrow: 'Straight from origin mandis',   title: 'Spices & Oilseeds' },
];

// Extra search terms per rail so "dal" or "masala" find things.
const CAT_KEYWORDS: Record<RailId, string> = {
  veg: 'vegetable sabzi fresh',
  fruits: 'fruit fresh',
  grains: 'grain cereal pulse dal rice paddy',
  spices: 'spice masala oilseed fibre',
};

const CATEGORY_TILES: Array<{ label: string; target: RailId; img: string; emoji: string }> = [
  { label: 'Fresh Vegetables', target: 'veg',    img: 'tomato',       emoji: '🍅' },
  { label: 'Seasonal Fruits',  target: 'fruits', img: 'mango',        emoji: '🥭' },
  { label: 'Grains & Cereals', target: 'grains', img: 'wheat',        emoji: '🌾' },
  { label: 'Pulses & Dal',     target: 'grains', img: 'chana',        emoji: '🫘' },
  { label: 'Rice & Paddy',     target: 'grains', img: 'basmati-rice', emoji: '🍚' },
  { label: 'Spices',           target: 'spices', img: 'turmeric',     emoji: '🫚' },
  { label: 'Oilseeds',         target: 'spices', img: 'mustard',      emoji: '🌼' },
  { label: 'Cotton & Fibre',   target: 'spices', img: 'cotton',       emoji: '☁️' },
];

const CHIPS: Array<[label: string, target: RailId | 'top']> = [
  ['All', 'top'],
  ['Vegetables', 'veg'],
  ['Fruits', 'fruits'],
  ['Grains & Pulses', 'grains'],
  ['Spices & Oilseeds', 'spices'],
];

const SEARCH_WORDS = ['tomatoes', 'kesar mangoes', 'sharbati wheat', 'turmeric', 'basmati paddy', 'onions', 'chana dal', 'fresh okra'];

// Top ticker — crop, ₹ floor price, day-over-day move.
const TICKER: Array<{ p: Produce; delta: number }> = [
  { p: PRODUCTS.find((x) => x.slug === 'wheat')!,        delta: 0.9 },
  { p: PRODUCTS.find((x) => x.slug === 'onion')!,        delta: -1.2 },
  { p: PRODUCTS.find((x) => x.slug === 'mango')!,        delta: 2.1 },
  { p: PRODUCTS.find((x) => x.slug === 'chana')!,        delta: 0.7 },
  { p: PRODUCTS.find((x) => x.slug === 'turmeric')!,     delta: 1.4 },
  { p: PRODUCTS.find((x) => x.slug === 'cotton')!,       delta: -0.5 },
  { p: PRODUCTS.find((x) => x.slug === 'soybean')!,      delta: 1.3 },
  { p: PRODUCTS.find((x) => x.slug === 'tomato')!,       delta: 0.8 },
  { p: PRODUCTS.find((x) => x.slug === 'basmati-rice')!, delta: 0.6 },
  { p: PRODUCTS.find((x) => x.slug === 'cumin')!,        delta: -0.9 },
];

// =============================================================================
// Live mandi rates — /api/rates/board (Govt Agmarknet, daily)
// =============================================================================

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: UnitCode;
  cat: RailId;
  modal: number;       // ₹ per unit — today's clearing price
  min: number;
  max: number;
  usual: number;       // the crop's usual reference price
  changePct: number;   // today vs usual, % — the price signal
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface RatesBoardData { date: string; live: boolean; rates: LiveRate[]; }

function useLiveRates(): RatesBoardData | null {
  const [board, setBoard] = useState<RatesBoardData | null>(null);
  useEffect(() => {
    let on = true;
    api.get('/rates/board')
      .then(({ data }) => { if (on && data?.rates?.length) setBoard(data); })
      .catch(() => { /* ticker & board fall back to static reference prices */ });
    return () => { on = false; };
  }, []);
  return board;
}

function Delta({ pct, flatLabel }: { pct: number; flatLabel?: string }) {
  if (Math.abs(pct) < 0.1) {
    return flatLabel ? <span className="d flat">{flatLabel}</span> : null;
  }
  return (
    <span className={`d ${pct >= 0 ? 'pos' : 'neg'}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function formatQty(p: Produce): string {
  if (p.unit === 'KG' && p.qty >= 1000) return `${(p.qty / 1000).toFixed(1)} tonnes`;
  return `${p.qty.toLocaleString('en-IN')} ${UNIT_LABEL[p.unit]}`;
}

function pctOff(p: Produce): number {
  return Math.round((1 - p.priceMin / p.priceMax) * 100);
}

// =============================================================================
// Hooks
// =============================================================================

// Fade-up sections as they enter the viewport (reduced-motion users see them
// static — the CSS transition is disabled there, not the class).
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// =============================================================================
// Images — /products/<slug>.jpg with emoji fallback until photos are uploaded
// =============================================================================

function ProduceImg({ slug, emoji, alt }: { slug: string; emoji: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="st-img-fb" role="img" aria-label={alt}>
        <span>{emoji}</span>
      </div>
    );
  }
  return <img src={`/products/${slug}.jpg`} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function BannerImg() {
  const [src, setSrc] = useState('/products/banner-hero.jpg');
  return (
    <img
      src={src}
      alt="Fresh produce arriving from CropBid farms"
      onError={() => { if (src !== '/mandi.jpg') setSrc('/mandi.jpg'); }}
    />
  );
}

// =============================================================================
// Header — ticker, sticky search bar, category chips
// =============================================================================

function Ticker({ currency, board }: { currency: CurrencyCode; board: RatesBoardData | null }) {
  // Live govt rates when the API answered; static reference prices otherwise.
  const ticks = board
    ? board.rates.map((r) => ({ key: r.commodity, name: r.label, price: r.modal, unit: r.unit, delta: r.changePct }))
    : TICKER.map(({ p, delta }) => ({ key: p.slug, name: p.name, price: p.priceMin, unit: p.unit, delta }));
  // Two copies of the list = seamless -50% marquee loop.
  const items = [...ticks, ...ticks];
  return (
    <div className="st-ticker" aria-hidden="true">
      <div className="st-ticker-track">
        {items.map((t, i) => (
          <span key={`${t.key}-${i}`} className="st-tick">
            <span className="n">{t.name}</span>
            <span className="v">{formatUnitPrice(t.price, 'INR', currency)}/{UNIT_LABEL[t.unit]}</span>
            <Delta pct={t.delta} />
          </span>
        ))}
      </div>
    </div>
  );
}

function StoreHeader({
  country, onChangeCountry, query, onQuery, onJump,
}: {
  country: Country;
  onChangeCountry: (c: Country) => void;
  query: string;
  onQuery: (q: string) => void;
  onJump: (target: RailId | 'top') => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [activeChip, setActiveChip] = useState<RailId | 'top'>('top');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Blinkit-style rotating search hint: Search "tomatoes" → "kesar mangoes" → …
  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % SEARCH_WORDS.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <header className={`st-header${scrolled ? ' scrolled' : ''}`}>
      <div className="st-header-row">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>

        <div className="st-source">
          <span className="cb-tiny st-source-l">Sourcing from</span>
          <CountrySelector country={country} onChange={onChangeCountry} />
        </div>

        <div className="st-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search crops, fruits and vegetables"
          />
          {query === '' && (
            <span className="st-search-ph">
              Search&nbsp;“<span key={wordIdx} className="st-roll-word">{SEARCH_WORDS[wordIdx]}</span>”
            </span>
          )}
        </div>

        <nav className="st-header-links" aria-label="Primary">
          <Link to="/how-it-works" className="st-header-link">How it works</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            Start selling
            <ArrowIcon />
          </Link>
        </nav>
      </div>

      <div className="st-chips" role="tablist" aria-label="Categories">
        {CHIPS.map(([label, target]) => (
          <button
            key={label}
            type="button"
            className={`st-chip${activeChip === target ? ' active' : ''}`}
            onClick={() => { setActiveChip(target); onJump(target); }}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}

// =============================================================================
// Store sections
// =============================================================================

const FLOAT_CHIP_PICKS = ['Tomato', 'Wheat', 'Mango'];

function HeroBanner({ onShop, board, currency }: { onShop: () => void; board: RatesBoardData | null; currency: CurrencyCode }) {
  // Floating live-price chips over the hero photo — today's real numbers.
  const chips = board
    ? FLOAT_CHIP_PICKS
        .map((label) => board.rates.find((r) => r.label === label))
        .filter((r): r is LiveRate => r !== undefined)
    : [];
  return (
    <section className="st-banner">
      <div className="st-banner-grid-bg" />
      <div className="st-banner-copy">
        <span className="cb-chip cb-chip-sage" style={{ marginBottom: 18 }}>
          <span className="cb-live-dot sm" />
          {board?.live ? `Live govt mandi rates · ${board.date}` : 'Live now · 42 lots from 100+ verified farms'}
        </span>
        <h1 className="st-banner-title">
          Farm-fresh crops,<br />
          <span className="italic">farmer-fair</span> prices.
        </h1>
        <p className="st-banner-lede">
          Buy vegetables, fruits, grains and spices straight from the grower —
          today's real mandi price on every lot, escrow-settled, delivered farm to door.
        </p>
        <div className="st-banner-actions">
          <button type="button" className="cb-btn st-btn-cream" onClick={onShop}>
            Shop the market
            <ArrowIcon />
          </button>
          <Link to="/signup" className="cb-btn st-btn-outline">Sell your harvest</Link>
        </div>
        <div className="st-banner-ticks">
          <span>✓ Live govt mandi rates</span>
          <span>✓ Every lot inspected</span>
          <span>✓ Escrow settlement</span>
          <span>✓ Farm-to-door logistics</span>
        </div>
      </div>
      <div className="st-banner-media">
        <BannerImg />
        {chips.map((r, i) => (
          <div key={r.commodity} className={`st-float-chip c${i}`}>
            <span className="e" aria-hidden="true">{r.emoji}</span>
            <span className="t">
              <span className="n">{r.label}</span>
              <span className="v">{formatUnitPrice(r.modal, 'INR', currency)}/{UNIT_LABEL[r.unit]}</span>
            </span>
            <Delta pct={r.changePct} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Today's rates, front and centre — the shared price anchor every deal on
// CropBid negotiates around. Live from the govt feed, honest about fallback.
function LiveRatesBoard({ board, currency }: { board: RatesBoardData | null; currency: CurrencyCode }) {
  const ref = useReveal<HTMLElement>();
  if (!board) return null;
  return (
    <section className="st-rates st-reveal" ref={ref}>
      <div className="st-rates-head">
        <div className="st-rates-title">
          {board.live && <span className="st-live-dot" />}
          <span className="cb-eyebrow">Today's mandi rates{board.live ? ' · live' : ''} · {board.date}</span>
        </div>
        <span className="cb-mono st-rates-src">GOVT. AGMARKNET · ₹ WHOLESALE · vs USUAL</span>
      </div>
      <div className="st-rates-track">
        {board.rates.map((r) => (
          <div key={r.commodity} className="st-rate" title={r.market ? `${r.market}${r.state ? ', ' + r.state : ''}` : r.state ?? 'National average'}>
            <div className="st-rate-top">
              <span className="st-rate-emoji" aria-hidden="true">{r.emoji}</span>
              <Delta pct={r.changePct} flatLabel="steady" />
            </div>
            <div className="st-rate-n">{r.label}</div>
            <div className="st-rate-v">
              {formatUnitPrice(r.modal, 'INR', currency)}
              <span className="u">/{UNIT_LABEL[r.unit]}</span>
            </div>
            <div className="cb-mono st-rate-band">
              {formatUnitPrice(r.min, 'INR', currency)}–{formatUnitPrice(r.max, 'INR', currency)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PROMOS: Array<{ tone: 'sage' | 'paper' | 'ember'; emoji: string; title: string; desc: string; ctaLabel: string; to: string }> = [
  { tone: 'sage',  emoji: '🔨', title: 'Live auctions',        desc: 'Verified buyers bid in open rounds — watch prices climb in real time.', ctaLabel: 'Start bidding',  to: '/signup' },
  { tone: 'paper', emoji: '🧺', title: 'Buy direct, no bidding', desc: 'Any quantity, at the farmer’s listed price. From one sack to a season’s supply.', ctaLabel: 'Shop direct', to: '/signup' },
  { tone: 'ember', emoji: '🚚', title: 'Verified & delivered',  desc: 'We inspect every lot, arrange transport, and release escrow on delivery.', ctaLabel: 'How it works', to: '/how-it-works' },
];

function PromoTrio() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div className="st-promos st-reveal" ref={ref}>
      {PROMOS.map((p) => (
        <Link key={p.title} to={p.to} className={`st-promo ${p.tone}`}>
          <span className="st-promo-emoji" aria-hidden="true">{p.emoji}</span>
          <span className="st-promo-t">{p.title}</span>
          <span className="st-promo-d">{p.desc}</span>
          <span className="st-promo-link">{p.ctaLabel} <ArrowIcon size={12} /></span>
        </Link>
      ))}
    </div>
  );
}

function CategoryGrid({ onJump }: { onJump: (target: RailId) => void }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section className="st-cats st-reveal" ref={ref}>
      <h2 className="st-rail-title">Shop by category</h2>
      <div className="st-cats-grid">
        {CATEGORY_TILES.map((c) => (
          <button key={c.label} type="button" className="st-cat" onClick={() => onJump(c.target)}>
            <span className="st-cat-img">
              <ProduceImg slug={c.img} emoji={c.emoji} alt={c.label} />
            </span>
            <span className="st-cat-l">{c.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProduceCard({ p, currency }: { p: Produce; currency: CurrencyCode }) {
  const off = pctOff(p);
  return (
    <div className="st-card">
      <Link to="/signup" className="st-card-img" aria-label={`${p.name} — ${p.variety}`}>
        <ProduceImg slug={p.slug} emoji={p.emoji} alt={`${p.name} (${p.variety})`} />
        {off >= 5 && <span className="st-off">{off}% OFF</span>}
        <span className="st-grade">{p.organic ? 'Organic' : `Grade ${p.grade}`}</span>
      </Link>
      <div className="st-card-body">
        <div className="st-bids"><span className="st-live-dot" />{p.bids} {p.bids === 1 ? 'bid' : 'bids'} · live</div>
        <div className="st-name">{p.name}</div>
        <div className="st-meta">{p.variety} · {p.location}, {p.state}</div>
        <div className="st-qty">{formatQty(p)} available</div>
        <div className="st-price-row">
          <div>
            <div className="st-price">
              {formatUnitPrice(p.priceMin, 'INR', currency)}
              <span className="st-unit">/{UNIT_LABEL[p.unit]}</span>
            </div>
            {off >= 5 && <div className="st-mrp">{formatUnitPrice(p.priceMax, 'INR', currency)}</div>}
          </div>
          <Link to="/signup" className="st-add">{p.unit === 'KG' ? 'BUY' : 'BID'}</Link>
        </div>
      </div>
    </div>
  );
}

function Rail({ rail, currency }: { rail: (typeof RAILS)[number]; currency: CurrencyCode }) {
  const revealRef = useReveal<HTMLElement>();
  const track = useRef<HTMLDivElement | null>(null);
  const items = PRODUCTS.filter((p) => p.cat === rail.id);

  const nudge = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section id={rail.id} className="st-rail st-reveal" ref={revealRef}>
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{rail.eyebrow}</span>
          <h2 className="st-rail-title">{rail.title}</h2>
        </div>
        <div className="st-rail-nav">
          <Link to="/signup" className="st-seeall">see all <ArrowIcon size={12} /></Link>
          <button type="button" className="st-rail-btn prev" aria-label={`Scroll ${rail.title} back`} onClick={() => nudge(-1)}>
            <ChevronIcon />
          </button>
          <button type="button" className="st-rail-btn next" aria-label={`Scroll ${rail.title} forward`} onClick={() => nudge(1)}>
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div className="st-rail-track" ref={track}>
        {items.map((p) => <ProduceCard key={p.slug} p={p} currency={currency} />)}
      </div>
    </section>
  );
}

function SearchResults({ query, currency }: { query: string; currency: CurrencyCode }) {
  const q = query.trim().toLowerCase();
  const matches = PRODUCTS.filter((p) =>
    [p.name, p.variety, p.location, p.state, CAT_KEYWORDS[p.cat]].join(' ').toLowerCase().includes(q),
  );

  return (
    <section className="st-results">
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{matches.length} {matches.length === 1 ? 'lot' : 'lots'} found</span>
          <h2 className="st-rail-title">Results for “{query.trim()}”</h2>
        </div>
      </div>
      {matches.length > 0 ? (
        <div className="st-results-grid">
          {matches.map((p) => <ProduceCard key={p.slug} p={p} currency={currency} />)}
        </div>
      ) : (
        <div className="st-empty">
          <span className="st-empty-emoji" aria-hidden="true">🌾</span>
          <p className="cb-body">No crops match “{query.trim()}” yet.</p>
          <p className="cb-small">Try “tomato”, “wheat”, “mango”, “dal” — or list it yourself and let buyers come to you.</p>
        </div>
      )}
    </section>
  );
}

const HOW_STEPS: Array<[n: string, title: string, desc: string]> = [
  ['01', 'Farmers list from the field', 'Crop, grade, quantity, floor price — in any language, without leaving the farm.'],
  ['02', 'You buy or bid', 'Pay the listed price for any quantity, or join a live auction for bulk lots.'],
  ['03', 'We verify & deliver', 'Every lot inspected, transport arranged, escrow released on delivery.'],
];

function HowStrip() {
  const ref = useReveal<HTMLElement>();
  return (
    <section className="st-how st-reveal" ref={ref}>
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">Simple by design</span>
          <h2 className="st-rail-title">How CropBid works</h2>
        </div>
        <Link to="/how-it-works" className="st-seeall">the full story <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-how-grid">
        {HOW_STEPS.map(([n, t, d]) => (
          <div key={n} className="st-how-step">
            <span className="cb-mono st-how-n">{n}</span>
            <span className="st-how-t">{t}</span>
            <span className="st-how-d">{d}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SellCTA() {
  const ref = useReveal<HTMLElement>();
  return (
    <section className="cta st-reveal" ref={ref}>
      <div className="cta-card">
        <div className="cta-grid-bg" />
        <div className="cta-inner">
          <div>
            <h2 className="cb-h1">Grow it? <span className="italic">Sell it here.</span></h2>
            <p className="cb-body cta-lede">
              List your harvest in two minutes and let verified buyers bid it up.
              No mandi trips, no guesswork — you keep the margin.
            </p>
          </div>
          <div className="cta-actions">
            <Link to="/signup" className="cb-btn cta-primary">
              Start selling free
              <ArrowIcon />
            </Link>
            <Link to="/how-it-works" className="cb-btn cta-ghost">
              See how it works
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

export function LandingPage() {
  const [country, setCountry] = useState<Country>(loadCountry);
  const [query, setQuery] = useState('');
  const currency = country.currency;
  const board = useLiveRates();

  const handleChangeCountry = (next: Country) => {
    setCountry(next);
    saveCountry(next);
  };

  // Chips & category tiles jump to a rail; clear any active search first so
  // the rails are actually on screen to scroll to.
  const jumpTo = (target: RailId | 'top') => {
    setQuery('');
    requestAnimationFrame(() => {
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const searching = query.trim() !== '';

  return (
    <div className="cb-landing st-store">
      <Ticker currency={currency} board={board} />
      <StoreHeader
        country={country}
        onChangeCountry={handleChangeCountry}
        query={query}
        onQuery={setQuery}
        onJump={jumpTo}
      />
      <main className="st-main">
        {searching ? (
          <SearchResults query={query} currency={currency} />
        ) : (
          <>
            <HeroBanner onShop={() => jumpTo('veg')} board={board} currency={currency} />
            <LiveRatesBoard board={board} currency={currency} />
            <PromoTrio />
            <CategoryGrid onJump={jumpTo} />
            {RAILS.map((rail) => <Rail key={rail.id} rail={rail} currency={currency} />)}
            <HowStrip />
            <SellCTA />
          </>
        )}
      </main>
      <CBFooter />
    </div>
  );
}
