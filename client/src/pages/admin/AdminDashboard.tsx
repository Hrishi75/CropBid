// =============================================================================
// Admin Dashboard — Platform overview with live stats
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Package, Receipt, DollarSign, TrendingUp,
  Gavel, Bot, ArrowRight,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';

interface PlatformStats {
  users: { total: number; farmers: number; buyers: number };
  listings: { total: number; active: number };
  bids: { total: number };
  transactions: { total: number; inEscrow: number; completed: number };
  negotiations: { total: number };
  financial: { gmv: number; platformRevenue: number };
}

export function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const s = stats!;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Admin Dashboard</h1>

        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Users} label="Total Users" value={s.users.total} color="text-primary" />
          <StatCard icon={Package} label="Active Listings" value={s.listings.active} color="text-accent" />
          <StatCard icon={Receipt} label="Transactions" value={s.transactions.total} color="text-status-info" />
          <StatCard
            icon={DollarSign}
            label="GMV"
            value={`₹${s.financial.gmv.toLocaleString('en-IN')}`}
            color="text-status-success"
          />
        </div>

        {/* Detail cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Users breakdown */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Users className="w-4 h-4" /> Users
              </h3>
              <Link to="/admin/users" className="text-xs text-primary hover:underline flex items-center gap-1">
                Manage <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Farmers</span>
                <span className="font-medium">{s.users.farmers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Buyers</span>
                <span className="font-medium">{s.users.buyers}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-text-muted">Total</span>
                <span className="font-semibold">{s.users.total}</span>
              </div>
            </div>
          </Card>

          {/* Listings breakdown */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Package className="w-4 h-4" /> Listings
              </h3>
              <Link to="/admin/listings" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Active</span>
                <span className="font-medium text-status-success">{s.listings.active}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total (all time)</span>
                <span className="font-medium">{s.listings.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total Bids</span>
                <span className="font-medium">{s.bids.total}</span>
              </div>
            </div>
          </Card>

          {/* Financial breakdown */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Financial
              </h3>
              <Link to="/admin/transactions" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">In Escrow</span>
                <span className="font-medium text-status-warning">{s.transactions.inEscrow}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Completed</span>
                <span className="font-medium text-status-success">{s.transactions.completed}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-text-muted">Platform Revenue</span>
                <span className="font-semibold text-primary">
                  ₹{s.financial.platformRevenue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* AI stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4" /> AI Negotiations
            </h3>
            <p className="text-3xl font-bold text-primary">{s.negotiations.total}</p>
            <p className="text-xs text-text-muted">Total AI-powered negotiations</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-2">
              <Gavel className="w-4 h-4" /> Bid Activity
            </h3>
            <p className="text-3xl font-bold text-accent">{s.bids.total}</p>
            <p className="text-xs text-text-muted">Total bids placed on the platform</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <div className="text-center">
        <Icon className={`w-6 h-6 mx-auto mb-1 ${color}`} />
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </Card>
  );
}
