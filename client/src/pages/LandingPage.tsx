// =============================================================================
// Landing Page — grocery-style storefront (public homepage)
// =============================================================================
// Blinkit-pattern homepage: the store IS the page. Sticky search header with a
// rotating placeholder, promo banner, and a shelf of produce. Everything else
// (how it works, buyer agents, pricing) lives on /how-it-works, linked from the
// header and footer.
//
// NOTHING ON THIS PAGE IS INVENTED. It used to be: five category rails held a
// hand-written catalogue of ~35 "lots", each with a village, a grade, a
// quantity and a live bid count. Nobody had listed any of them. Visitors read
// the cards as farmers' listings — they look exactly like listings — and the
// homepage was quietly claiming a marketplace that did not exist yet.
//
// So the catalogue is gone. The one product section is <LiveShelf>, which
// fetches /api/browse and shows only lots a farmer has actually opened for
// retail, filtered to the viewer's own city. No listings in that city means an
// empty shelf that says so. An empty shop is honest; a fake one is not.
//
// The price layer is LIVE — the top ticker, hero floating chips, and the mandi
// rates board pull today's real wholesale prices from /api/rates/board (Govt
// Agmarknet feed) and fall back to REFERENCE_TICKS below when the API is
// unreachable, always tagged "ref" so a fallback never passes as a live quote.
// Prices are ₹-native and converted to the viewer's currency via the shared FX
// table.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { LiveShelf } from './consumer/LiveShelf';
import type { User } from '../types';
import {
  type Country, type CurrencyCode, type UnitCode,
  UNIT_LABEL, formatUnitPrice,
  loadCountry, saveCountry, CountrySelector,
  ArcMark, ArrowIcon, SearchIcon, CBFooter, India2047Mark,
} from './landing/shared';

// =============================================================================
// Reference prices — the ONLY hardcoded numbers left on this page
// =============================================================================
// The page used to carry a hand-written catalogue of ~35 "lots", each with a
// village, a grade, a quantity and a live bid count, rendered in the same card
// as a real listing. Visitors reasonably concluded farmers had listed them.
// They had not. The catalogue is gone; the marketplace section is now LiveShelf,
// which shows only what a farmer has actually opened for sale.
//
// What survives is this: a short table of usual ₹ prices, used ONLY as the
// fallback for the price ticker and the three hero chips when the govt rates
// feed is unreachable. Nothing here is presented as stock — every fallback
// number renders tagged "ref", never as a lot you can buy.
// =============================================================================

// The rates feed tags each crop with a storefront category. Nothing renders it
// today, but it comes down the wire, so the shape stays honest.
type RailId = 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';

interface ReferenceTick {
  slug: string;
  name: string;
  emoji: string;
  unit: UnitCode;
  price: number; // ₹ per unit — the crop's usual level, not a live quote
}

const REFERENCE_TICKS: ReferenceTick[] = [
  { slug: 'wheat',        name: 'Wheat',         emoji: '🌾', unit: 'QUINTAL', price: 2480 },
  { slug: 'cow-milk',     name: 'Cow Milk',      emoji: '🥛', unit: 'LITRE',   price: 55 },
  { slug: 'onion',        name: 'Onion',         emoji: '🧅', unit: 'KG',      price: 18 },
  { slug: 'mango',        name: 'Mango',         emoji: '🥭', unit: 'KG',      price: 90 },
  { slug: 'chana',        name: 'Chana',         emoji: '🫘', unit: 'QUINTAL', price: 5720 },
  { slug: 'turmeric',     name: 'Turmeric',      emoji: '🫚', unit: 'QUINTAL', price: 13800 },
  { slug: 'cotton',       name: 'Cotton',        emoji: '☁️', unit: 'QUINTAL', price: 7800 },
  { slug: 'soybean',      name: 'Soybean',       emoji: '🫘', unit: 'QUINTAL', price: 5420 },
  { slug: 'tomato',       name: 'Tomato',        emoji: '🍅', unit: 'KG',      price: 26 },
  { slug: 'basmati-rice', name: 'Basmati Paddy', emoji: '🍚', unit: 'QUINTAL', price: 3600 },
  { slug: 'cumin',        name: 'Cumin (Jeera)', emoji: '🌱', unit: 'QUINTAL', price: 24500 },
];

