// =============================================================================
// Forecast Page — /forecast · demand & supply predictions, next 7 days
// =============================================================================
// The public face of the prediction engine (server/prediction.service.ts).
// For every crop on the rates board: a 7-day price outlook with a forecast
// band, a supply index and a demand index — and, on tap, the exact drivers
// that produced the numbers plus what the forecast means for a farmer and for
// a buyer. The model is deterministic and explainable; this page's job is to
// show its work, never to oversell it. Prices are ₹-native (India feed).
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';

// -----------------------------------------------------------------------------
// Data shapes (mirror server/src/services/prediction.service.ts)
// -----------------------------------------------------------------------------

type Direction = 'rise' | 'hold' | 'ease';

interface Prediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL';
  cat: 'veg' | 'fruits' | 'grains' | 'spices';
  modal: number;
  usual: number;
  changePct: number;
  source: 'market' | 'state' | 'national' | 'reference';
  mandisReporting: number;
  supply: { score: number; level: 'tight' | 'balanced' | 'ample'; drivers: string[] };
  demand: { score: number; level: 'soft' | 'steady' | 'strong'; drivers: string[] };
  outlook: { direction: Direction; pct7d: number; low: number; high: number; confidence: 'high' | 'medium' | 'low' };
  advice: { farmer: string; buyer: string };
  platform: { activeListings: number; listedQty: number; bids14d: number };
}

