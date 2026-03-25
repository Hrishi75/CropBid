import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ShoppingCart, CheckCircle, TrendingUp, Search, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface Stats {
  activeBids: number;
  wonDeals: number;
  totalSpent: number;
}

export function BuyerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ activeBids: 0, wonDeals: 0, totalSpent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [bidsRes, txStatsRes] = await Promise.all([
          api.get('/bids/my'),
          api.get('/transactions/stats'),
        ]);

        const bids = Array.isArray(bidsRes.data) ? bidsRes.data : [];
        const activeBids = bids.filter((b: any) => b.status === 'PENDING' || b.status === 'COUNTERED').length;

        const wonDeals = txStatsRes.data.released || 0;
        const totalSpent = txStatsRes.data.totalRevenue || 0;

        setStats({ activeBids, wonDeals, totalSpent });
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
          Find the best crops at competitive prices.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Active Bids</p>
              <ShoppingCart className="w-5 h-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-primary mt-1">
              {loading ? '—' : stats.activeBids}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Won Deals</p>
              <CheckCircle className="w-5 h-5 text-accent" />
            </div>
            <p className="text-3xl font-bold text-accent mt-1">
              {loading ? '—' : stats.wonDeals}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-text-secondary">Total Spent</p>
              <TrendingUp className="w-5 h-5 text-text-secondary" />
            </div>
            <p className="text-3xl font-bold text-text mt-1">
              {loading ? '—' : formatCurrency(stats.totalSpent, currency)}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/buyer/browse"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Browse Listings</p>
              <p className="text-sm text-text-muted">Find crops from verified farmers</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted" />
          </Link>
          <Link
            to="/buyer/bids"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">My Bids</p>
              <p className="text-sm text-text-muted">Track your active bids</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted" />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
