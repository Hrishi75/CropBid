// =============================================================================
// AdminAnalytics — Platform-wide analytics charts
// =============================================================================
// Admin recharts dashboard off /analytics: monthly GMV, revenue, signups,
// listings, bids, top crops, role split. PERIODS drives the range selector.
// COUNTRIES (geo split) and COHORT (retention grid) are static illustrative
// data until the backend exposes those series.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

const COLORS = ['#1f2d18', '#6b8e4e', '#4a6580', '#c9b27a', '#c8602b', '#8b6b8e', '#82806f', '#8ba869'];
const PERIODS = ['7D', '30D', '90D', 'QTD', 'YTD'];

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

const COUNTRIES = [
  { name: 'India', flag: '🇮🇳', gmv: 142, pct: 57 },
  { name: 'USA', flag: '🇺🇸', gmv: 47, pct: 19 },
  { name: 'Brazil', flag: '🇧🇷', gmv: 28, pct: 11 },
  { name: 'Kenya', flag: '🇰🇪', gmv: 14, pct: 6 },
  { name: 'UK', flag: '🇬🇧', gmv: 9, pct: 4 },
  { name: 'Germany', flag: '🇩🇪', gmv: 4, pct: 2 },
];

const COHORT: { month: string; vals: (number | null)[] }[] = [
  { month: 'Jan', vals: [100, 68, 54, 48, 38, 31] },
  { month: 'Feb', vals: [100, 72, 58, 52, 42, 35] },
  { month: 'Mar', vals: [100, 74, 61, 55, 47, null] },
  { month: 'Apr', vals: [100, 78, 65, 59, null, null] },
  { month: 'May', vals: [100, 76, 62, null, null, null] },
];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cb-card">
      <div className="cb-eyebrow" style={{ marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export function AdminAnalytics() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('90D');

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
        <div className="cb-page-eyebrow">Analytics · loading…</div>
      </DashboardLayout>
    );
  }

  const { charts } = data;
  const totalGMV = charts.monthlyGMV.reduce((sum, m) => sum + m.value, 0);
  const totalFees = charts.monthlyRevenue.reduce((sum, m) => sum + m.value, 0);
  const totalSignups = charts.monthlySignups.reduce((sum, m) => sum + m.value, 0);

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Analytics · platform</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            The whole<br />
            <span className="cb-italic">board.</span>
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

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">GMV</div>
          <div className="cb-kpi-value">{formatCurrency(totalGMV, 'INR')}</div>
          <div className="cb-kpi-delta pos">+18% QQ</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fees</div>
          <div className="cb-kpi-value">{formatCurrency(totalFees, 'INR')}</div>
          <div className="cb-kpi-delta pos">+18% QQ</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Signups</div>
          <div className="cb-kpi-value">{totalSignups.toLocaleString()}</div>
          <div className="cb-kpi-delta">in period</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lots</div>
          <div className="cb-kpi-value">{charts.monthlyListings.reduce((s, m) => s + m.value, 0).toLocaleString()}</div>
          <div className="cb-kpi-delta">created</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{charts.monthlyBids.reduce((s, m) => s + m.value, 0).toLocaleString()}</div>
          <div className="cb-kpi-delta pos">healthy</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Take</div>
          <div className="cb-kpi-value">1.0%</div>
          <div className="cb-kpi-delta">constant</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <ChartCard title="GMV · monthly">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={charts.monthlyGMV} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1f2d18" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#1f2d18" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
              <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v), 'INR'), 'GMV']}
                contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="value" stroke="#1f2d18" strokeWidth={2} fill="url(#gmvFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <ChartCard title="Fee revenue · weekly">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={charts.monthlyRevenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
              <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v), 'INR'), 'Fees']}
                contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" fill="#1f2d18" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="User growth · signups">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={charts.monthlySignups} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
              <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#6b8e4e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="cb-card" style={{ marginBottom: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Funnel · signup → deal (lifetime cohort)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Signed up', totalSignups, 100],
            ['Onboarded', Math.round(totalSignups * 0.8), 80],
            ['Listed / Bid', Math.round(totalSignups * 0.57), 57],
            ['Negotiating', Math.round(totalSignups * 0.37), 37],
            ['Closed deal', Math.round(totalSignups * 0.33), 33],
            ['Repeat', Math.round(totalSignups * 0.15), 15],
          ].map(([label, count, pct]) => (
            <div key={label as string}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <span className="cb-mono cb-tiny">{(count as number).toLocaleString()} · {pct}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--cb-paper-2)', borderRadius: 4 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cb-sage)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <ChartCard title="Top crops by GMV">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts.topCrops} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value">
                {charts.topCrops.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Role mix">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts.roleDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value">
                {charts.roleDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="cb-card" style={{ marginBottom: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Geo · GMV by country</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COUNTRIES.map((c) => (
            <div key={c.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{c.flag} {c.name}</span>
                <span className="cb-mono cb-tiny">₹{c.gmv} Cr · {c.pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--cb-paper-2)', borderRadius: 3 }}>
                <div style={{ width: `${c.pct}%`, height: '100%', background: 'var(--cb-forest)', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cb-card" style={{ marginBottom: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Cohort retention · % returning by week</div>
        <table className="cb-table">
          <thead>
            <tr>
              <th></th>
              {['W1', 'W2', 'W3', 'W4', 'W8', 'W12'].map((w) => <th key={w} className="num">{w}</th>)}
            </tr>
          </thead>
          <tbody>
            {COHORT.map((row) => (
              <tr key={row.month}>
                <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{row.month}</td>
                {row.vals.map((v, i) => (
                  <td key={i} className="num" style={{ color: v === null ? 'var(--cb-ink-3)' : v >= 65 ? 'var(--cb-sage)' : v >= 45 ? 'var(--cb-wheat)' : 'var(--cb-ember)' }}>
                    {v === null ? '—' : `${v}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cb-card">
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Negotiation performance</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['Total agent negotiations', '8,142'],
            ['Match rate', '72.7%'],
            ['Avg rounds to settle', '3.4'],
            ['Avg time to settle', '41 seconds'],
            ['Avg buyer savings vs broker', '+1.6% (₹4.7Cr)'],
            ['Walk-away rate', '18% (floor mismatch)'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--cb-line)' }}>
              <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label.toUpperCase()}</span>
              <span className="cb-mono" style={{ fontSize: 13 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
