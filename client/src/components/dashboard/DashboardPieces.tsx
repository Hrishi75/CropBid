// =============================================================================
// DashboardPieces — shared building blocks for the farmer & buyer dashboards
// =============================================================================
// Every value rendered here comes from a live endpoint. Nothing on a dashboard
// is illustrative: when a feed is empty we say so rather than showing a sample,
// because a made-up bid or price is indistinguishable from a real one once it
// is on screen.
// =============================================================================

import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UNIT_LABEL, type UnitCode } from '../../pages/landing/shared';
import api from '../../lib/axios';

// -----------------------------------------------------------------------------
// Kpi — one headline number. `hint` is only for context that is itself factual
// (a unit, a qualifier); it is not a place for an unmeasured trend.
// -----------------------------------------------------------------------------
// `unavailable` exists because a KPI's initial value is 0, and rendering that
// after a failed fetch states a fact — "you have earned nothing" — that we do
// not know to be true. Zero and "we couldn't ask" must not look identical.
export function Kpi({ label, value, hint, loading, unavailable }: {
  label: string;
  value: ReactNode;
  hint?: string;
  loading?: boolean;
  unavailable?: boolean;
}) {
  return (
    <div className="cb-kpi-cell">
      <div className="cb-kpi-label">{label}</div>
      <div className="cb-kpi-value" style={unavailable ? { color: 'var(--cb-ink-3)' } : undefined}>
        {loading || unavailable ? '—' : value}
      </div>
      {(unavailable || hint) && (
        <div className="cb-kpi-delta">{unavailable ? 'unavailable' : hint}</div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section — eyebrow + heading + optional trailing link, used above each block
// -----------------------------------------------------------------------------
export function Section({ eyebrow, title, action, children }: {
  eyebrow: string;
  title: string;
  action?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div className="cb-section-head">
        <div>
          <div className="cb-eyebrow">{eyebrow}</div>
          <h2 className="cb-h3" style={{ marginTop: 8 }}>{title}</h2>
        </div>
        {action && <Link to={action.to} className="cb-btn cb-btn-link">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

// -----------------------------------------------------------------------------
// EmptyState — what a section shows before there is anything real in it
// -----------------------------------------------------------------------------
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="cb-card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--cb-ink-3)', fontSize: 14 }}>
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// AgentCard — the negotiation agent's real state, from /agent/config
// -----------------------------------------------------------------------------
// The agent is created inactive and stays that way until the user turns it on,
// so the card leads with whether it is actually running. Bounds are shown only
// when they have been set; an unset bound reads as "not set", never as a number.
// -----------------------------------------------------------------------------

interface AgentConfig {
  active: boolean;
  autoNegotiate: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  negotiationStyle: string;
}

export function AgentCard({ role, watching }: { role: 'FARMER' | 'BUYER'; watching: number }) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/agent/config')
      .then((res) => { if (!cancelled) setConfig(res.data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Pre-load is also not "off". `config` starts null, so during ordinary
  // latency or a token refresh the card would render AGENT · OFF and offer to
  // set up an agent the user already has running. Only a config that actually
  // arrived with active:false may say OFF.
  if (!failed && config === null) {
    return (
      <div className="cb-card cb-card-forest" style={{ marginBottom: 24 }}>
        <div className="cb-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: '#e6efd9' }}>
          AGENT · CHECKING…
        </div>
      </div>
    );
  }

  // A failed load used to fall through to `config?.active ?? false` and render
  // AGENT · OFF with a "turn it on" prompt. A timeout would therefore tell a
  // user with a live, actively-negotiating agent that it was switched off —
  // and invite them to "set it up" again. Unknown is its own state.
  if (failed) {
    return (
      <div className="cb-card cb-card-forest" style={{ marginBottom: 24 }}>
        <div className="cb-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: '#e6efd9', marginBottom: 10 }}>
          AGENT · UNAVAILABLE
        </div>
        <div style={{ fontSize: 14, color: '#e6efd9' }}>
          Couldn't reach the agent service, so its current state is unknown.
          Any negotiation already running is unaffected.
        </div>
      </div>
    );
  }

  const on = config?.active ?? false;
  const bound = role === 'FARMER' ? config?.minPrice : config?.maxPrice;
  const boundLabel = role === 'FARMER' ? 'Floor' : 'Ceiling';
  const noun = role === 'FARMER' ? 'lots' : 'bids';

  return (
    <div className="cb-card cb-card-forest" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        {on && <span className="cb-live-dot" />}
        <span className="cb-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: '#e6efd9' }}>
          AGENT · {on ? 'ACTIVE' : 'OFF'}
          {on && ` · negotiating ${watching} ${noun}`}
        </span>
      </div>
      <div style={{ fontSize: 14, color: '#e6efd9', marginBottom: 14 }}>
        {on ? (
          <>
            {config?.negotiationStyle
              ? `${config.negotiationStyle.charAt(0)}${config.negotiationStyle.slice(1).toLowerCase()} strategy`
              : 'Strategy set'}
            {' · '}
            {boundLabel} {bound != null ? `₹${bound.toLocaleString('en-IN')}` : 'not set'}
          </>
        ) : (
          `Your agent is off. Turn it on to negotiate ${noun} for you automatically.`
        )}
      </div>
      <Link
        to="/agent"
        className="cb-btn cb-btn-ghost"
        style={{ background: 'rgba(255,255,255,0.08)', color: '#e6efd9', borderColor: 'rgba(255,255,255,0.2)' }}
      >
        {on ? 'Configure agent' : 'Set up agent'} →
      </Link>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MarketRates — today's mandi board, straight from /rates/board
// -----------------------------------------------------------------------------
// `crops` narrows the board to the crops the user actually deals in; when none
// of them are reporting today we fall back to the first few rows of the board
// so the card still carries a real price rather than an empty shell.
// -----------------------------------------------------------------------------

interface LiveRate {
  commodity: string;
  label: string;
  unit: UnitCode;
  modal: number;
  changePct: number;
  market: string | null;
  state: string | null;
}

export function MarketRates({ crops = [], limit = 4 }: { crops?: string[]; limit?: number }) {
  const [rates, setRates] = useState<LiveRate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/rates/board')
      .then((res) => { if (!cancelled) setRates(res.data.rates ?? []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return <EmptyState>Rates are unavailable right now.</EmptyState>;
  if (!rates) return <EmptyState>Loading today's rates…</EmptyState>;
  if (rates.length === 0) return <EmptyState>No mandi rates reported today.</EmptyState>;

  // Listing crop names and rate-board commodity names are different naming
  // schemes — a lot called "Lady Finger" never equals the board's
  // "Bhindi(Ladies Finger)". Falling back to the unfiltered board when nothing
  // matches put arbitrary commodities under a heading that promises "rates for
  // YOUR crops", which is worse than showing nothing: a farmer could price
  // against a crop they don't grow.
  //
  // No crops at all is a different case — there is nothing to mismatch, so the
  // general board is honest there and stays.
  const wanted = crops.map((c) => c.toLowerCase());
  const mine = rates.filter((r) => wanted.includes(r.commodity.toLowerCase()));

  if (crops.length > 0 && mine.length === 0) {
    return (
      <EmptyState>
        No mandi rates today for {crops.length === 1 ? crops[0] : 'your crops'}.{' '}
        <Link to="/rates" style={{ color: 'var(--cb-forest)' }}>See the full board →</Link>
      </EmptyState>
    );
  }

  const shown = (crops.length > 0 ? mine : rates).slice(0, limit);

  return (
    <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
      {shown.map((r, i) => (
        <div
          key={r.commodity}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: 16, padding: '14px 20px',
            borderBottom: i < shown.length - 1 ? '1px solid var(--cb-line)' : 'none',
          }}
        >
          <span style={{ fontWeight: 500 }}>{r.label}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="cb-mono">₹{r.modal.toLocaleString('en-IN')}/{UNIT_LABEL[r.unit] ?? r.unit}</span>
            <span
              className="cb-mono cb-tiny"
              style={{ color: r.changePct >= 0 ? 'var(--cb-sage)' : 'var(--cb-ember)', minWidth: 52, textAlign: 'right' }}
            >
              {r.changePct >= 0 ? '+' : '−'}{Math.abs(r.changePct).toFixed(1)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
