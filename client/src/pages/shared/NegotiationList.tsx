// =============================================================================
// NegotiationList — All of the user's negotiations
// =============================================================================
// Lists every negotiation (across listings) with a summary strip — in-progress
// count, deals, no-deals, and win rate computed client-side from the data. Tabs
// filter by outcome; each row links into NegotiationChat.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import type { Negotiation } from '../../types';

const OUTCOME_TABS = [
  { value: '', label: 'All' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DEAL', label: 'Deals' },
  { value: 'NO_DEAL', label: 'No deal' },
];

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  IN_PROGRESS: { label: '●●● LIVE', color: 'var(--cb-ember)' },
  DEAL: { label: 'DEAL ●', color: 'var(--cb-sage)' },
  NO_DEAL: { label: 'NO DEAL ●', color: 'var(--cb-ink-3)' },
};

export function NegotiationList() {
  const { user } = useAuth();
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/negotiations');
        setNegotiations(res.data);
      } catch (err) {
        console.error('Failed to load negotiations:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const summary = useMemo(() => {
    const s = { inProgress: 0, deals: 0, noDeal: 0, winRate: 0 };
    for (const n of negotiations) {
      if (n.finalOutcome === 'IN_PROGRESS') s.inProgress++;
      if (n.finalOutcome === 'DEAL') s.deals++;
      if (n.finalOutcome === 'NO_DEAL') s.noDeal++;
    }
    const settled = s.deals + s.noDeal;
    s.winRate = settled > 0 ? Math.round((s.deals / settled) * 100) : 0;
    return s;
  }, [negotiations]);

  const filtered = filter ? negotiations.filter((n) => n.finalOutcome === filter) : negotiations;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Negotiations · agent · {negotiations.length} lifetime</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Your agent's<br />
        <span className="cb-italic">ledger.</span>
      </h1>

      <div className="cb-kpi-strip" style={{ marginTop: 28, marginBottom: 20 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">In progress</div>
          <div className="cb-kpi-value">{summary.inProgress}</div>
          <div className="cb-kpi-delta">{summary.inProgress > 0 ? '●●● live' : '—'}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Deals</div>
          <div className="cb-kpi-value">{summary.deals}</div>
          <div className="cb-kpi-delta pos">settled</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">No deal</div>
          <div className="cb-kpi-value">{summary.noDeal}</div>
          <div className="cb-kpi-delta">walk-aways</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Win rate</div>
          <div className="cb-kpi-value">{summary.winRate}%</div>
          <div className="cb-kpi-delta pos">agent</div>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {OUTCOME_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${filter === tab.value ? 'active' : ''}`}
            onClick={() => setFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={120} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No negotiations yet"
          description="Hand a bid to your agent to start a negotiation. Agent rounds appear here in real time."
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {filtered.map((neg, i) => {
            const meta = OUTCOME_META[neg.finalOutcome];
            const listing = neg.listing;
            const bid = neg.bid;
            const roundCount = Array.isArray(neg.rounds) ? neg.rounds.length : 0;
            const buyerName = neg.bid?.buyer?.name || '—';
            const farmerName = listing?.farmer?.user?.name || '—';
            const isYouBuyer = user?.role === 'BUYER';
            return (
              <Link
                key={neg.id}
                to={`/negotiations/${neg.id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '18px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--cb-line)' : 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      NEG #{neg.id.slice(-6).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      {listing?.cropName || 'Unknown'}{listing?.cropVariety ? ` · ${listing.cropVariety}` : ''}
                    </span>
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="cb-small" style={{ marginBottom: 8 }}>
                  {farmerName} <span style={{ color: 'var(--cb-ink-3)' }}>←→</span> {buyerName}
                  {isYouBuyer && <span style={{ color: 'var(--cb-sage)' }}> (YOU)</span>}
                </div>
                <div className="cb-tiny">
                  {roundCount} round{roundCount === 1 ? '' : 's'}
                  {bid && (
                    <>
                      {' · initial '}
                      <span className="cb-mono">{formatCurrency(bid.bidPricePerUnit, bid.currency)}/{listing?.unit?.toLowerCase() || 'unit'}</span>
                    </>
                  )}
                </div>
                <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 6 }}>
                  Open thread →
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
