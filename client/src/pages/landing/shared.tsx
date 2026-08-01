// =============================================================================
// Landing shared — currency, countries, icons, footer
// =============================================================================
// Pieces used by both public pages: the storefront homepage (LandingPage) and
// the marketing/product page (HowItWorksPage). All prices on public pages are
// stored in each row's native currency and converted to the viewer's display
// currency via FX_TO_USD. Selection persists in localStorage.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
export type UnitCode = 'KG' | 'QUINTAL' | 'TONNE' | 'LITRE';

export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: CurrencyCode;
}

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'IN', name: 'India',         flag: '🇮🇳', currency: 'INR' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'EU', name: 'European Union', flag: '🇪🇺', currency: 'EUR' },
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷', currency: 'USD' },
  { code: 'AU', name: 'Australia',     flag: '🇦🇺', currency: 'USD' },
  { code: 'KE', name: 'Kenya',         flag: '🇰🇪', currency: 'USD' },
  { code: 'AE', name: 'UAE',           flag: '🇦🇪', currency: 'USD' },
];

// USD-anchored FX. Used to convert native-currency prices to the viewer's
// currency. Replace with a daily feed once treasury wires one in.
export const FX_TO_USD: Record<CurrencyCode, number> = {
  INR: 0.0105, // ~₹95/USD (Jun 2026)
  USD: 1,
  EUR: 1.16,   // EUR/USD ~1.16 (Jun 2026)
  GBP: 1.35,   // GBP/USD ~1.35 (Jun 2026)
};

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
};

export const UNIT_LABEL: Record<UnitCode, string> = {
  KG: 'kg', QUINTAL: 'qtl', TONNE: 'MT', LITRE: 'L',
};

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const usd = amount * FX_TO_USD[from];
  return usd / FX_TO_USD[to];
}

export function formatMoney(amount: number, currency: CurrencyCode, opts: { compact?: boolean; decimals?: number } = {}): string {
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

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
  return `${n}`;
}

// Per-unit price in the viewer's currency. Never K/M-compacted — exact figures
// matter — and small converted values (e.g. ₹30/kg → $0.32) keep two decimals.
export function formatUnitPrice(amount: number, from: CurrencyCode, display: CurrencyCode): string {
  const converted = convert(amount, from, display);
  return formatMoney(converted, display, { decimals: converted >= 20 ? 0 : 2 });
}

// =============================================================================
// Country persistence
// =============================================================================

const LS_KEY = 'cb-landing-country';

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === 'IN') ?? COUNTRIES[0];

export function loadCountry(): Country {
  if (typeof window === 'undefined') return DEFAULT_COUNTRY;
  const code = window.localStorage.getItem(LS_KEY);
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

export function saveCountry(c: Country): void {
  try {
    window.localStorage.setItem(LS_KEY, c.code);
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

// =============================================================================
// SVG icons
// =============================================================================

export function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 7h8M7 3l4 4-4 4" />
    </svg>
  );
}
export function ArrowSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h6M6 3l3 3-3 3" />
    </svg>
  );
}
export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3 1l8 5-8 5z" />
    </svg>
  );
}
export function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2.5 4l2.5 2.5L7.5 4" />
    </svg>
  );
}
export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M10 10l3.2 3.2" />
    </svg>
  );
}
// India 2047 Ventures mark — SVG recreation of the incubator's orbit logo
// (two gradient rings, a heavy connecting arc, and two node circles). Drawn in
// currentColor so it sits correctly on light and dark surfaces. Used as the
// fallback behind /india-2047-ventures.png (drop the real PNG in client/public
// to override).
export function India2047Mark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="i47-outer" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.65" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="i47-inner" x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.75" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r="52" stroke="url(#i47-outer)" strokeWidth="7" />
      <circle cx="70" cy="70" r="34" stroke="url(#i47-inner)" strokeWidth="7" />
      <path d="M70 18 A52 52 0 0 1 70 122" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="70" cy="18" r="13" fill="var(--cb-paper, #fff)" stroke="currentColor" strokeWidth="8" />
      <circle cx="70" cy="122" r="13" fill="var(--cb-paper, #fff)" stroke="currentColor" strokeWidth="8" />
    </svg>
  );
}

export function ArcMark({ size = 27, accent = '#c8602b' }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M5 30C5 17 10 8 20 8s15 9 15 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="5" cy="30" r="3.6" fill="currentColor" />
      <circle cx="35" cy="30" r="3.6" fill="currentColor" />
      <circle cx="20" cy="8" r="2.6" fill={accent} />
    </svg>
  );
}

