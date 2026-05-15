// =============================================================================
// Farmer Analytics — Revenue, crop, and bid performance charts
// =============================================================================

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Package, Gavel, Target } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';

const COLORS = ['#1f2d18', '#6b8e4e', '#8ba869', '#4a6580', '#c9b27a', '#c8602b', '#8b6b8e', '#82806f'];

interface FarmerData {
  summary: {
    totalRevenue: number;
    totalListings: number;
    activeListings: number;
    totalBids: number;
    acceptedBids: number;
    conversionRate: string;
    avgBidsPerListing: string;
  };
  charts: {
    monthlyRevenue: { name: string; value: number }[];
    cropDistribution: { name: string; value: number }[];
    listingStatuses: { name: string; value: number }[];
    monthlyBids: { name: string; value: number }[];
  };
}

export function FarmerAnalytics() {
  const [data, setData] = useState<FarmerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/analytics');
        setData(res.data);
      } catch (err) {
        console.error('Failed to load analytics:', err);
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

  if (!data) {
    return (
      <DashboardLayout>
        <Card><p className="text-center text-text-muted py-8">No analytics data available yet.</p></Card>
      </DashboardLayout>
    );
  }

  const { summary, charts } = data;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Farmer Analytics</h1>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard icon={TrendingUp} label="Total Revenue" value={`₹${summary.totalRevenue.toLocaleString('en-IN')}`} />
          <StatCard icon={Package} label="Total Listings" value={summary.totalListings} />
          <StatCard icon={Package} label="Active" value={summary.activeListings} />
          <StatCard icon={Gavel} label="Total Bids" value={summary.totalBids} />
          <StatCard icon={Target} label="Conversion" value={`${summary.conversionRate}%`} />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Monthly Revenue */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Monthly Revenue (INR)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                <Bar dataKey="value" fill="#1f2d18" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Crop Distribution */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Crop Distribution</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={charts.cropDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {charts.cropDistribution.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bid Activity */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Bid Activity (Monthly)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={charts.monthlyBids}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#6b8e4e" strokeWidth={2} dot={{ r: 4 }} name="Bids" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Listing Status Breakdown */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Listing Status</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={charts.listingStatuses}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {charts.listingStatuses.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-center">
        <Icon className="w-5 h-5 mx-auto mb-1 text-primary" />
        <p className="text-xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </Card>
  );
}