interface ForecastBoard {
  date: string;
  generatedAt: string;
  horizonDays: number;
  live: boolean;
  predictions: Prediction[];
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const unitLabel = (u: 'KG' | 'QUINTAL') => (u === 'KG' ? 'kg' : 'qtl');

const DIRECTION_META: Record<Direction, { arrow: string; word: string; cls: string }> = {
  rise: { arrow: '▲', word: 'set to rise', cls: 'pos' },
  hold: { arrow: '▬', word: 'holding steady', cls: 'flat' },
  ease: { arrow: '▼', word: 'set to ease', cls: 'neg' },
};

const GROUPS: Array<{ dir: Direction; title: string; eyebrow: string }> = [
  { dir: 'rise', title: 'Set to rise', eyebrow: 'Hold if you can — sellers’ week' },
  { dir: 'ease', title: 'Set to ease', eyebrow: 'Sell sooner — buyers’ week ahead' },
  { dir: 'hold', title: 'Holding steady', eyebrow: 'Negotiate around the modal' },
];

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

// Single-value index meter, 0–100. The level word carries the meaning; the
// bar only shows magnitude — never color-alone.
function IndexMeter({ name, score, level }: { name: string; score: number; level: string }) {
  return (
    <div className="fc-meter">
      <span className="cb-mono fc-meter-name">{name}</span>
      <span className="fc-meter-track" role="img" aria-label={`${name} index ${score} of 100 — ${level}`}>
        <span className="fc-meter-fill" style={{ width: `${score}%` }} />
      </span>
      <span className="fc-meter-level">{level}</span>
    </div>
  );
}

function PredictionCard({ p, open, onToggle }: { p: Prediction; open: boolean; onToggle: () => void }) {
  const d = DIRECTION_META[p.outlook.direction];
  const move = p.outlook.direction === 'hold'
    ? '±1% next 7 days'
    : `${p.outlook.pct7d > 0 ? '+' : ''}${p.outlook.pct7d.toFixed(1)}% next 7 days`;

  return (
    <div className={`fc-card${open ? ' active' : ''}`}>
      <button type="button" className="fc-card-main" onClick={onToggle} aria-expanded={open}>
        <div className="fc-card-top">
          <span className="fc-emoji" aria-hidden="true">{p.emoji}</span>
          <span className="fc-name">{p.label}</span>
          <span className="cb-mono fc-conf">{p.outlook.confidence} confidence</span>
        </div>

        <div className={`fc-dir ${d.cls}`}>
          <span aria-hidden="true">{d.arrow}</span> {move}
        </div>

        <div className="fc-price">
          <span className="fc-price-now">{inr(p.modal)}<span className="u">/{unitLabel(p.unit)}</span> today</span>
          <span className="fc-price-arrow" aria-hidden="true">→</span>
          <span className="cb-mono fc-price-band">{inr(p.outlook.low)}–{inr(p.outlook.high)} in 7d</span>
        </div>

        <div className="fc-meters">
          <IndexMeter name="SUPPLY" score={p.supply.score} level={p.supply.level} />
          <IndexMeter name="DEMAND" score={p.demand.score} level={p.demand.level} />
        </div>

        <span className="fc-more">{open ? 'hide the why ↑' : 'why? see the drivers ↓'}</span>
      </button>

      {open && (
        <div className="fc-detail">
          <div className="fc-drivers">
            <span className="cb-eyebrow">What the model saw</span>
            <ul>
              {[...p.supply.drivers, ...p.demand.drivers].map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="fc-advice">
            <div>
              <span className="cb-mono fc-advice-who">IF YOU'RE SELLING</span>
              <p>{p.advice.farmer}</p>
            </div>
            <div>
              <span className="cb-mono fc-advice-who">IF YOU'RE BUYING</span>
              <p>{p.advice.buyer}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function ForecastPage() {
  const [board, setBoard] = useState<ForecastBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get('/rates/predictions')
      .then(({ data }) => { if (on) { setBoard(data); setFailed(false); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  const counts = board
    ? {
        rise: board.predictions.filter((p) => p.outlook.direction === 'rise').length,
        ease: board.predictions.filter((p) => p.outlook.direction === 'ease').length,
        hold: board.predictions.filter((p) => p.outlook.direction === 'hold').length,
      }
    : null;

  return (
    <div className="cb-landing rp fc">
      {/* slim header — same pattern as the rates page */}
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            Start trading
            <ArrowIcon />
          </Link>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              {board?.live && <span className="cb-live-dot sm" />}
              Prediction engine · demand &amp; supply · next {board?.horizonDays ?? 7} days
            </span>
            <h1 className="cb-h1">Where prices go next{board ? ` · from ${board.date}` : ''}</h1>
            <p className="cb-body rp-lede">
              A transparent model over today's live mandi data: price vs the usual band,
              how many mandis reported arrivals, India's harvest calendar, and live CropBid
              activity. Every number comes with its reasons — tap a crop to see the drivers.
            </p>
          </div>
          {counts && (
            <div className="fc-tally" aria-label="Forecast summary">
              <div className="fc-tally-item"><span className="n pos">{counts.rise}</span><span className="cb-tiny">set to rise</span></div>
              <div className="fc-tally-item"><span className="n flat">{counts.hold}</span><span className="cb-tiny">steady</span></div>
              <div className="fc-tally-item"><span className="n neg">{counts.ease}</span><span className="cb-tiny">set to ease</span></div>
            </div>
          )}
        </div>

        {failed && <div className="rp-detail-note">Could not reach the prediction engine — check your connection and refresh.</div>}
        {!board && !failed && <div className="rp-detail-note">Running the model on today's mandi data…</div>}

        {board && GROUPS.map(({ dir, title, eyebrow }) => {
          const rows = board.predictions.filter((p) => p.outlook.direction === dir);
          if (rows.length === 0) return null;
          return (
            <section key={dir} className="rp-cat">
              <div className="rp-cat-head">
                <span className="cb-eyebrow">{eyebrow}</span>
                <h2 className="rp-cat-title">
                  <span className={`fc-h-arrow ${DIRECTION_META[dir].cls}`} aria-hidden="true">{DIRECTION_META[dir].arrow}</span> {title}
                </h2>
              </div>
              <div className="fc-grid">
                {rows.map((p) => (
                  <PredictionCard
                    key={p.commodity}
                    p={p}
                    open={open === p.commodity}
                    onToggle={() => setOpen(open === p.commodity ? null : p.commodity)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <p className="cb-small rp-foot">
          The forecast is a deterministic model over the Government of India's Agmarknet feed
          (price vs usual, arrival breadth, cross-mandi dispersion), the Indian harvest calendar,
          and live CropBid listings &amp; bids. It is an explainable estimate to negotiate around —
          not a guarantee, and not financial advice. Bands widen when reporting mandis disagree.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