// The header's section links. Rendered inline on desktop and inside the
// collapsed menu below 960px, from one list so the two never drift apart.
const SECTION_LINKS: Array<[label: string, to: string]> = [
  ['Live rates', '/rates'],
  ['Forecast', '/forecast'],
  ['Yojana', '/schemes'],
  ['Equipment', '/equipment'],
  ['How it works', '/how-it-works'],
];

const SEARCH_WORDS = ['tomatoes', 'fresh cow milk', 'kesar mangoes', 'sharbati wheat', 'turmeric', 'basmati paddy', 'onions', 'chana dal', 'fresh okra'];

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

// `pending` is what stops the board shoving the page around. The section holds
// its height with a skeleton while the request is in flight, so today's rates
// swap into a box that is already the right size instead of appearing from
// nothing and pushing every rail below it down the page.
//
// It starts true and STAYS true through the prerender — effects don't run in
// renderToString — so the static HTML reserves the space as well, and the
// reload doesn't jump the moment React takes over either.
function useLiveRates(): { board: RatesBoardData | null; pending: boolean } {
  const [board, setBoard] = useState<RatesBoardData | null>(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let on = true;
    api.get('/rates/board')
      .then(({ data }) => { if (on && data?.rates?.length) setBoard(data); })
      .catch(() => { /* ticker & board fall back to static reference prices */ })
      .finally(() => { if (on) setPending(false); });
    return () => { on = false; };
  }, []);
  return { board, pending };
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

// =============================================================================
// Hooks
// =============================================================================

// Fade-up sections as they enter the viewport.
//
// The hidden state is applied HERE, from JS, and only to sections that start
// below the fold. It deliberately is not a static class in the markup: this
// page is prerendered, so a `.st-reveal { opacity: 0 }` rule painted the whole
// storefront invisible below the hero until the bundle booted, and then faded
// in everything already on screen — a blank-then-fill flash on every reload.
//
// Anything on screen at mount keeps the pixels it painted with. Anything below
// the fold is hidden (invisibly, since it is off screen) and fades up when it
// is scrolled to, which is the only place the animation was ever meant to run.
// Reduced-motion users are opted out in CSS, so `is-out` is inert for them.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    // Hide without animating INTO the hidden state — the transition is only
    // ever meant to run on the way back in. Without suppressing it, scrolling
    // immediately after load could catch a section fading out under you.
    el.classList.add('no-anim', 'is-out');
    void el.offsetHeight; // flush the hidden state while the transition is off
    el.classList.remove('no-anim');

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.remove('is-out');
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
// Header — ticker and sticky search bar
// =============================================================================

