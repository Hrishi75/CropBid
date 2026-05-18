import { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { MiniChart } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

const COLORS = ['#4a6580', '#1f2d18', '#6b8e4e', '#c9b27a', '#c8602b', '#8b6b8e', '#82806f', '#8ba869'];
const PERIODS = ['7D', '30D', '90D', 'SEASON', 'YTD'];
const SPARK = [4, 6, 5, 7, 6, 9, 8, 11, 10, 13, 12];

interface BuyerData {
  summary: {
    totalSpent: number;
    totalBids: number;
    acceptedBids: number;
    totalDeals: number;
    successRate: string;
  };
  charts: {
    monthlySpending: { name: string; value: number }[];
    procurementMix: { name: string; value: number }[];
    bidStatuses: { name: string; value: number }[];
    monthlyBids: { name: string; value: number }[];
  };
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cb-card">
      <div className="cb-eyebrow" style={{ marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export function BuyerAnalytics() {
  const { user } = useAuth();
  const [data, setData] = useState<BuyerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('90D');
  const currency = user?.currency || 'INR';

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
  const estimatedSavings = summary.totalSpent * 0.016;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Analytics · desk 02</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Procurement,<br />
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

      <div className="cb-card cb-card-forest" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.55)' }}>Savings vs broker · headline</div>
          <div className="cb-mono" style={{ fontSize: 40, fontWeight: 500, color: '#e0cf9e', letterSpacing: '-0.02em', marginTop: 6 }}>
            +{formatCurrency(estimatedSavings, currency)}
          </div>
          <div style={{ color: '#e6efd9', marginTop: 4 }}>1.6% over benchmark · 14× faster bind · 41s median</div>
        </div>
        <MiniChart data={SPARK} color="#9bc97a" width={200} height={50} />
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Spent</div>
          <div className="cb-kpi-value">{formatCurrency(summary.totalSpent, currency)}</div>
          <div className="cb-kpi-delta pos">+18% QoQ</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{summary.totalBids}</div>
          <div className="cb-kpi-delta">↑ 4/d avg</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Accepted</div>
          <div className="cb-kpi-value">{summary.acceptedBids}</div>
          <div className="cb-kpi-delta">{summary.acceptedBids} of {summary.totalBids}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Deals</div>
          <div className="cb-kpi-value">{summary.totalDeals}</div>
          <div className="cb-kpi-delta">settled</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Win rate</div>
          <div className="cb-kpi-value">{summary.successRate}%</div>
          <div className="cb-kpi-delta pos">↑ 2.1 pts</div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <ChartCard title="Spend · monthly">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.monthlySpending} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={11} stroke="#82806f" axisLine={{ stroke: '#d8d4c8' }} tickLine={false} />
              <YAxis fontSize={11} stroke="#82806f" axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v), currency), 'Spent']}
                contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" fill="#1f2d18" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
        <ChartCard title="Procurement mix">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={charts.procurementMix} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value">
                {charts.procurementMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v), currency), 'Spend']}
                contentStyle={{ background: '#fbf9f3', border: '1px solid #d8d4c8', borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Bid outcomes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            {charts.bidStatuses.map((row, i) => {
              const max = Math.max(...charts.bidStatuses.map((r) => r.value), 1);
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
            <Line type="monotone" dataKey="value" stroke="#4a6580" strokeWidth={2} dot={{ r: 3, fill: '#c8602b' }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </DashboardLayout>
  );
}
