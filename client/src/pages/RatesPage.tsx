// =============================================================================
// Rates Page — /rates · today's live mandi rates, in full detail
// =============================================================================
// The dedicated public page behind the storefront rates strip: every crop on
// the board, grouped by category, with today's modal price, the min–max
// wholesale band, the vs-usual signal, and how local the number is. Clicking
// a crop opens the market-wise breakdown — every reporting mandi with market,
// district, state, variety, grade and price band, straight from the
// Government of India's Agmarknet feed. Prices are ₹-native (the feed is
// India-only), so no FX conversion happens here.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';

// -----------------------------------------------------------------------------
// Data shapes (mirror server/src/services/rates.service.ts)
// -----------------------------------------------------------------------------

type Cat = 'veg' | 'fruits' | 'grains' | 'spices';

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL';
  cat: Cat;
  modal: number;
  min: number;
  max: number;
  usual: number;
  changePct: number;
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
  date: string;
}

interface Board { date: string; live: boolean; rates: LiveRate[]; }

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
  unit: 'KG' | 'QUINTAL';
  count: number;
  records: MarketRow[];
}

const CATS: Array<{ id: Cat; title: string; eyebrow: string }> = [
  { id: 'veg',    title: 'Fresh Vegetables',  eyebrow: 'Daily wholesale · ₹/kg' },
  { id: 'fruits', title: 'Seasonal Fruits',   eyebrow: 'Daily wholesale · ₹/kg' },
  { id: 'grains', title: 'Grains & Pulses',   eyebrow: 'Daily wholesale · ₹/quintal' },
  { id: 'spices', title: 'Spices & Oilseeds', eyebrow: 'Daily wholesale · ₹/quintal' },
];

const SOURCE_LABEL: Record<LiveRate['source'], string> = {
  market: 'MANDI',
  state: 'STATE AVG',
  national: 'INDIA AVG',
  reference: 'REFERENCE',
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const unitLabel = (u: 'KG' | 'QUINTAL') => (u === 'KG' ? 'kg' : 'qtl');

function Signal({ r }: { r: LiveRate }) {
  if (r.source === 'reference') return <span className="rp-sig flat">ref</span>;
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
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get(`/rates/board${state ? `?state=${encodeURIComponent(state)}` : ''}`)
      .then(({ data }) => { if (on) { setBoard(data); setFailed(false); } })
      .catch(() => { if (on) { setBoard(null); setFailed(true); } });
    return () => { on = false; };
  }, [state]);

  const selectedRate = board?.rates.find((r) => r.commodity === selected) ?? null;

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
          <Link to="/how-it-works">How it works</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            Start trading
            <ArrowIcon />
          </Link>
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
              The same wholesale numbers the trade reads — modal price, the min–max band, and
              where today sits against the usual. Pick a crop to see every reporting mandi,
              market by market.
            </p>
          </div>
          <label className="rp-state">
            <span className="cb-eyebrow">Show rates for</span>
            <select value={state} onChange={(e) => { setState(e.target.value); setSelected(null); }}>
              <option value="">All India</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {failed && (
          <div className="rp-detail-note">Could not reach the rates service — check your connection and refresh.</div>
        )}

        {!board && !failed && <div className="rp-detail-note">Loading today's rates…</div>}

        {board && CATS.map((cat) => {
          const rates = board.rates.filter((r) => r.cat === cat.id);
          if (rates.length === 0) return null;
          const detail = selectedRate && selectedRate.cat === cat.id ? selectedRate : null;
          return (
            <section key={cat.id} className="rp-cat">
              <div className="rp-cat-head">
                <span className="cb-eyebrow">{cat.eyebrow}</span>
                <h2 className="rp-cat-title">{cat.title}</h2>
              </div>
              <div className="rp-grid">
                {rates.map((r) => (
                  <button
                    key={r.commodity}
                    type="button"
                    className={`rp-card${selected === r.commodity ? ' active' : ''}`}
                    onClick={() => setSelected(selected === r.commodity ? null : r.commodity)}
                    title={r.market ? `${r.market}${r.state ? ', ' + r.state : ''}` : r.state ?? 'National average'}
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
          ₹ per {`kg / quintal`} as reported by each market committee. "vs usual" compares today's
          modal price with the crop's typical reference level — a signal, not a forecast.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
