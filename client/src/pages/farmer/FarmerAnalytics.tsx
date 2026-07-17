// =============================================================================
// FarmerAnalytics — Farmer performance charts
// =============================================================================
// Dashboard of recharts visualizations off /analytics: monthly revenue, crop
// distribution, listing statuses, monthly bids, plus summary KPIs (revenue,
// conversion rate, avg bids/listing). PERIODS drives the time-range selector.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

const COLORS = ['#1f2d18', '#6b8e4e', '#8ba869', '#c9b27a', '#c8602b', '#4a6580', '#8b6b8e', '#82806f'];

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

const PERIODS = ['7D', '30D', '90D', 'SEASON', 'YTD'];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cb-card">
      <div className="cb-eyebrow" style={{ marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export function FarmerAnalytics() {
  const [data, setData] = useState<FarmerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('SEASON');
  // Analytics aggregate ₹-native records — always label them as ₹.
  const currency = 'INR';

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

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Analytics · loading</div>
      </DashboardLayout>
    );
  }

  const { summary, charts } = data;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Analytics · season {new Date().getFullYear()}</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Your season,<br />
            <span className="cb-italic">measured.</span>
          </h1>
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">Export ↓ CSV</button>
      </div>

      <div className="cb-pill-group" style={{ marginTop: 8, marginBottom: 24 }}>
        {PERIODS.map((p) => (
          <button key={p} type="button" className={`cb-pill ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Revenue</div>
          <div className="cb-kpi-value">{formatCurrency(summary.totalRevenue, currency)}</div>
          <div className="cb-kpi-delta pos">+12% YoY</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lots listed</div>
          <div className="cb-kpi-value">{summary.totalListings}</div>
          <div className="cb-kpi-delta">{summary.activeListings} active</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{summary.totalBids}</div>
          <div className="cb-kpi-delta">{summary.avgBidsPerListing}/lot avg</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Conversion</div>
          <div className="cb-kpi-value">{summary.conversionRate}%</div>
          <div className="cb-kpi-delta pos">{summary.acceptedBids} matched</div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <ChartCard title="Revenue · monthly">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.monthlyRevenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
              <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v), currency), 'Revenue']}
                contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" fill="#1f2d18" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
        <ChartCard title="Crop mix · revenue">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={charts.cropDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value">
                {charts.cropDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Status · lots">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            {charts.listingStatuses.map((row, i) => {
              const max = Math.max(...charts.listingStatuses.map((r) => r.value), 1);
              const pct = (row.value / max) * 100;
              return (
                <div key={row.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-2)' }}>{row.name.toUpperCase()}</span>
                    <span className="cb-mono cb-tiny">{row.value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--cb-paper-2)', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Bid activity · monthly">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={charts.monthlyBids} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
            <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="#6b8e4e" strokeWidth={2} dot={{ r: 3, fill: '#c8602b' }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </DashboardLayout>
  );
}
