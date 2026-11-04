// =============================================================================
// AdminAnalytics — Platform-wide analytics charts
// =============================================================================
// Admin recharts dashboard off /analytics: monthly GMV, revenue, signups,
// listings, bids, top crops, role split, the signup-to-deal funnel and what
// the negotiation agents have done.
//
// Every figure here comes from the server. The page used to carry typed-in
// numbers beside the real ones: "+18% QQ" growth, a 1% take (the fee is 2%),
// a funnel worked out as fixed shares of signups, a GMV split across six
// countries, a retention grid and a card of agent results. They are gone, as
// is a 7D/30D/90D picker that changed nothing. A country split and retention
// come back when the server can count them.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import { LoadFailed } from './LoadFailed';

const COLORS = ['#1f2d18', '#6b8e4e', '#4a6580', '#c9b27a', '#c8602b', '#8b6b8e', '#82806f', '#8ba869'];

interface AdminData {
  feePercent: number;
  funnel: { signedUp: number; applied: number; approved: number; dealt: number; repeat: number };
  negotiations: {
    total: number; deals: number; noDeals: number; inProgress: number;
    avgRounds: number | null; avgSecondsToDeal: number | null;
  };
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

// "12 (60%)" of the finished negotiations, or the bare count before any.
function share(n: number, of: number) {
  return of > 0 ? `${n.toLocaleString()} (${Math.round((n / of) * 100)}%)` : n.toLocaleString();
}

function duration(seconds: number) {
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 36 * 3600) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

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

  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get('/analytics');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) {
    // A failed load used to sit on "loading…" for good.
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Analytics · {failed ? 'unavailable' : 'loading…'}</div>
        {failed && !loading && (
          <div style={{ marginTop: 24 }}><LoadFailed what="analytics" onRetry={load} /></div>
        )}
      </DashboardLayout>
    );
  }

  const { charts, funnel, negotiations: neg } = data;
  const finished = neg.deals + neg.noDeals;
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

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">GMV</div>
          <div className="cb-kpi-value">{formatCurrency(totalGMV, 'INR')}</div>
          <div className="cb-kpi-delta">all time</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fees</div>
          <div className="cb-kpi-value">{formatCurrency(totalFees, 'INR')}</div>
          <div className="cb-kpi-delta">on released deals</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Signups</div>
          <div className="cb-kpi-value">{totalSignups.toLocaleString()}</div>
          <div className="cb-kpi-delta">all time</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lots</div>
          <div className="cb-kpi-value">{charts.monthlyListings.reduce((s, m) => s + m.value, 0).toLocaleString()}</div>
          <div className="cb-kpi-delta">created, all time</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{charts.monthlyBids.reduce((s, m) => s + m.value, 0).toLocaleString()}</div>
          <div className="cb-kpi-delta">placed, all time</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Take</div>
          <div className="cb-kpi-value">{data.feePercent}%</div>
          <div className="cb-kpi-delta">of each deal</div>
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

      <div className="cb-cols-2" style={{ gap: 18, marginBottom: 18 }}>
        <ChartCard title="Fee revenue · monthly">
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
        <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Signup to deal · all time</div>
        <div className="cb-tiny" style={{ marginBottom: 14 }}>
          Each step as a share of signups. Shoppers can buy without applying, so the steps do not always narrow.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            ['Signed up', funnel.signedUp],
            ['Applied to trade', funnel.applied],
            ['Approved partner', funnel.approved],
            ['Made a paid deal', funnel.dealt],
            ['Made 2 or more', funnel.repeat],
          ] as [string, number][]).map(([label, count]) => {
            const pct = funnel.signedUp > 0 ? Math.round((count / funnel.signedUp) * 100) : 0;
            return (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <span className="cb-mono cb-tiny">{count.toLocaleString()} · {pct}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--cb-paper-2)', borderRadius: 4 }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: 'var(--cb-sage)', borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cb-cols-2" style={{ gap: 18, marginBottom: 18 }}>
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

      <div className="cb-card">
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Agent negotiations · all time</div>
        <div className="cb-cols-2" style={{ gap: 8 }}>
          {[
            ['Negotiations', neg.total.toLocaleString()],
            ['Ended in a deal', share(neg.deals, finished)],
            ['Ended without one', share(neg.noDeals, finished)],
            ['Still going', neg.inProgress.toLocaleString()],
            ['Avg rounds when finished', neg.avgRounds === null ? 'none finished' : neg.avgRounds.toFixed(1)],
            ['Avg time to a deal', neg.avgSecondsToDeal === null ? 'no deals yet' : duration(neg.avgSecondsToDeal)],
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
