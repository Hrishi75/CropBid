import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { SkeletonStats } from '../../components/ui/Skeleton';
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

  const statCards = [
    { label: 'Active Bids', value: stats.activeBids, icon: ShoppingCart, color: 'text-primary' },
    { label: 'Won Deals', value: stats.wonDeals, icon: CheckCircle, color: 'text-accent' },
    { label: 'Total Spent', value: formatCurrency(stats.totalSpent, currency), icon: TrendingUp, color: 'text-text-secondary' },
  ];

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-1">
          Welcome back, {user?.name}
        </h1>
        <p className="text-text-secondary mb-6">
          Find the best crops at competitive prices.
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
            to="/buyer/browse"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">Browse Listings</p>
              <p className="text-sm text-text-muted">Find crops from verified farmers</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/buyer/bids"
            className="flex items-center gap-3 bg-surface rounded-xl p-5 border border-border-light hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text">My Bids</p>
              <p className="text-sm text-text-muted">Track your active bids</p>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
