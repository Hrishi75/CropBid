// =============================================================================
// IncomingBids — Bids received on the farmer's listings
// =============================================================================
// Lists bids buyers have placed (via /bids/incoming), filtered by status tabs
// with live counts. Each BidCard (viewAs="farmer") lets the farmer accept,
// counter, or reject; onUpdate refetches the list.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidCard } from '../../components/bids/BidCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
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

export function IncomingBids() {
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
      const { data } = await api.get(`/bids/incoming${params}`);
      setBids(data);
    } catch {
      toast.error('Failed to load bids');
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const c = { PENDING: 0, COUNTERED: 0, ACCEPTED: 0, REJECTED: 0 } as Record<string, number>;
    for (const b of bids) {
      c[b.status] = (c[b.status] || 0) + 1;
    }
    return c;
  }, [bids]);

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Bids · incoming</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        {counts.PENDING || 0} buyers want<br />
        <span className="cb-italic">your call.</span>
      </h1>

      <div className="cb-pill-group" style={{ marginTop: 28, marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
            {tab.value && counts[tab.value] !== undefined && (
              <span className="cb-count">{counts[tab.value]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : bids.length === 0 ? (
        <EmptyState
          title="No bids yet"
          description="Once buyers start bidding on your listings, they'll appear here. Your agent will route them by priority."
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {bids.map((bid) => (
            <BidCard key={bid.id} bid={bid} viewAs="farmer" onUpdate={fetchBids} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
