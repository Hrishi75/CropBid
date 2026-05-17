import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ArrowIcon, MiniChart } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface Stats {
  activeListings: number;
  pendingBids: number;
  totalEarnings: number;
}

const SPARK_POS = [3, 5, 4, 6, 5, 8, 7, 9, 11, 10, 12];
const SPARK_NEG = [10, 9, 11, 8, 9, 7, 8, 6, 5, 7, 5];

const QUEUE_FALLBACK = [
  { t: '09:18', evt: 'Bid received', lot: 'Wheat-A', spread: '+₹140', mark: '●' },
  { t: '08:45', evt: 'Counter sent', lot: 'Mustard', spread: '−₹60', mark: '●' },
  { t: '07:02', evt: 'Match · drafted', lot: 'Turmeric', spread: '₹0', mark: '●' },
  { t: '06:55', evt: 'Listing closed', lot: 'Bajra', spread: '—', mark: '' },
];

const MARKET_FALLBACK = [
  { crop: 'Wheat HRW', price: '₹2,340/qtl', delta: '+1.2%', tone: 'pos' as const, spark: SPARK_POS },
  { crop: 'Turmeric', price: '₹14,800/qtl', delta: '−0.4%', tone: 'neg' as const, spark: SPARK_NEG },
  { crop: 'Mustard', price: '₹5,890/qtl', delta: '+0.8%', tone: 'pos' as const, spark: SPARK_POS },
];

export function FarmerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ activeListings: 0, pendingBids: 0, totalEarnings: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [listingsRes, bidsRes, txStatsRes] = await Promise.all([
          api.get('/listings/my'),
          api.get('/bids/incoming'),
          api.get('/transactions/stats'),
        ]);
        const listings = listingsRes.data.listings ?? listingsRes.data;
        const activeListings = Array.isArray(listings)
          ? listings.filter((l: any) => l.status === 'ACTIVE').length
          : 0;
        const bids = Array.isArray(bidsRes.data) ? bidsRes.data : [];
        const pendingBids = bids.filter((b: any) => b.status === 'PENDING').length;
        const totalEarnings = txStatsRes.data.totalRevenue || 0;
        setStats({ activeListings, pendingBids, totalEarnings });
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
      <div className="cb-page-head">
        <div className="cb-page-eyebrow">Welcome · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Crop year {new Date().getFullYear()}</div>
        <h1 className="cb-page-title">
          Good morning,<br />
          <span className="cb-italic">{firstName || user?.name}.</span>
        </h1>
        <p className="cb-page-lede">Your agent ran negotiations overnight. Review pending bids, calibrate strategy, or list a new lot.</p>
      </div>

      <div className="cb-card cb-card-forest" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span className="cb-live-dot" />
          <span className="cb-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: '#e6efd9' }}>
            AGENT · ACTIVE · monitoring {stats.activeListings} lots
          </span>
        </div>
        <div className="cb-mono" style={{ fontSize: 11, color: 'rgba(244,241,234,0.55)', letterSpacing: '0.08em', marginBottom: 4 }}>STRATEGY</div>
        <div style={{ fontSize: 14, color: '#e6efd9' }}>
          Open at floor +₹120, accept at ceiling −2%. Match competing bids within 0.5%.
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
          <Link to="/agent" className="cb-btn cb-btn-ghost" style={{ background: 'rgba(255,255,255,0.08)', color: '#e6efd9', borderColor: 'rgba(255,255,255,0.2)' }}>
            Configure agent
            <ArrowIcon />
          </Link>
        </div>
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Active lots</div>
          <div className="cb-kpi-value">{loading ? '—' : stats.activeListings}</div>
          <div className="cb-kpi-delta pos">↑ tracking now</div>
          <div style={{ marginTop: 8 }}><MiniChart data={SPARK_POS} color="#6b8e4e" /></div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids open</div>
          <div className="cb-kpi-value">{loading ? '—' : stats.pendingBids}</div>
          <div className="cb-kpi-delta">awaiting your call</div>
          <div style={{ marginTop: 8 }}>
            <Link to="/farmer/bids" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>
              Review bids →
            </Link>
          </div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Earned · season</div>
          <div className="cb-kpi-value">{formatCurrency(stats.totalEarnings, currency)}</div>
          <div className="cb-kpi-delta pos">+12% YoY</div>
          <div style={{ marginTop: 8 }}><MiniChart data={SPARK_POS} color="#1f2d18" /></div>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <div className="cb-section-head">
          <div>
            <div className="cb-eyebrow">Today · action queue</div>
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
                <th className="num">Spread</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {QUEUE_FALLBACK.map((row) => (
                <tr key={row.t}>
                  <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{row.t}</td>
                  <td style={{ color: 'var(--cb-ink)' }}>{row.evt}</td>
                  <td className="cb-mono" style={{ color: 'var(--cb-ink-2)' }}>{row.lot}</td>
                  <td className="num">{row.spread}</td>
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
            <div className="cb-eyebrow">Market · your crops</div>
            <h2 className="cb-h3" style={{ marginTop: 8 }}>Price moves to watch</h2>
          </div>
        </div>
        <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
          {MARKET_FALLBACK.map((row, i) => (
            <div
              key={row.crop}
              style={{
                display: 'grid', gridTemplateColumns: '1.5fr 1fr 80px 160px',
                gap: 16, padding: '14px 20px', alignItems: 'center',
                borderBottom: i < MARKET_FALLBACK.length - 1 ? '1px solid var(--cb-line)' : 'none',
              }}
            >
              <span style={{ fontWeight: 500 }}>{row.crop}</span>
              <span className="cb-mono">{row.price}</span>
              <span className="cb-mono" style={{ color: row.tone === 'pos' ? 'var(--cb-sage)' : 'var(--cb-ember)' }}>
                {row.delta}
              </span>
              <MiniChart data={row.spark} color={row.tone === 'pos' ? '#6b8e4e' : '#c8602b'} />
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cb-eyebrow">Quick</span>
        <Link to="/farmer/listings/new" className="cb-btn cb-btn-primary">
          List a crop
          <ArrowIcon />
        </Link>
        <Link to="/farmer/bids" className="cb-btn cb-btn-ghost">
          Review bids
          <ArrowIcon />
        </Link>
      </div>
    </DashboardLayout>
  );
}
