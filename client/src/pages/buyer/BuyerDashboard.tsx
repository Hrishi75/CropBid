import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ArrowIcon, MiniChart } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface Stats {
  activeBids: number;
  wonDeals: number;
  totalSpent: number;
}

const SPARK_POS = [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12];

const QUEUE_FALLBACK = [
  { t: '09:42', evt: 'Counter received', lot: 'Wheat-A', price: '₹2,420', mark: '●' },
  { t: '09:18', evt: 'Match · drafted', lot: 'Turmeric', price: '₹14,800', mark: '●' },
  { t: '08:55', evt: 'Outbid by ADM-12', lot: 'Soy', price: '—', mark: '●' },
  { t: '07:14', evt: 'Bid sent', lot: 'Bajra', price: '₹2,140', mark: '' },
];

const MARKET_FALLBACK = [
  { crop: 'Wheat HRW', delta: '+1.2%', region: 'Nashik, MH', price: '₹2,340/qtl', qty: '50q · 8b' },
  { crop: 'Yellow Corn', delta: '−0.4%', region: 'Iowa, USA', price: '$172/MT', qty: '12kt · 11b' },
  { crop: 'Soybean', delta: '+0.8%', region: 'São Paulo', price: '$408/MT', qty: '3.5kt · 6b' },
];

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
  const firstName = user?.name?.split(/\s+/)[0] || '';

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Procurement · desk 02 · {user?.name?.split(' ')[0]?.toLowerCase() || 'agent'}-04</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Good morning,<br />
        <span className="cb-italic">{firstName || user?.name}.</span>
      </h1>
      <p className="cb-page-lede">
        Your agent ran negotiations overnight. {stats.activeBids} bids working, {stats.activeBids > 0 ? `${Math.min(4, stats.activeBids)} awaiting your call` : 'all clear'}.
      </p>

      <div className="cb-card cb-card-forest" style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span className="cb-live-dot" />
          <span className="cb-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: '#e6efd9' }}>
            AGENT · ACTIVE · watching 18 lots · bid power {formatCurrency(4700000, currency)}
          </span>
        </div>
        <div className="cb-mono" style={{ fontSize: 11, color: 'rgba(244,241,234,0.55)', letterSpacing: '0.08em', marginBottom: 4 }}>STRATEGY</div>
        <div style={{ fontSize: 14, color: '#e6efd9', marginBottom: 14 }}>
          Floor +5%, accept at MSP+8%, walk-away at MSP+12%. Match competing bids within 0.5%.
        </div>
        <Link to="/agent" className="cb-btn cb-btn-ghost" style={{ background: 'rgba(255,255,255,0.08)', color: '#e6efd9', borderColor: 'rgba(255,255,255,0.2)' }}>
          Configure agent <ArrowIcon />
        </Link>
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Active bids</div>
          <div className="cb-kpi-value">{loading ? '—' : stats.activeBids}</div>
          <div className="cb-kpi-delta">{Math.min(4, stats.activeBids)} awaiting you</div>
          <div style={{ marginTop: 8 }}><MiniChart data={SPARK_POS} color="#6b8e4e" /></div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Won deals</div>
          <div className="cb-kpi-value">{loading ? '—' : stats.wonDeals}</div>
          <div className="cb-kpi-delta">this quarter</div>
          <div style={{ marginTop: 8 }}><MiniChart data={SPARK_POS} color="#1f2d18" /></div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Saved vs broker</div>
          <div className="cb-kpi-value" style={{ color: 'var(--cb-sage)' }}>+{formatCurrency(stats.totalSpent * 0.016, currency)}</div>
          <div className="cb-kpi-delta pos">1.6% over benchmark</div>
          <div style={{ marginTop: 8 }}><MiniChart data={SPARK_POS} color="#c8602b" /></div>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <div className="cb-section-head">
          <div>
            <div className="cb-eyebrow">Today · agent queue</div>
            <h2 className="cb-h3" style={{ marginTop: 8 }}>Recent agent activity</h2>
          </div>
          <Link to="/negotiations" className="cb-btn cb-btn-link">See all →</Link>
        </div>
        <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="cb-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>T+</th>
                <th>Event</th>
                <th>Lot</th>
                <th className="num">Price</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {QUEUE_FALLBACK.map((row) => (
                <tr key={row.t}>
                  <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{row.t}</td>
                  <td style={{ color: 'var(--cb-ink)' }}>{row.evt}</td>
                  <td className="cb-mono" style={{ color: 'var(--cb-ink-2)' }}>{row.lot}</td>
                  <td className="num">{row.price}</td>
                  <td><span className="cb-mono" style={{ color: 'var(--cb-ember)' }}>{row.mark}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div className="cb-section-head">
          <div>
            <div className="cb-eyebrow">Marketplace · matching your brief</div>
            <h2 className="cb-h3" style={{ marginTop: 8 }}>Lots your agent is watching</h2>
          </div>
          <Link to="/buyer/browse" className="cb-btn cb-btn-link">Open marketplace →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--cb-line)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--cb-line)' }}>
          {MARKET_FALLBACK.map((row) => (
            <div key={row.crop} style={{ background: 'var(--cb-paper)', padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>{row.crop}</span>
                <span className="cb-mono cb-tiny" style={{ color: row.delta.startsWith('+') ? 'var(--cb-sage)' : 'var(--cb-ember)' }}>{row.delta}</span>
              </div>
              <div className="cb-tiny">{row.region}</div>
              <div className="cb-mono" style={{ fontSize: 20, fontWeight: 500 }}>{row.price}</div>
              <MiniChart data={SPARK_POS} color="#6b8e4e" width={160} height={26} />
              <div className="cb-mono cb-tiny" style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--cb-line)' }}>
                <span>{row.qty}</span>
                <span style={{ color: 'var(--cb-ember)' }}>● live</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cb-eyebrow">Quick</span>
        <Link to="/agent" className="cb-btn cb-btn-primary">
          Brief agent
          <ArrowIcon />
        </Link>
        <Link to="/buyer/browse" className="cb-btn cb-btn-ghost">
          Browse marketplace
          <ArrowIcon />
        </Link>
      </div>
    </DashboardLayout>
  );
}
