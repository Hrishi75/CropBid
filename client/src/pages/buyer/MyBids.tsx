import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidCard } from '../../components/bids/BidCard';
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

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">My Bids</h1>
        <p className="text-text-secondary text-sm mb-6">
          Track the status of your bids across all listings
        </p>

        {/* Status tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                ${statusFilter === tab.value
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text-secondary hover:bg-surface-hover'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : bids.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">📋</p>
            <h2 className="text-xl font-semibold text-text mb-2">No bids yet</h2>
            <p className="text-text-secondary">
              Browse listings and place your first bid to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bids.map((bid) => (
              <BidCard key={bid.id} bid={bid} viewAs="buyer" onUpdate={fetchBids} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