// =============================================================================
// Country selector
// =============================================================================

export function CountrySelector({ country, onChange }: { country: Country; onChange: (c: Country) => void }) {
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
// Footer — shared by both public pages
// =============================================================================

// Cross-page links use plain <a> so the browser handles the #hash scroll on
// the destination page; same-page routes without a hash use <Link>.
//
// EVERY ENTRY HERE MUST GO SOMEWHERE REAL. This list previously carried 11
// href="#" placeholders (Careers, Press, Blog, Documentation, Trust center,
// Status, Reports, Glossary, API, Terms, Disclosures) plus four #veg/#fruits/
// #grains/#spices anchors pointing at ids that don't exist on the landing page.
// Dead links cost twice over: a visitor who clicks one learns the site is
// unfinished, and a crawler spends budget on links that resolve nowhere while
// the real pages go undiscovered. Add the link when the page ships, not before.
const FOOTER_COLS: Array<{ title: string; items: Array<[label: string, href: string]> }> = [
  {
    title: 'Product',
    items: [
      ['Marketplace',      '/'],
      ['Live mandi rates', '/rates'],
      ['Price forecast',   '/forecast'],
      ['Govt schemes',     '/schemes'],
      ['Farm equipment',   '/equipment'],
    ],
  },
  {
    title: 'Learn',
    items: [
      ['How it works', '/how-it-works#how'],
      ['Buy direct',   '/how-it-works#consumers'],
      ['Pricing',      '/how-it-works#pricing'],
      ['Features',     '/how-it-works#features'],
    ],
  },
  {
    title: 'Company',
    items: [
      ['About',   '/how-it-works'],
      ['Contact', 'mailto:info@cropbid.in'],
    ],
  },
];

/**
 * Brand marks are inline paths rather than an icon-library import: lucide-react
 * dropped its brand icons, and these two need to be exact — a redrawn logo is
 * the kind of thing a brand team notices.
 */
const SOCIALS: Array<{ label: string; href: string; path: string }> = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/cropbid',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z',
  },
  {
    label: 'X',
    href: 'https://x.com/CropBid',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
];

export function CBFooter() {
  const { t } = useTranslation();
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
              {t('Fair price discovery for agriculture — live govt mandi rates, open bidding, escrow-settled deals, and farm-to-door logistics. Built in India, for farmers first.')}
            </p>
            <div className="cb-footer-badges">
              {['Govt Agmarknet data', 'Razorpay escrow', 'Made in India'].map((b) => (
                <span key={b} className="cb-chip">{t(b)}</span>
              ))}
            </div>
            <div className="cb-footer-contact">
              <span className="cb-footer-contact-label">{t('Contact')}</span>
              <a href="mailto:info@cropbid.in">info@cropbid.in</a>
            </div>

            {/*
              These are the return half of the sameAs claim in index.html's
              Organization schema. Search engines and answer engines only merge
              a profile into the site's entity when the link runs BOTH ways —
              a one-directional sameAs is treated as an unverified assertion
              and discounted. So these have to be real crawlable <a href>s in
              the markup, not icon buttons wired up in JavaScript.

              rel="me" states the same identity claim in the microformats
              vocabulary, which is what Mastodon/IndieAuth verify against.
            */}
            <div className="cb-footer-social">
              <span className="cb-footer-contact-label">{t('Follow')}</span>
              <ul>
                {SOCIALS.map((s) => (
                  <li key={s.label}>
                    {/*
                      aria-label carries the accessible name — the anchor has no
                      text, so without it a screen reader announces only "link".
                      The <svg> is aria-hidden so the name isn't read twice.
                    */}
                    <a
                      href={s.href}
                      rel="me noopener"
                      target="_blank"
                      aria-label={s.label}
                      title={s.label}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d={s.path} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {FOOTER_COLS.map((c) => (
            <div key={c.title} className="cb-footer-col">
              <div className="cb-footer-col-title">{t(c.title)}</div>
              <ul>
                {c.items.map(([label, href]) => <li key={label}><a href={href}>{t(label)}</a></li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="cb-footer-bottom">
          <span>© {new Date().getFullYear()} CropBid, Inc.  ·  {t('All rights reserved')}</span>
          {/* Terms and Disclosures lived here as href="#" — restore them when
              those pages exist. /privacy is real and stays. */}
          <span className="cb-footer-bottom-links">
            <Link to="/privacy">{t('Privacy')}</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
