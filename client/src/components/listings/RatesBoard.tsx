// =============================================================================
// RatesBoard — today's live mandi rates strip
// =============================================================================
// Fetches /api/rates/board (Government Agmarknet feed) and shows today's real
// wholesale price for each crop as a horizontally-scrolling strip. This is the
// shared anchor a negotiation marketplace needs: buyers and farmers can both
// see what a crop is actually clearing at in the mandis today before they bid.
//
// Degrades quietly — if the feed is down the API returns static reference
// prices (live:false), so the strip is never empty; we just drop the "live"
// dot in that case.
// =============================================================================

import { useEffect, useState } from 'react';
import api from '../../lib/axios';

interface Rate {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL';
  modal: number;
  min: number;
  max: number;
  usual: number;       // the crop's usual reference price
  changePct: number;   // today vs usual, % — the price signal
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface Board {
  date: string;
  live: boolean;
  rates: Rate[];
}

const SOURCE_LABEL: Record<Rate['source'], string> = {
  market: 'MANDI',
  state: 'STATE',
  national: 'INDIA AVG',
  reference: 'REF',
};

function unitLabel(u: Rate['unit']) {
  return u === 'KG' ? 'kg' : 'qtl';
}

function inr(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export function RatesBoard({ state }: { state?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cancellation flag: if the state filter changes while a fetch is in
    // flight, the stale response must not overwrite the newer board.
    let on = true;
    setLoading(true);
    const params = state ? `?state=${encodeURIComponent(state)}` : '';
    api.get(`/rates/board${params}`)
      .then(({ data }) => { if (on) setBoard(data); })
      .catch(() => {})
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [state]);

  if (loading) {
    return (
      <div className="cb-card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="cb-eyebrow">Loading today's mandi rates…</div>
      </div>
    );
  }
  if (!board || board.rates.length === 0) return null;

  return (
    <div className="cb-card" style={{ padding: 16, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {board.live && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cb-forest)', display: 'inline-block' }} />
        )}
        <span className="cb-eyebrow">
          Today's mandi rates {board.live ? '· live' : ''} · {board.date}
        </span>
        <span className="cb-mono cb-tiny" style={{ marginLeft: 'auto', color: 'var(--cb-ink-3)' }}>
          Govt. Agmarknet · ₹ wholesale
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 6,
          scrollbarWidth: 'thin',
        }}
      >
        {board.rates.map((r) => (
          <div
            key={r.commodity}
            style={{
              flex: '0 0 auto',
              minWidth: 128,
              border: '1px solid var(--cb-line)',
              borderRadius: 12,
              padding: '10px 12px',
              background: 'var(--cb-paper)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 18 }}>{r.emoji}</span>
              <span
                className="cb-mono"
                style={{ fontSize: 8.5, letterSpacing: 0.5, color: 'var(--cb-ink-3)' }}
                title={r.market ? `${r.market}${r.state ? ', ' + r.state : ''}` : r.state || 'National average'}
              >
                {SOURCE_LABEL[r.source]}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: 'var(--cb-ink)' }}>{r.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: 'var(--cb-ink)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span>
                {inr(r.modal)}
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--cb-ink-3)' }}> /{unitLabel(r.unit)}</span>
              </span>
              {Math.abs(r.changePct) >= 0.1 && (
                <span
                  className="cb-mono"
                  title={`vs usual ${inr(r.usual)}/${unitLabel(r.unit)}`}
                  style={{ fontSize: 10, color: r.changePct >= 0 ? 'var(--cb-sage)' : 'var(--cb-ember)' }}
                >
                  {r.changePct >= 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
              {inr(r.min)}–{inr(r.max)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
