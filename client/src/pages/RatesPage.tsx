// =============================================================================
// Rates Page — /rates · today's live mandi rates, in full detail
// =============================================================================
// The dedicated public page behind the storefront rates strip: every
// commodity the Government of India's Agmarknet feed reported today (about
// 220 of them, where the storefront strip carries 30), grouped the way a
// buyer looks for them, with today's modal price, the range most mandis sat
// in, and how local the number is. The 30 board crops also carry a vs-usual
// signal; nothing else has a reference price to compare with. Clicking a
// crop opens the market-wise breakdown: every reporting mandi with market,
// district, state, variety, grade and price band. Prices are ₹-native (the
// feed is India-only), so no FX conversion happens here.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';

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
  usual: number | null;      // only the 30 board crops have a reference price
  changePct: number | null;
  mandis: number;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
  date: string;
}

interface AllRates {
  date: string;
  live: boolean;
  complete: boolean;
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

// The eyebrow above each group. Fresh produce is bought by the kilo and
// everything else trades by the quintal; the server picks the same units.
const GROUP_EYEBROW: Record<Group, string> = {
  vegetables: 'Daily wholesale · ₹/kg',
  greens: 'Daily wholesale · ₹/kg',
  fruits: 'Daily wholesale · ₹/kg',
  cereals: 'Daily wholesale · ₹/quintal',
  pulses: 'Daily wholesale · ₹/quintal',
  oilseeds: 'Daily wholesale · ₹/quintal',
  spices: 'Daily wholesale · ₹/quintal',
  dryfruits: 'Daily wholesale · ₹/quintal',
  dairy: 'Daily prices · ₹/L & ₹/kg',
  other: 'Daily wholesale · ₹/quintal',
};

const SOURCE_LABEL: Record<LiveRate['source'], string> = {
  market: 'MANDI',
  state: 'STATE AVG',
  national: 'INDIA AVG',
  reference: 'REFERENCE',
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const unitLabel = (u: 'KG' | 'QUINTAL' | 'LITRE') => (u === 'KG' ? 'kg' : u === 'LITRE' ? 'L' : 'qtl');

function Signal({ r }: { r: LiveRate }) {
  if (r.source === 'reference') return <span className="rp-sig flat">ref</span>;
  // No reference price to compare with, so say how many mandis it rests on.
  if (r.usual === null || r.changePct === null) {
    return <span className="rp-sig flat">{r.mandis} {r.mandis === 1 ? 'mandi' : 'mandis'}</span>;
  }
  if (Math.abs(r.changePct) < 0.1) return <span className="rp-sig flat">steady</span>;
  const up = r.changePct >= 0;
  return (
    <span className={`rp-sig ${up ? 'pos' : 'neg'}`} title={`vs usual ${inr(r.usual)}/${unitLabel(r.unit)}`}>
      {up ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}% vs usual
    </span>
  );
}

// -----------------------------------------------------------------------------
// Market-wise breakdown table for the selected crop
// -----------------------------------------------------------------------------

function MarketTable({ crop, state }: { crop: LiveRate; state: string }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (failed) return <div className="rp-detail-note">Could not load the market breakdown — try again in a moment.</div>;
  if (!data) return <div className="rp-detail-note">Loading every reporting mandi…</div>;
  if (data.count === 0) {
    return (
      <div className="rp-detail-note">
        No mandi reported {crop.label} today{state ? ` in ${state}` : ''} — the card above shows the reference price.
      </div>
    );
  }

  return (
    <div className="rp-table-wrap">
      <div className="rp-table-head">
        <span className="cb-eyebrow">{data.count} mandis reporting {data.label} today{state ? ` · ${state}` : ' · all India'}</span>
        <span className="cb-mono rp-src">₹/{unitLabel(data.unit)} · GOVT. AGMARKNET</span>
      </div>
      {data.excluded > 0 && (
        <p className="rp-excluded">
          {data.excluded} {data.excluded === 1 ? 'report is' : 'reports are'} left out as implausible: a price
          under a tenth or over ten times the typical one, usually a typo or a per-piece price.
        </p>
      )}
      <div className="rp-table-scroll">
        <table className="rp-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>District</th>
              <th>State</th>
              <th>Variety</th>
              <th>Grade</th>
              <th className="num">Min</th>
              <th className="num">Modal</th>
              <th className="num">Max</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((r, i) => (
              <tr key={`${r.market}-${r.variety}-${i}`}>
                <td>{r.market}</td>
                <td>{r.district}</td>
                <td>{r.state}</td>
                <td>{r.variety}</td>
                <td>{r.grade}</td>
                <td className="num">{inr(r.min)}</td>
                <td className="num strong">{inr(r.modal)}</td>
                <td className="num">{inr(r.max)}</td>
                <td className="cb-mono rp-date">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function RatesPage() {
  const [board, setBoard] = useState<AllRates | null>(null);
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

  // Search matches the label and the feed's own name, so "karela", "bitter"
  // and "Bitter gourd" all find it.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!board || !q) return board?.rates ?? [];
    return board.rates.filter((r) => r.label.toLowerCase().includes(q) || r.commodity.toLowerCase().includes(q));
  }, [board, query]);

  const selectedRate = shown.find((r) => r.commodity === selected) ?? null;
  // The picker offers the states that reported today, plus whichever one is
  // picked, so a choice never vanishes from under the person who made it.
  const states = board ? [...new Set([...board.states, ...(state ? [state] : [])])].sort() : [];
  // With a state picked, the board crops it did not report fall back to the
  // national figure; they are on the page but not counted as its reports.
  const reported = board?.rates.filter((r) => (state ? r.source === 'state' : r.source !== 'reference')).length ?? 0;

  return (
    <div className="cb-landing rp">
      {/* slim header */}
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/forecast">Forecast</Link>
          <Link to="/partner" className="nav-signin">Become a partner</Link>
          <SignInLink className="cb-btn cb-btn-primary">
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
              {board?.live ? 'Live' : 'Reference'} · Govt. Agmarknet · 4,600+ regulated mandis
            </span>
            <h1 className="cb-h1">Today's mandi rates{board ? ` · ${board.date}` : ''}</h1>
            <p className="cb-body rp-lede">
              Every crop the government's mandi report carried today
              {reported > 0 ? `, ${reported} of them${state ? ` from ${state}` : ''}` : ''}: the modal
              price and the range most mandis sat in. Pick a crop to see every reporting mandi,
              market by market.
            </p>
          </div>
          <div className="rp-controls">
            <label className="rp-state">
              <span className="cb-eyebrow">Find a crop</span>
              <input
                type="search"
                value={query}
                placeholder="Onion, tur, karela…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="rp-state">
              <span className="cb-eyebrow">Show rates for</span>
              <select value={state} onChange={(e) => { setState(e.target.value); setSelected(null); }}>
                <option value="">All India</option>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        {board?.live && !board.complete && (
          <div className="rp-detail-note">
            Part of today's report is still loading, so some states may be missing for a few minutes.
          </div>
        )}

        {board && query.trim() && shown.length === 0 && (
          <div className="rp-detail-note">
            Nothing matches "{query.trim()}"{state ? ` in ${state}` : ''} today.
          </div>
        )}

        {failed && (
          <div className="rp-detail-note">Could not reach the rates service — check your connection and refresh.</div>
        )}

        {!board && !failed && <div className="rp-detail-note">Loading today's rates…</div>}

        {board && board.groups.map((group) => {
          const rates = shown.filter((r) => r.group === group.id);
          if (rates.length === 0) return null;
          const detail = selectedRate && selectedRate.group === group.id ? selectedRate : null;
          return (
            <section key={group.id} className="rp-cat">
              <div className="rp-cat-head">
                <span className="cb-eyebrow">{GROUP_EYEBROW[group.id]} · {rates.length}</span>
                <h2 className="rp-cat-title">{group.title}</h2>
              </div>
              <div className="rp-grid">
                {rates.map((r) => (
                  <button
                    key={r.commodity}
                    type="button"
                    className={`rp-card${selected === r.commodity ? ' active' : ''}`}
                    onClick={() => setSelected(selected === r.commodity ? null : r.commodity)}
                    title={r.state ?? 'National'}
                  >
                    <div className="rp-card-top">
                      <span className="rp-emoji" aria-hidden="true">{r.emoji}</span>
                      <span className="cb-mono rp-source">{SOURCE_LABEL[r.source]}</span>
                    </div>
                    <div className="rp-name">{r.label}</div>
                    <div className="rp-price">
                      {inr(r.modal)}
                      <span className="rp-unit">/{unitLabel(r.unit)}</span>
                    </div>
                    <div className="cb-mono rp-band">{inr(r.min)} – {inr(r.max)}</div>
                    <Signal r={r} />
                    <span className="rp-more">{selected === r.commodity ? 'hide mandis ↑' : 'see every mandi ↓'}</span>
                  </button>
                ))}
              </div>
              {detail && <MarketTable key={`${detail.commodity}::${state}`} crop={detail} state={state} />}
            </section>
          );
        })}

        <p className="cb-small rp-foot">
          Source: Government of India, Agmarknet daily mandi feed (data.gov.in). Prices are wholesale
          ₹ per kg or quintal as reported by each market committee. The price on each card is the
          middle of what the mandis reported, and the range beneath it is where most of them sat.
          "vs usual" compares today's price with the crop's typical level, and is shown for the 30
          crops we keep a reference price for. It is a signal, not a forecast.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
