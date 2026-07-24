// =============================================================================
// MyOffers — Farmer's responses to buyer requirements
// =============================================================================
// Every offer this farmer has sent, grouped by status tabs (same shape as
// IncomingBids). Covers both kinds:
//   INSTANT — filled at the buyer's posted price; already ACCEPTED, with a
//             transaction to open
//   COUNTER — awaiting the buyer, or already decided
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { RequirementOfferCard } from '../../components/requirements/RequirementOfferCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { RequirementOffer } from '../../types';

const STATUS_TABS = [
  { value: 'PENDING', label: 'Awaiting buyer' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: '', label: 'All' },
];

export function MyOffers() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<RequirementOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PENDING');

  useEffect(() => { fetchOffers(); }, []);

  async function fetchOffers() {
    setLoading(true);
    try {
      const { data } = await api.get('/requirements/offers/my');
      setOffers(data);
    } catch {
      toast.error('Failed to load offers');
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': offers.length };
    for (const o of offers) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [offers]);

  const visible = useMemo(
    () => (tab ? offers.filter((o) => o.status === tab) : offers),
    [offers, tab],
  );

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Offers</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        What you've <span className="cb-italic">offered.</span>
      </h1>
      <p className="cb-page-lede">
        Your responses to buyer requirements — filled outright, or waiting on the buyer.
      </p>

      <div style={{ margin: '24px 0 20px' }}>
        <div className="cb-pill-group">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`cb-pill ${tab === t.value ? 'active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}{counts[t.value] ? ` (${counts[t.value]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={offers.length === 0 ? 'No offers yet' : 'Nothing in this tab'}
          description={
            offers.length === 0
              ? 'Browse open buyer requirements and fill one at the posted price, or counter with your own.'
              : 'Try another status tab.'
          }
          actionLabel={offers.length === 0 ? 'Browse requirements' : undefined}
          onAction={offers.length === 0 ? () => navigate('/farmer/requirements') : undefined}
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {visible.map((o) => (
            <RequirementOfferCard key={o.id} offer={o} viewAs="farmer" onUpdate={fetchOffers} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
