// =============================================================================
// Rates Page — /rates · today's live mandi rates, in full detail
// =============================================================================
// The dedicated public page behind the storefront rates strip: every
// commodity the Government of India's Agmarknet feed reported today (about
// 220 of them, where the storefront strip carries 30), grouped the way a
// buyer looks for them, with today's modal price, the range most mandis sat
// in, and how local the number is. Every crop also carries a vs-usual signal
// once CropBid has an earlier day of its price to compare with (the server's
// usualPrices.ts keeps a running average of up to 30 days). Clicking a
// crop opens the market-wise breakdown in a dialog over the page: every
// reporting mandi with market, district, state, variety, grade and price band. Prices are ₹-native (the
// feed is India-only), so no FX conversion happens here.
//
// The page reads in English, Hindi or Marathi, picked from the same dropdown
// the homepage carries (LanguageSwitcher). Crop names come from
// content/cropNames.ts, keyed by the feed's commodity id, with the English
// name kept underneath so a trader can still recognise and search it.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { useRatesHeading } from '../utils/ratesDate';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { localCropName } from '../content/cropNames';

// -----------------------------------------------------------------------------
// Data shapes (mirror server/src/services/rates.service.ts)
// -----------------------------------------------------------------------------

type Group =
  | 'vegetables' | 'greens' | 'fruits' | 'cereals' | 'pulses'
  | 'oilseeds' | 'spices' | 'dryfruits' | 'dairy' | 'other';

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  group: Group;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  modal: number;
  min: number;
  max: number;
  usual: number | null;      // null until there is an earlier day to compare with
  usualDays: number;         // days `usual` averages; the average spans up to 30
  changePct: number | null;
  mandis: number;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
  date: string;
}

interface AllRates {
  date: string;
  live: boolean;
  states: string[];
  groups: Array<{ id: Group; title: string }>;
  rates: LiveRate[];
}

interface MarketRow {
  market: string;
  district: string;
  state: string;
  variety: string;
  grade: string;
  date: string;
  modal: number;
  min: number;
  max: number;
}

interface Breakdown {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  count: number;
  records: MarketRow[];
  excluded: number;
}

// The line above each group says what unit its prices are in. Fresh produce
// is bought by the kilo and everything else trades by the quintal; the
// server picks the same units.
const GROUP_UNIT: Record<Group, string> = {
  vegetables: 'Price per kg',
  greens: 'Price per kg',
  fruits: 'Price per kg',
  cereals: 'Price per quintal',
  pulses: 'Price per quintal',
  oilseeds: 'Price per quintal',
  spices: 'Price per quintal',
  dryfruits: 'Price per quintal',
  dairy: 'Price per litre or kg',
  other: 'Price per quintal',
};