function Ticker({ currency, board }: { currency: CurrencyCode; board: RatesBoardData | null }) {
  // Live govt rates when the API answered; static reference prices otherwise.
  // Reference entries carry a "ref" marker so a mixed board never passes a
  // fallback number off as a live one.
  const ticks = board
    ? board.rates.map((r) => ({ key: r.commodity, name: r.label, price: r.modal, unit: r.unit, delta: r.changePct, ref: r.source === 'reference' }))
    : REFERENCE_TICKS.map((r) => ({ key: r.slug, name: r.name, price: r.price, unit: r.unit, delta: 0, ref: true }));
  // Two equal-width copies of the list = seamless -50% marquee loop. The copies
  // are separate elements (not one flattened list) so each one owns its
  // trailing gap and the halfway point is an exact seam.
  return (
    <div className="st-ticker" aria-hidden="true">
      <div
        className="st-ticker-track"
        // Constant scroll SPEED, not constant duration. The track is
        // `width: max-content` and the keyframe travels a fixed -50% of it, so
        // a hardcoded 60s meant the marquee lurched to nearly 3x speed the
        // instant the 11 static ticks were replaced by the feed's 30. Two
        // seconds per tick reproduces today's pace on a full board.
        style={{ '--st-ticker-dur': `${ticks.length * 2}s` } as CSSProperties}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="st-ticker-copy">
            {ticks.map((t, i) => (
              <span key={`${t.key}-${i}`} className="st-tick">
                <span className="n">{t.name}</span>
                <span className="v">{formatUnitPrice(t.price, 'INR', currency)}/{UNIT_LABEL[t.unit]}</span>
                {/* every tick ends in a marker — "ref", a move, or "steady".
                    Without the flat label a live crop sitting within 0.1% of
                    its usual price rendered nothing, so the same ticker showed
                    a move on some crops and bare price on others. */}
                {t.ref ? <span className="d flat">ref</span> : <Delta pct={t.delta} flatLabel="steady" />}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreHeader({
  country, onChangeCountry, query, onQuery, user,
}: {
  country: Country;
  onChangeCountry: (c: Country) => void;
  query: string;
  onQuery: (q: string) => void;
  user: User | null;
}) {
  const { t } = useTranslation();
  // Seeded from the restored scroll position rather than defaulting to false:
  // reloading part-way down the page otherwise painted the header flat for a
  // frame and then snapped the shadow on.
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 4);
  const [wordIdx, setWordIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Where the header's account link goes, decided ONCE. The inline nav and the
  // collapsed menu below both render it, and keeping two copies of the role
  // ladder is what let them disagree.
  //
  // A CONSUMER has no dashboard by design, and their main action is the shop
  // they are already looking at, so they get their orders instead. /admin is
  // the fallback for ADMIN alone.
  const account = user
    ? {
        to: user.role === 'FARMER' ? '/farmer'
          : user.role === 'BUYER' ? '/buyer'
          : user.role === 'CONSUMER' ? '/orders'
          : '/admin',
        label: user.role === 'CONSUMER' ? 'Orders' : 'Dashboard',
      }
    : { to: '/login', label: 'Sign in' };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The section links collapse into this menu below 960px. Close it on any
  // outside pointer press or Escape so it never sits open behind the page.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && (e.target as Element)?.closest?.('.st-menu-wrap')) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  // Blinkit-style rotating search hint: Search "tomatoes" → "kesar mangoes" → …
  useEffect(() => {
    const id = setInterval(() => setWordIdx((i) => (i + 1) % SEARCH_WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <header className={`st-header${scrolled ? ' scrolled' : ''}`}>
      <div className="st-header-row">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>

        <div className="st-source">
          <span className="cb-tiny st-source-l">{t('Sourcing from')}</span>
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
          <LanguageSwitcher />
          {/* "How it works" (last) is a pitch for people who aren't signed
              up yet, so signed-in visitors don't get it in the inline row. */}
          {SECTION_LINKS.slice(0, user ? -1 : undefined).map(([label, to]) => (
            <Link key={to} to={to} className="st-header-link">{t(label)}</Link>
          ))}
          {user ? (
            // Logged in: the store stays the home page; these are the doors
            // into the app (dashboard + the role's main action).
            <>
              <Link to={account.to} className="nav-signin">{t(account.label)}</Link>
              {user.role !== 'CONSUMER' && (
                <Link
                  to={user.role === 'FARMER' ? '/farmer/listings/new' : '/buyer/browse'}
                  className="cb-btn cb-btn-primary"
                >
                  {user.role === 'FARMER' ? t('Sell a crop') : t('Browse live lots')}
                  <ArrowIcon />
                </Link>
              )}
            </>
          ) : (
            <>
              <Link to="/login" className="nav-signin">{t('Sign in')}</Link>
              <Link to="/signup" className="cb-btn cb-btn-primary">
                <span className="cb-btn-label">{t('Start selling')}</span>
                <span className="cb-btn-label-short">{t('Sell')}</span>
                <ArrowIcon />
              </Link>
            </>
          )}
        </nav>

        {/* Below 960px the section links don't fit beside the search box, so
            they collapse in here. Without this they were reachable only from
            the footer — a whole storefront's worth of scrolling away. */}
        <div className="st-menu-wrap">
          <button
            type="button"
            className="st-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('Menu')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {menuOpen && (
            <div className="st-menu" role="menu">
              {SECTION_LINKS.map(([label, to]) => (
                <Link key={to} to={to} role="menuitem" className="st-menu-link" onClick={() => setMenuOpen(false)}>
                  {t(label)}
                </Link>
              ))}
              {/* Below 640px the header drops its .nav-signin slot to keep the
                  bar on one line, so whichever link lived there — Sign in, or
                  the account link once you're logged in — has to reappear here.
                  It reads `account` rather than working the role out again:
                  the second copy of that ladder had no CONSUMER rung, so a
                  shopper on a phone got /admin, was bounced by ProtectedRoute,
                  and had no route to their orders at all. */}
              <Link
                to={account.to}
                role="menuitem"
                className="st-menu-link"
                onClick={() => setMenuOpen(false)}
              >
                {t(account.label)}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// =============================================================================
// Store sections
// =============================================================================

// Hero floating chips — three fixed slots (.c0/.c1/.c2 place them over the
// photo). Picked by slug so each chip can fall back to its reference price when
// the govt feed has nothing for that crop.
const FLOAT_CHIP_PICKS = ['tomato', 'wheat', 'mango'];

function HeroBanner({ onShop, board, currency, user }: { onShop: () => void; board: RatesBoardData | null; currency: CurrencyCode; user: User | null }) {
  const { t } = useTranslation();
  // Secondary hero action follows the viewer: guests are asked to join,
  // farmers are sent to list a crop, buyers to their working bids, shoppers to
  // their orders. A signed-in shopper must not fall through to the guest CTA —
  // "Sell your harvest" is the one thing they are certainly not here to do.
  const secondary = user?.role === 'FARMER'
    ? { to: '/farmer/listings/new', label: 'List your harvest' }
    : user?.role === 'BUYER'
      ? { to: '/buyer/bids', label: 'My bids' }
      : user?.role === 'CONSUMER'
        ? { to: '/orders', label: 'My orders' }
        : { to: '/signup', label: 'Sell your harvest' };
  // Floating live-price chips over the hero photo. Always three, always in the
  // same corners: today's real number when the govt feed answered for that
  // crop, the reference price tagged "ref" when it didn't — the same
  // honesty rule the rates board uses. Dropping the unanswered crops instead
  // (the old behaviour) meant the hero showed three chips, one, or none
  // depending on the day's feed, and the survivors slid into each other's
  // slots because the slot came from the post-filter index.
  const chips = FLOAT_CHIP_PICKS.map((slug) => {
    const p = REFERENCE_TICKS.find((x) => x.slug === slug)!;
    const live = board?.rates.find((r) => r.label === p.name && r.source !== 'reference');
    return live
      ? { slug, emoji: live.emoji, name: live.label, price: live.modal, unit: live.unit, delta: live.changePct, ref: false }
      : { slug, emoji: p.emoji, name: p.name, price: p.price, unit: p.unit, delta: 0, ref: true };
  });
  return (
    <section className="st-banner">
      <div className="st-banner-grid-bg" />
      <div className="st-banner-copy">
        <span className="cb-chip cb-chip-sage" style={{ marginBottom: 18 }}>
          <span className="cb-live-dot sm" />
          {board?.live ? `Live govt mandi rates · ${board.date}` : 'Straight from the farm · escrow settled'}
        </span>
        <h1 className="st-banner-title">
          {t('Farm-fresh crops,')}<br />
          <span className="italic">{t('farmer-fair')}</span> {t('prices.')}
        </h1>
        <p className="st-banner-lede">
          {t('Buy vegetables, fruits, grains and spices straight from the grower — today\'s real mandi price behind every pack, escrow-settled, delivered farm to door.')}
        </p>
        <div className="st-banner-actions">
          <button type="button" className="cb-btn st-btn-cream" onClick={onShop}>
            {t('Shop the market')}
            <ArrowIcon />
          </button>
          <Link to={secondary.to} className="cb-btn st-btn-outline">{t(secondary.label)}</Link>
        </div>
        <div className="st-banner-ticks">
          <span>✓ {t('Live govt mandi rates')}</span>
          <span>✓ {t('Open bidding & auctions')}</span>
          <span>✓ {t('Escrow settlement')}</span>
          <span>✓ {t('Farm-to-door logistics')}</span>
        </div>
      </div>
      <div className="st-banner-media">
        <BannerImg />
        {chips.map((c, i) => (
          <div key={c.slug} className={`st-float-chip c${i}`}>
            <span className="e" aria-hidden="true">{c.emoji}</span>
            <span className="t">
              <span className="n">{c.name}</span>
              <span className="v">{formatUnitPrice(c.price, 'INR', currency)}/{UNIT_LABEL[c.unit]}</span>
            </span>
            {c.ref ? <span className="d flat">ref</span> : <Delta pct={c.delta} flatLabel="steady" />}
          </div>
        ))}
      </div>
    </section>
  );
}

// Placeholder cards that occupy exactly the height the real board will, so the
// swap to live rates moves nothing. Real elements carrying real (transparent)
// text rather than fixed-height bars: the line boxes are then identical to the
// live card's by construction, instead of by a magic number that drifts the
// next time a font size changes.
function RateSkeleton() {
  return (
    <div className="st-rate" aria-hidden="true">
      <div className="st-rate-top">
        <span className="st-sk st-sk-emoji">·</span>
        <span className="st-sk">▲ 0.0%</span>
      </div>
      <div className="st-rate-n"><span className="st-sk">Tomato</span></div>
      <div className="st-rate-v"><span className="st-sk">₹00/kg</span></div>
      <div className="cb-mono st-rate-band"><span className="st-sk">₹00–₹00</span></div>
    </div>
  );
}

// Today's rates, front and centre — the shared price anchor every deal on
// CropBid negotiates around. Live from the govt feed, honest about fallback.
// NOTE: no st-reveal here. The section is never hidden-then-revealed: it holds
// its space from first paint and only its contents change, which is what keeps
// the reload smooth. It collapses only if the feed is unreachable entirely.
function LiveRatesBoard({ board, pending, currency }: { board: RatesBoardData | null; pending: boolean; currency: CurrencyCode }) {
  if (!board) {
    if (!pending) return null; // feed unreachable — nothing honest to show
    return (
      <section className="st-rates">
        <div className="st-rates-head">
          <div className="st-rates-title">
            <span className="cb-eyebrow">Today's mandi rates</span>
          </div>
          <span className="cb-mono st-rates-src">GOVT. AGMARKNET · ₹ WHOLESALE · vs USUAL</span>
          <Link to="/rates" className="st-seeall">full board, every mandi <ArrowIcon size={12} /></Link>
        </div>
        <div className="st-rates-track">
          {Array.from({ length: 10 }, (_, i) => <RateSkeleton key={i} />)}
        </div>
      </section>
    );
  }
  return (
    <section className="st-rates">
      <div className="st-rates-head">
        <div className="st-rates-title">
          {board.live && <span className="st-live-dot" />}
          <span className="cb-eyebrow">Today's mandi rates{board.live ? ' · live' : ''} · {board.date}</span>
        </div>
        <span className="cb-mono st-rates-src">GOVT. AGMARKNET · ₹ WHOLESALE · vs USUAL</span>
        <Link to="/rates" className="st-seeall">full board, every mandi <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-rates-track">
        {board.rates.map((r) => (
          <div key={r.commodity} className="st-rate" title={r.market ? `${r.market}${r.state ? ', ' + r.state : ''}` : r.state ?? 'National average'}>
            <div className="st-rate-top">
              <span className="st-rate-emoji" aria-hidden="true">{r.emoji}</span>
              {/* reference cards say "ref", not "steady" — the board never
                  pretends a fallback number is a live one */}
              <Delta pct={r.changePct} flatLabel={r.source === 'reference' ? 'ref' : 'steady'} />
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

// -----------------------------------------------------------------------------
// Forecast strip — the prediction engine's storefront teaser.
// /api/rates/predictions returns crops sorted by expected 7-day move; the strip
// shows the biggest movers as pills and sends people to /forecast for the why.
// Mounts empty and renders only once predictions arrive (same rule as the
// rates board — no reveal animation on a section that starts as null).
// -----------------------------------------------------------------------------

interface StripPrediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: UnitCode;
  outlook: { direction: 'rise' | 'hold' | 'ease'; pct7d: number; low: number; high: number };
}

function useForecast(): { rows: StripPrediction[]; pending: boolean } {
  const [rows, setRows] = useState<StripPrediction[]>([]);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let on = true;
    api.get('/rates/predictions')
      .then(({ data }) => { if (on && data?.predictions?.length) setRows(data.predictions); })
      .catch(() => { /* strip simply doesn't render if the engine is unreachable */ })
      .finally(() => { if (on) setPending(false); });
    return () => { on = false; };
  }, []);
  return { rows, pending };
}

function ForecastStrip() {
  const { rows, pending } = useForecast();
  // Same rule as the rates board above: hold the height while the engine
  // answers so the pills fill a box that is already there, rather than
  // appearing under the reader and pushing the rails down mid-scroll.
  if (rows.length === 0) {
    if (!pending) return null;
    return (
      <section className="st-fc">
        <div className="st-rates-head">
          <div className="st-rates-title">
            <span className="cb-eyebrow">CropBid forecast · where prices go next</span>
          </div>
          <span className="cb-mono st-rates-src">DEMAND &amp; SUPPLY MODEL · NEXT 7 DAYS</span>
          <Link to="/forecast" className="st-seeall">full forecast, with the why <ArrowIcon size={12} /></Link>
        </div>
        <div className="st-fc-track" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="st-fc-pill">
              <span className="st-sk">🌾 Tomato ▲ 0.0% / 7d</span>
            </span>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="st-fc">
      <div className="st-rates-head">
        <div className="st-rates-title">
          <span className="cb-eyebrow">CropBid forecast · where prices go next</span>
        </div>
        <span className="cb-mono st-rates-src">DEMAND &amp; SUPPLY MODEL · NEXT 7 DAYS</span>
        <Link to="/forecast" className="st-seeall">full forecast, with the why <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-fc-track">
        {rows.slice(0, 10).map((p) => {
          const dir = p.outlook.direction;
          const arrow = dir === 'rise' ? '▲' : dir === 'ease' ? '▼' : '▬';
          const move = dir === 'hold' ? 'steady' : `${p.outlook.pct7d > 0 ? '+' : ''}${p.outlook.pct7d.toFixed(1)}% / 7d`;
          return (
            <Link key={p.commodity} to="/forecast" className="st-fc-pill">
              <span aria-hidden="true">{p.emoji}</span>
              <span className="n">{p.label}</span>
              <span className={`d ${dir === 'rise' ? 'pos' : dir === 'ease' ? 'neg' : 'flat'}`}>
                {arrow} {move}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const PROMOS: Array<{ tone: 'sage' | 'paper' | 'ember'; emoji: string; title: string; desc: string; ctaLabel: string; to: string }> = [
  { tone: 'sage',  emoji: '🔨', title: 'Live auctions',        desc: 'Verified buyers bid in open rounds — watch prices climb in real time.', ctaLabel: 'Start bidding',  to: '/signup' },
  { tone: 'paper', emoji: '🧺', title: 'Buy direct, no bidding', desc: 'Household packs at the farmer’s own price — a kilo of tomatoes, a litre of milk, no lot to take on.', ctaLabel: 'Shop direct', to: '/signup' },
  { tone: 'ember', emoji: '🛡️', title: 'Escrow protected',  desc: 'Money stays held on-platform and releases only when you confirm delivery.', ctaLabel: 'How it works', to: '/how-it-works' },
];

function PromoTrio({ shopHref }: { shopHref: string }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>();
  return (
    <div className="st-promos st-reveal" ref={ref}>
      {PROMOS.map((p) => (
        <Link key={p.title} to={p.to === '/signup' ? shopHref : p.to} className={`st-promo ${p.tone}`}>
          <span className="st-promo-emoji" aria-hidden="true">{p.emoji}</span>
          <span className="st-promo-t">{t(p.title)}</span>
          <span className="st-promo-d">{t(p.desc)}</span>
          <span className="st-promo-link">{t(p.ctaLabel)} <ArrowIcon size={12} /></span>
        </Link>
      ))}
    </div>
  );
}

const HOW_STEPS: Array<[n: string, title: string, desc: string]> = [
  ['01', 'Farmers list from the field', 'Crop, grade, quantity, floor price — in any language, without leaving the farm.'],
  ['02', 'You buy or bid', 'Households add a pack at the listed price. Bulk buyers bid on the whole lot.'],
  ['03', 'Escrow keeps it safe', 'Money held on-platform, tracked paid → shipped → delivered, released when you confirm.'],
];

function HowStrip() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  return (
    <section className="st-how st-reveal" ref={ref}>
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">{t('Simple by design')}</span>
          <h2 className="st-rail-title">{t('How CropBid works')}</h2>
        </div>
        <Link to="/how-it-works" className="st-seeall">{t('the full story')} <ArrowIcon size={12} /></Link>
      </div>
      <div className="st-how-grid">
        {HOW_STEPS.map(([n, title, desc]) => (
          <div key={n} className="st-how-step">
            <span className="cb-mono st-how-n">{n}</span>
            <span className="st-how-t">{t(title)}</span>
            <span className="st-how-d">{t(desc)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SellCTA({ user }: { user: User | null }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  // Marketing noise for a signed-in buyer — the block is farmer-targeted.
  if (user?.role === 'BUYER') return null;
  const sellHref = user?.role === 'FARMER' ? '/farmer/listings/new' : '/signup';
  const sellLabel = user?.role === 'FARMER' ? 'List your harvest' : 'Start selling free';
  return (
    <section className="cta st-reveal" ref={ref}>
      <div className="cta-card">
        <div className="cta-grid-bg" />
        <div className="cta-inner">
          <div>
            <h2 className="cb-h1">{t('Grow it?')} <span className="italic">{t('Sell it here.')}</span></h2>
            <p className="cb-body cta-lede">
              {t('List your harvest in two minutes and let verified buyers bid it up. No mandi trips, no guesswork — you keep the margin.')}
            </p>
          </div>
          <div className="cta-actions">
            <Link to={sellHref} className="cb-btn cta-primary">
              {t(sellLabel)}
              <ArrowIcon />
            </Link>
            <Link to="/how-it-works" className="cb-btn cta-ghost">
              {t('See how it works')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Incubation credit — last thing on the page before the footer. Two backers
// share the row: India 2047 Ventures tries the real logo at
// /india-2047-ventures.png (drop it in client/public) and falls back to the SVG
// recreation until that file exists; Founder Startup House ships as a real
// wordmark PNG, so it is a plain <img> with the name as alt text.
// -----------------------------------------------------------------------------

function India2047Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <India2047Mark size={46} />;
  return (
    <img
      src="/india-2047-ventures.png"
      alt=""
      width={46}
      height={46}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function IncubatedBy() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  return (
    <section
      className="st-incub st-reveal"
      ref={ref}
      aria-label="Incubated by India 2047 Ventures and Founder Startup House"
    >
      <span className="cb-eyebrow">{t('Incubated by')}</span>
      <div className="st-incub-row">
        <div className="st-incub-brand">
          <India2047Logo />
          <span className="st-incub-name">India 2047 <span>Ventures</span></span>
        </div>
        <span className="st-incub-sep" aria-hidden="true" />
        <img
          className="st-incub-wordmark"
          src="/founder-startup-house.png"
          alt="Founder Startup House"
          width={150}
          height={42}
          loading="lazy"
        />
      </div>
      <p className="cb-small st-incub-line">
        {t('CropBid is built with the backing of India 2047 Ventures and Founder Startup House.')}
      </p>
    </section>
  );
}

// =============================================================================
// Page
// =============================================================================

export function LandingPage() {
  const { user } = useAuth();
  const [country, setCountry] = useState<Country>(loadCountry);
  const [query, setQuery] = useState('');
  const currency = country.currency;
  const { board, pending: ratesPending } = useLiveRates();

  // Where the promo tiles land. The shelf is retail — bulk lots live behind
  // /buyer/browse and /auctions, so a signed-in buyer or farmer is sent to the
  // surface built for them; guests are asked to join first. A shopper is
  // already on their shop, so '/' is a harmless self-link.
  const shopHref = user?.role === 'BUYER' ? '/buyer/browse'
    : user?.role === 'FARMER' ? '/auctions'
    : user?.role === 'CONSUMER' ? '/'
    : '/signup';

  const handleChangeCountry = (next: Country) => {
    setCountry(next);
    saveCountry(next);
  };

  // Only two places left to scroll to: the top, and the shelf. Clear any active
  // search first, or the shelf is filtered down to nothing when we arrive.
  const scrollTo = (target: 'top' | 'shelf') => {
    setQuery('');
    requestAnimationFrame(() => {
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        document.getElementById('shelf')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        user={user}
      />
      <main className="st-main">
        {/* One shelf, one truth, whoever is looking. The search box narrows the
            shelf itself, so a search hides the marketing sections around it
            rather than routing to a separate results page over demo data. */}
        {!searching && <HeroBanner onShop={() => scrollTo('shelf')} board={board} currency={currency} user={user} />}
        <LiveShelf query={query} />
        {!searching && (
          <>
            <LiveRatesBoard board={board} pending={ratesPending} currency={currency} />
            <ForecastStrip />
            <PromoTrio shopHref={shopHref} />
            <HowStrip />
            <SellCTA user={user} />
            <IncubatedBy />
          </>
        )}
      </main>
      <CBFooter />
    </div>
  );
}
