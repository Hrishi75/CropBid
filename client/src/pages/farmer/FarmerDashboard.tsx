import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
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

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">
          Welcome back, {user?.name}
        </h1>
        <p className="text-text-secondary mb-6">
          Here's what's happening on your farm today.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Active Listings</p>
              <Package className="w-5 h-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-primary mt-1">
              {loading ? '—' : stats.activeListings}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Pending Bids</p>
              <ShoppingCart className="w-5 h-5 text-accent" />
            </div>
            <p className="text-3xl font-bold text-accent mt-1">
              {loading ? '—' : stats.pendingBids}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Total Earnings</p>
              <TrendingUp className="w-5 h-5 text-text-secondary" />
            </div>
            <p className="text-3xl font-bold text-text mt-1">
              {loading ? '—' : formatCurrency(stats.totalEarnings, currency)}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/farmer/listings/new"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Create New Listing</p>
              <p className="text-sm text-text-muted">List your crop for sale</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted" />
          </Link>
          <Link
            to="/farmer/bids"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Review Bids</p>
              <p className="text-sm text-text-muted">Accept, reject, or counter offers</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted" />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
