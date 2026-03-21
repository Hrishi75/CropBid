// =============================================================================
// Admin Analytics — Platform-wide trends and metrics
// =============================================================================

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';

const COLORS = ['#1B5E20', '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#607D8B', '#81C784', '#00BCD4', '#795548'];

interface AdminData {
  charts: {
    monthlyGMV: { name: string; value: number }[];
    monthlyRevenue: { name: string; value: number }[];
    monthlySignups: { name: string; value: number }[];
    monthlyListings: { name: string; value: number }[];
    monthlyBids: { name: string; value: number }[];
    topCrops: { name: string; value: number }[];
    roleDistribution: { name: string; value: number }[];
  };
}

export function AdminAnalytics() {
  const [data, setData] = useState<AdminData | null>(null);
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
        <Card><p className="text-center text-text-muted py-8">No analytics data available.</p></Card>
      </DashboardLayout>
    );
  }

  const { charts } = data;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Platform Analytics</h1>
        </div>

        {/* Row 1: GMV and Revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Monthly GMV (INR)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={charts.monthlyGMV}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'GMV']} />
                <Area type="monotone" dataKey="value" stroke="#1B5E20" fill="#1B5E20" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Platform Revenue (fees)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Bar dataKey="value" fill="#4CAF50" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Row 2: Growth metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">User Signups</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={charts.monthlySignups}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#2196F3" strokeWidth={2} dot={{ r: 3 }} name="Signups" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold text-text-primary mb-4">New Listings</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={charts.monthlyListings}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#4CAF50" strokeWidth={2} dot={{ r: 3 }} name="Listings" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Bid Volume</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={charts.monthlyBids}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#FF9800" strokeWidth={2} dot={{ r: 3 }} name="Bids" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Row 3: Distribution charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Top Crops (by listings)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={charts.topCrops} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#1B5E20" radius={[0, 4, 4, 0]} name="Listings" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold text-text-primary mb-4">User Roles</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={charts.roleDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {charts.roleDistribution.map((_, idx) => (
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
