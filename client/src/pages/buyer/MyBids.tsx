import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidCard } from '../../components/bids/BidCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ShoppingCart } from 'lucide-react';
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
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : bids.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-8 h-8" />}
            title="No bids yet"
            description="Browse listings and place your first bid to get started."
            actionLabel="Browse Listings"
            onAction={() => navigate('/buyer/browse')}
          />
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
