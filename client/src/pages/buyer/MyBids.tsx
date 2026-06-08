// =============================================================================
// MyBids — Buyer's placed bids
// =============================================================================
// Lists the bids this buyer has placed (via /bids/my), filtered by status tabs,
// with a summary of committed/at-risk/won/lost amounts computed client-side.
// Each BidCard (viewAs="buyer") lets the buyer update price or withdraw.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidCard } from '../../components/bids/BidCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Bid } from '../../types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COUNTERED', label: 'Countered' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function MyBids() {
  const navigate = useNavigate();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchBids();
  }, [statusFilter]);

  async function fetchBids() {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/bids/my${params}`);
      setBids(data);
    } catch {
      toast.error('Failed to load bids');
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const s = { committed: 0, atRisk: 0, won: 0, lost: 0, counts: { PENDING: 0, COUNTERED: 0, ACCEPTED: 0, REJECTED: 0 } as Record<string, number> };
    for (const b of bids) {
      s.counts[b.status] = (s.counts[b.status] || 0) + 1;
      if (b.status === 'PENDING' || b.status === 'COUNTERED') s.committed += b.totalAmount;
      if (b.status === 'ACCEPTED') s.won++;
      if (b.status === 'REJECTED') s.lost++;
    }
    return s;
  }, [bids]);

  const currency = bids[0]?.currency || 'INR';
  const pending = summary.counts.PENDING || 0;
  const total = bids.length;
  const winRate = (summary.won + summary.lost) > 0 ? Math.round((summary.won / (summary.won + summary.lost)) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Bids · your portfolio</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        {pending} bids working,<br />
        <span className="cb-italic">{pending} awaiting reply.</span>
      </h1>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 28, marginBottom: 20 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Committed</div>
          <div className="cb-kpi-value">{formatCurrency(summary.committed, currency)}</div>
          <div className="cb-kpi-delta">{pending} lots</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Won</div>
          <div className="cb-kpi-value">{summary.won}</div>
          <div className="cb-kpi-delta pos">{winRate}% win rate</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lost</div>
          <div className="cb-kpi-value">{summary.lost}</div>
          <div className="cb-kpi-delta">{summary.lost > 0 ? 'review reasons' : '—'}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Total</div>
          <div className="cb-kpi-value">{total}</div>
          <div className="cb-kpi-delta">across portfolio</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cb-pill-group">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
              {tab.value && summary.counts[tab.value] !== undefined && (
                <span className="cb-count">{summary.counts[tab.value]}</span>
              )}
            </button>
          ))}
        </div>
        <Link to="/buyer/browse" className="cb-btn cb-btn-primary" style={{ marginLeft: 'auto' }}>
          New bid
          <ArrowIcon />
        </Link>
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={120} />)}
        </div>
      ) : bids.length === 0 ? (
        <EmptyState
          title="No bids yet"
          description="Brief your agent or browse the marketplace to place your first bid."
          actionLabel="Browse marketplace"
          onAction={() => navigate('/buyer/browse')}
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {bids.map((bid) => (
            <BidCard key={bid.id} bid={bid} viewAs="buyer" onUpdate={fetchBids} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