// Where the number on a card comes from, in words a first-time reader gets.
const SOURCE_LABEL: Record<LiveRate['source'], string> = {
  market: 'One mandi',
  state: 'State average',
  national: 'India average',
  reference: 'Reference price',
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const unitLabel = (u: 'KG' | 'QUINTAL' | 'LITRE', t: TFunction) =>
  t(u === 'KG' ? 'kg' : u === 'LITRE' ? 'litre' : 'quintal');

/**
 * "25/09/2026" → "25 Sep", "25 सितंबर", "25 सप्टेंबर". Hindi and Marathi spell
 * the month out because their short forms ("सित॰") read as typos. Digits stay
 * Latin, like the prices.
 */
function localDate(date: string, lang: string): string {
  const [dd, mm, yyyy] = date.split('/').map(Number);
  if (!dd || !mm || !yyyy) return date;
  const code = ['hi', 'mr'].includes(lang.slice(0, 2)) ? lang.slice(0, 2) : 'en';
  const month = code === 'en' ? 'short' : 'long';
  return new Intl.DateTimeFormat(`${code}-IN-u-nu-latn`, { day: 'numeric', month, timeZone: 'UTC' })
    .format(new Date(Date.UTC(yyyy, mm - 1, dd)));
}

/** The name to lead with, and the English one to show under it when they differ. */
function useCropName() {
  const { i18n } = useTranslation();
  return (r: { commodity: string; label: string }) => {
    const local = localCropName(r.commodity, i18n.language);
    return { name: local ?? r.label, english: local ? r.label : null };
  };
}

/**
 * How today's price compares with the crop's recent average, as a coloured
 * pill: green above, orange below, grey when there is nothing to say. A
 * reference price gets none, because its footer already says what it is.
 */
function Signal({ r }: { r: LiveRate }) {
  const { t } = useTranslation();
  if (r.source === 'reference') return null;
  if (r.usual === null || r.changePct === null) {
    return <span className="rp-pill flat">{t('No earlier price to compare')}</span>;
  }
  if (Math.abs(r.changePct) < 0.1) return <span className="rp-pill flat">{t('about usual')}</span>;
  const up = r.changePct >= 0;
  const pct = Math.abs(r.changePct).toFixed(1);
  return (
    <span
      className={`rp-pill ${up ? 'pos' : 'neg'}`}
      title={t('Usually about {{price}} per {{unit}}, from the last {{n}} days in each state', {
        price: inr(r.usual), unit: unitLabel(r.unit, t), n: Math.min(r.usualDays, 30),
      })}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {t(up ? '{{pct}}% above usual' : '{{pct}}% below usual', { pct })}
    </span>
  );
}

/** Where the card's number comes from, and how many mandis it rests on. */
function sourceLine(r: LiveRate, t: TFunction): string {
  if (r.source === 'reference') return t("Reference price, not today's report");
  const count = t(r.mandis === 1 ? '{{n}} mandi' : '{{n}} mandis', { n: r.mandis });
  return `${t(SOURCE_LABEL[r.source])} · ${count}`;
}

// -----------------------------------------------------------------------------
// Market-wise breakdown table for the selected crop
// -----------------------------------------------------------------------------
// A list of up to a few hundred mandis, so the reader gets two tools: find
// their own mandi or district, and sort by price to see who pays most. Each
// mandi also says how its price sits against the typical price on the card,
// which is the comparison a farmer deciding where to sell is making.

type MandiSort = 'state' | 'high' | 'low';

/** A mandi's price against the crop's typical one, or null when they are close enough not to mention. */
function vsTypical(price: number, typical: number): { pct: number; up: boolean } | null {
  if (!(typical > 0)) return null;
  const pct = Math.round(((price - typical) / typical) * 100);
  return Math.abs(pct) < 2 ? null : { pct: Math.abs(pct), up: pct > 0 };
}

/** In words on a phone row; as "▲ 8%" in the table, whose column header says what it is. */
function VsTypical({ price, typical, compact = false }: { price: number; typical: number | null; compact?: boolean }) {
  const { t } = useTranslation();
  if (typical === null) return null;
  const diff = vsTypical(price, typical);
  if (!diff) return <span className="rp-vs flat">{compact ? '≈' : t('about typical')}</span>;
  const words = t(diff.up ? '{{pct}}% more than typical' : '{{pct}}% less than typical', { pct: diff.pct });
  return (
    <span className={`rp-vs ${diff.up ? 'pos' : 'neg'}`} title={compact ? words : undefined}>
      {compact ? `${diff.up ? '▲' : '▼'} ${diff.pct}%` : words}
    </span>
  );
}

function MarketTable({ crop, state }: { crop: LiveRate; state: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Breakdown | null>(null);
  const [failed, setFailed] = useState(false);
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<MandiSort>('state');

  const rows = useMemo(() => {
    if (!data) return [];
    const q = find.trim().toLowerCase();
    const found = q
      ? data.records.filter((r) => [r.market, r.district, r.state, r.variety].join(' ').toLowerCase().includes(q))
      : data.records;
    if (sort === 'state') return found;
    return [...found].sort((a, b) => (sort === 'high' ? b.modal - a.modal : a.modal - b.modal));
  }, [data, find, sort]);

  // The table is mounted with a key of crop+state, so a change remounts it
  // with fresh state — no synchronous resets needed inside the effect.
  useEffect(() => {
    let on = true;
    const params = new URLSearchParams({ crop: crop.commodity });
    if (state) params.set('state', state);
    api.get(`/rates/markets?${params}`)
      .then(({ data }) => { if (on) setData(data); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [crop.commodity, state]);

  if (failed) return <div className="rp-detail-note">{t('Could not load the mandi list. Try again in a moment.')}</div>;
  if (!data) return <div className="rp-detail-note">{t('Loading every reporting mandi…')}</div>;
  if (data.count === 0) {
    return (
      <div className="rp-detail-note">
        {state
          ? t('No mandi in {{state}} reported this crop today, so the price above is a reference price.', { state })
          : t('No mandi reported this crop today, so the price above is a reference price.')}
      </div>
    );
  }

  // Only compare like with like: the card's price and the list share a unit
  // in practice, but a mismatch must not print a nonsense percentage.
  const typical = data.unit === crop.unit && crop.source !== 'reference' ? crop.modal : null;
  const sorts: Array<[MandiSort, string]> = [['state', 'By state'], ['high', 'Highest price'], ['low', 'Lowest price']];

  return (
    <>
    <div className="rp-mtools">
      <input
        className="rp-mfind"
        type="search"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder={t('Find your mandi or district')}
        aria-label={t('Find your mandi or district')}
      />
      <div className="rp-msort" role="group" aria-label={t('Sort mandis')}>
        <span className="rp-msort-label">{t('Sort')}</span>
        {sorts.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rp-msort-btn${sort === id ? ' active' : ''}`}
            aria-pressed={sort === id}
            onClick={() => setSort(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
    <div className="rp-table-wrap">
      <div className="rp-table-head">
        <span className="rp-table-count">
          {find.trim()
            ? t('{{shown}} of {{n}} mandis', { shown: rows.length, n: data.count })
            : t(data.count === 1 ? '{{n}} mandi reported it' : '{{n}} mandis reported it', { n: data.count })}
          {' · '}{state || t('All India')}
        </span>
        <span className="rp-src">{t('Prices in ₹ per {{unit}}', { unit: unitLabel(data.unit, t) })} · {t('Govt. Agmarknet')}</span>
      </div>
      {data.excluded > 0 && (
        <p className="rp-excluded">
          {t(
            data.excluded === 1
              ? '{{n}} report is left out because its price looks wrong: under a tenth or over ten times the usual one, usually a typo or a price per piece.'
              : '{{n}} reports are left out because their price looks wrong: under a tenth or over ten times the usual one, usually a typo or a price per piece.',
            { n: data.excluded },
          )}
        </p>
      )}
      {rows.length === 0 && (
        <p className="rp-excluded">{t('No mandi matches “{{q}}”.', { q: find.trim() })}</p>
      )}
      <div className="rp-table-scroll">
        <table className="rp-table">
          <thead>
            <tr>
              <th>{t('Mandi')}</th>
              <th>{t('District')}</th>
              <th>{t('State')}</th>
              <th>{t('Variety')}</th>
              <th>{t('Grade')}</th>
              <th className="num">{t('Lowest')}</th>
              <th className="num">{t('Typical')}</th>
              <th className="num">{t('Highest')}</th>
              {typical !== null && <th className="num rp-th-wrap">{t('Compared with typical')}</th>}
              <th>{t('Date')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.market}-${r.variety}-${i}`}>
                <td>{r.market}</td>
                <td>{r.district}</td>
                <td>{r.state}</td>
                <td>{r.variety}</td>
                <td>{r.grade}</td>
                <td className="num">{inr(r.min)}</td>
                <td className="num strong">{inr(r.modal)}</td>
                <td className="num">{inr(r.max)}</td>
                {typical !== null && <td className="num"><VsTypical price={r.modal} typical={typical} compact /></td>}
                <td className="cb-mono rp-date">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The same rows for a phone, where nine columns put the price off
            screen: market with its place underneath, price on the right.
            CSS shows one or the other. */}
        <ul className="rp-mlist">
          {rows.map((r, i) => (
            <li key={`${r.market}-${r.variety}-${i}`}>
              <div className="rp-mlist-main">
                <div className="rp-mlist-name">{r.market}</div>
                <div className="rp-mlist-meta">
                  {[r.district, r.state].filter((x) => x && x !== '—').join(', ')}
                  {r.variety && r.variety !== '—' ? ` · ${r.variety}` : ''}
                </div>
                <div className="rp-mlist-band">
                  {t('Range')} {inr(r.min)} – {inr(r.max)}
                </div>
              </div>
              <div className="rp-mlist-price">
                <div className="rp-mlist-modal">{inr(r.modal)}</div>
                <VsTypical price={r.modal} typical={typical} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// The mandi list, in a dialog over the page
// -----------------------------------------------------------------------------
// It used to unfold under the whole group of cards, which on a group of sixty
// vegetables pushed everything below it off the screen and left the reader
// scrolling to find which card they had opened. Closed by the × button, by
// Escape, or by a click on the dimmed page. The page behind does not scroll
// while it is open, focus starts on the close button, and it goes back to
// the card that opened it on close.
//
// Everything else on the page is made `inert` while it is open, so Tab cannot
// walk into the cards behind it and a screen reader does not read them; review
// caught that aria-modal alone left both open. Tab also cycles inside it.

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function MandiModal({ crop, state, onClose }: { crop: LiveRate; state: string; onClose: () => void }) {
  const { t } = useTranslation();
  const cropName = useCropName()(crop);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    // Mark every sibling on the way up from the dialog to <body> inert, and
    // only those, so closing undoes exactly what opening did.
    const madeInert: Element[] = [];
    for (let node: Element | null = backdropRef.current; node?.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '');
          madeInert.push(sibling);
        }
      }
      if (node.parentElement === document.body) break;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !backdropRef.current) return;
      const inside = Array.from(backdropRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (inside.length === 0) return;
      const first = inside[0];
      const last = inside[inside.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || !backdropRef.current.contains(here))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (here === last || !backdropRef.current.contains(here))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      for (const el of madeInert) el.removeAttribute('inert');
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="cb-modal-backdrop rp-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cb-modal rp-modal" role="dialog" aria-modal="true" aria-labelledby="rp-modal-title">
        <button ref={closeRef} type="button" className="cb-modal-close" onClick={onClose} aria-label={t('Close')}>×</button>
        {/* The same reading order as the card: what it is, the typical
            price, then three labelled facts. */}
        <div className="rp-modal-head">
          <span className="rp-rate-emoji rp-modal-emoji" aria-hidden="true">{crop.emoji}</span>
          <div className="rp-modal-names">
            <h2 id="rp-modal-title" className="rp-modal-title">{cropName.name}</h2>
            {cropName.english && <div className="rp-modal-en">{cropName.english}</div>}
          </div>
        </div>
        <div className="rp-modal-price">
          {inr(crop.modal)}<span className="rp-rate-unit">/{unitLabel(crop.unit, t)}</span>
        </div>
        <div className="rp-rate-caption">
          {crop.source === 'reference'
            ? t("Reference price, not today's report")
            : `${t('Typical mandi price')} · ${t(SOURCE_LABEL[crop.source])}${state ? `, ${state}` : ''}`}
        </div>
        <dl className="rp-facts">
          <div>
            <dt>{t('Most mandis')}</dt>
            <dd>{inr(crop.min)} – {inr(crop.max)}</dd>
          </div>
          {crop.source !== 'reference' && (
            <div>
              <dt>{t('Mandis reported')}</dt>
              <dd>{crop.mandis}</dd>
            </div>
          )}
          {crop.source !== 'reference' && (
            <div>
              <dt>{t('Compared with usual')}</dt>
              <dd><Signal r={crop} /></dd>
            </div>
          )}
        </dl>
        <MarketTable key={`${crop.commodity}::${state}`} crop={crop} state={state} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function RatesPage() {
  const { t, i18n } = useTranslation();
  const cropName = useCropName();
  const [board, setBoard] = useState<AllRates | null>(null);
  const heading = useRatesHeading(board);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get(`/rates/all${state ? `?state=${encodeURIComponent(state)}` : ''}`)
      .then(({ data }) => { if (on) { setBoard(data); setFailed(false); } })
      .catch(() => { if (on) { setBoard(null); setFailed(true); } });
    return () => { on = false; };
  }, [state]);

  // Search matches the label, the feed's own name and the Hindi or Marathi
  // name, so "karela", "bitter", "Bitter gourd" and "करेला" all find it.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!board || !q) return board?.rates ?? [];
    return board.rates.filter((r) =>
      r.label.toLowerCase().includes(q)
      || r.commodity.toLowerCase().includes(q)
      || (localCropName(r.commodity, 'hi') ?? '').includes(q)
      || (localCropName(r.commodity, 'mr') ?? '').includes(q));
  }, [board, query]);

  const selectedRate = board?.rates.find((r) => r.commodity === selected) ?? null;
  // Stable, so the dialog's open effect (focus, scroll lock) runs once.
  const closeMandis = useCallback(() => setSelected(null), []);
  // The picker offers the states that reported today, plus whichever one is
  // picked, so a choice never vanishes from under the person who made it.
  const states = board ? [...new Set([...board.states, ...(state ? [state] : [])])].sort() : [];
  // With a state picked, the board crops it did not report fall back to the
  // national figure; they are on the page but not counted as its reports.
  const reported = board?.rates.filter((r) => (state ? r.source === 'state' : r.source !== 'reference')).length ?? 0;

  // The heading, in the reader's language. useRatesHeading decides which of
  // the three it is; only the words and the date format change here.
  const reportDate = board?.live ? localDate(board.date, i18n.language) : '';
  const headingText = !heading.date
    ? t(heading.title)
    : heading.current
      ? `${t(heading.title)} · ${reportDate}`
      : `${t(heading.title)} · ${t('reported {{date}}', { date: reportDate })}`;

  // One whole sentence per case, so each translates as a sentence rather
  // than as pieces glued together in English word order.
  let lede: string;
  if (!board) lede = '';
  else if (!board.live) {
    lede = t("The government's mandi report is not available right now, so these are reference prices, not today's.");
  } else if (reported === 0) {
    lede = t("Wholesale prices from the government's mandi report.");
  } else if (heading.current) {
    lede = state
      ? t('Wholesale prices for {{n}} crops, reported by mandis in {{state}} today.', { n: reported, state })
      : t("Wholesale prices for {{n}} crops, from today's government mandi report.", { n: reported });
  } else {
    lede = state
      ? t('Wholesale prices for {{n}} crops, reported by mandis in {{state}} on {{date}}.', { n: reported, state, date: reportDate })
      : t("Wholesale prices for {{n}} crops, from the government's mandi report of {{date}}.", { n: reported, date: reportDate });
  }

  return (
    <div className="cb-landing rp">
      {/* slim header */}
      <header className="rp-nav rp-nav-lang">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <LanguageSwitcher />
          <Link to="/">{t('Marketplace')}</Link>
          <Link to="/forecast">{t('Forecast')}</Link>
          <Link to="/partner" className="nav-signin rp-nav-optional">{t('Become a partner')}</Link>
          <SignInLink className="cb-btn cb-btn-primary" label={t('Sign in')}>
            <ArrowIcon />
          </SignInLink>
        </nav>
      </header>

      <main className="rp-main">
        {/* page head */}
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              {board?.live && <span className="cb-live-dot sm" />}
              {t(board?.live ? 'Live' : 'Reference')} · {t('Govt. Agmarknet')} · {t('4,600+ regulated mandis')}
            </span>
            <h1 className="cb-h1">{headingText}</h1>
            <p className="cb-body rp-lede">
              {lede}{lede ? ' ' : ''}{t('Tap any crop to see the price at every mandi that reported it.')}
            </p>
          </div>
          <div className="rp-controls">
            <label className="rp-state">
              <span className="cb-eyebrow">{t('Find a crop')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('Onion, tur, karela…')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="rp-state">
              <span className="cb-eyebrow">{t('Show rates for')}</span>
              <select value={state} onChange={(e) => { setState(e.target.value); setSelected(null); }}>
                <option value="">{t('All India')}</option>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        {board && query.trim() && shown.length === 0 && (
          <div className="rp-detail-note">
            {state
              ? t('No crop matches “{{q}}” in {{state}} today.', { q: query.trim(), state })
              : t('No crop matches “{{q}}” today.', { q: query.trim() })}
          </div>
        )}

        {failed && (
          <div className="rp-detail-note">{t('Could not load the rates. Check your connection and refresh the page.')}</div>
        )}

        {!board && !failed && <div className="rp-detail-note">{t('Loading mandi rates…')}</div>}

        {board && board.groups.map((group) => {
          const rates = shown.filter((r) => r.group === group.id);
          if (rates.length === 0) return null;
          return (
            <section key={group.id} className="rp-cat">
              <div className="rp-cat-head">
                <span className="cb-eyebrow">
                  {t(GROUP_UNIT[group.id])} · {t(rates.length === 1 ? '{{n}} crop' : '{{n}} crops', { n: rates.length })}
                </span>
                <h2 className="rp-cat-title">{t(group.title)}</h2>
              </div>
              <div className="rp-grid rp-rate-grid">
                {rates.map((r) => {
                  const name = cropName(r);
                  return (
                    // Every number on the card says what it is, so a first-time
                    // reader needs no key: the typical price, the range most
                    // mandis sold in, the change against usual, and where the
                    // figure comes from.
                    <button
                      key={r.commodity}
                      type="button"
                      className={`rp-card rp-rate${selected === r.commodity ? ' active' : ''}`}
                      onClick={() => setSelected(r.commodity)}
                      aria-haspopup="dialog"
                      title={r.state ?? t('All India')}
                    >
                      <div className="rp-rate-head">
                        <span className="rp-rate-emoji" aria-hidden="true">{r.emoji}</span>
                        <div className="rp-rate-names">
                          <div className="rp-rate-name">{name.name}</div>
                          {name.english && <div className="rp-rate-en">{name.english}</div>}
                        </div>
                      </div>

                      <div className="rp-rate-price">
                        {inr(r.modal)}
                        <span className="rp-rate-unit">/{unitLabel(r.unit, t)}</span>
                      </div>
                      <div className="rp-rate-caption">{t('Typical mandi price')}</div>

                      <div className="rp-rate-range">
                        <span>{t('Most mandis')}</span>
                        <strong>{inr(r.min)} – {inr(r.max)}</strong>
                      </div>

                      <Signal r={r} />

                      <div className="rp-rate-foot">
                        <div className="rp-rate-source">{sourceLine(r, t)}</div>
                        <div className="rp-rate-go">{t('See every mandi →')}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {selectedRate && <MandiModal crop={selectedRate} state={state} onClose={closeMandis} />}

        <div className="cb-small rp-foot">
          <p>
            {t('Source: Government of India, Agmarknet daily mandi report (data.gov.in). Prices are wholesale, in ₹ per kg or quintal, as each market committee reported them.')}
          </p>
          <p>
            {t('The big price on each card is the middle of what the mandis reported, and the range under it is where most of them sold.')}
          </p>
          <p>
            {t("“Above usual” and “below usual” compare today's price with the crop's average over up to the last 30 days. Each state is compared with its own past, and the all-India figure is the typical change across states. CropBid began keeping this history on 22 September 2026, so a crop shows no comparison until it has an earlier day. It is a signal, not a forecast.")}
          </p>
        </div>
      </main>

      <CBFooter />
    </div>
  );
}
