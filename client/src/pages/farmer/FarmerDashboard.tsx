import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { SkeletonStats } from '../../components/ui/Skeleton';
import { Package, ShoppingCart, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface Stats {
  activeListings: number;
  pendingBids: number;
  totalEarnings: number;
}

export function FarmerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ activeListings: 0, pendingBids: 0, totalEarnings: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [listingsRes, bidsRes, txStatsRes] = await Promise.all([
          api.get('/listings/my'),
          api.get('/bids/incoming'),
          api.get('/transactions/stats'),
        ]);

        const listings = listingsRes.data.listings ?? listingsRes.data;
        const activeListings = Array.isArray(listings)
          ? listings.filter((l: any) => l.status === 'ACTIVE').length
          : 0;

        const bids = Array.isArray(bidsRes.data) ? bidsRes.data : [];
        const pendingBids = bids.filter((b: any) => b.status === 'PENDING').length;

        const totalEarnings = txStatsRes.data.totalRevenue || 0;

        setStats({ activeListings, pendingBids, totalEarnings });
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const currency = user?.currency || 'INR';

  const statCards = [
    { label: 'Active Listings', value: stats.activeListings, icon: Package, color: 'text-primary' },
    { label: 'Pending Bids', value: stats.pendingBids, icon: ShoppingCart, color: 'text-accent' },
    { label: 'Total Earnings', value: formatCurrency(stats.totalEarnings, currency), icon: TrendingUp, color: 'text-text-secondary' },
  ];

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-1">
          Welcome back, {user?.name}
        </h1>
        <p className="text-text-secondary mb-6">
          Here's what's happening on your farm today.
        </p>

        {loading ? (
          <SkeletonStats />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {statCards.map((s) => (
              <div key={s.label} className="bg-surface rounded-xl p-5 border border-border-light hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-text-secondary">{s.label}</p>
                  <s.icon className={`w-5 h-5 ${s.color}`} aria-hidden="true" />
                </div>
                <p className={`text-3xl font-bold ${s.color} mt-1`}>
                  {typeof s.value === 'number' ? s.value : s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/farmer/listings/new"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Create New Listing</p>
              <p className="text-sm text-text-muted">List your crop for sale</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/farmer/bids"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Review Bids</p>
              <p className="text-sm text-text-muted">Accept, reject, or counter offers</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
