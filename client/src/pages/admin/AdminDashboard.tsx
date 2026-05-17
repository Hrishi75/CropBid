import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface PlatformStats {
  users: { total: number; farmers: number; buyers: number };
  listings: { total: number; active: number };
  bids: { total: number };
  transactions: { total: number; inEscrow: number; completed: number };
  negotiations: { total: number };
  financial: { gmv: number; platformRevenue: number };
}

const EVENT_FALLBACK = [
  { t: '09:42:11', evt: 'Match · #L-4421 Wheat HRW', val: '₹1.21L', warn: false },
  { t: '09:41:58', evt: 'Bid sent · #L-4419', val: '₹2,420', warn: false },
  { t: '09:41:42', evt: 'Listing created · Punjab', val: 'Soy', warn: false },
  { t: '09:41:33', evt: 'Shipment delivered · #S-871', val: '50q', warn: false },
  { t: '09:41:18', evt: 'User signup · Maharashtra', val: 'FARMER', warn: false },
  { t: '09:41:02', evt: 'Escrow released · #T-865', val: '₹2.06L', warn: false },
  { t: '09:40:51', evt: '⚠ Auction stuck · #A-0408', val: '12m', warn: true },
  { t: '09:40:33', evt: '⚠ Dispute opened · #T-862', val: 'quality', warn: true },
];

const ATTENTION_FALLBACK = [
  { type: 'Dispute', id: '#T-862', desc: 'Mustard 35q · quality', sla: '2h SLA', cta: 'Open case' },
  { type: 'Stuck', id: '#A-0408', desc: 'Soy 100q · no bids 12m', sla: 'active', cta: 'Investigate' },
  { type: 'KYC fail', id: '#U-2871', desc: 'Buyer · India · GST mismatch', sla: 'review', cta: 'Review' },
  { type: 'Refund', id: '#T-855', desc: 'Cotton 20q · buyer requested', sla: 'pending', cta: 'Approve / Deny' },
];

const COUNTRIES = [
  { name: 'India', flag: '🇮🇳', gmv: 142, pct: 57 },
  { name: 'USA', flag: '🇺🇸', gmv: 47, pct: 19 },
  { name: 'Brazil', flag: '🇧🇷', gmv: 28, pct: 11 },
  { name: 'Kenya', flag: '🇰🇪', gmv: 14, pct: 6 },
  { name: 'UK', flag: '🇬🇧', gmv: 9, pct: 4 },
];

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

  if (loading || !stats) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Loading ops…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Ops center · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })} · all systems ●
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Platform pulse,<br />
        <span className="cb-italic">live.</span>
      </h1>

      <div className="cb-card" style={{ marginTop: 24, marginBottom: 20 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 12 }}>System health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {[
            { label: 'API', val: '142ms p50' },
            { label: 'Socket', val: '1,847 clients' },
            { label: 'DB', val: '23ms p95' },
            { label: 'Queue', val: '4 jobs' },
            { label: 'Errors', val: '0' },
          ].map((s) => (
            <div key={s.label}>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)', marginBottom: 4 }}>●●● {s.label}</div>
              <div className="cb-mono" style={{ fontSize: 13 }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div className="cb-tiny" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--cb-line)' }}>
          Agent uptime 99.4% 24h · last deploy 18:32 yesterday
        </div>
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Users</div>
          <div className="cb-kpi-value">{stats.users.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">+312/d</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lots</div>
          <div className="cb-kpi-value">{stats.listings.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.listings.active} active</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{stats.bids.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">↑ 4/min</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Txns</div>
          <div className="cb-kpi-value">{stats.transactions.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.transactions.inEscrow} escr</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">GMV</div>
          <div className="cb-kpi-value">{formatCurrency(stats.financial.gmv, 'INR')}</div>
          <div className="cb-kpi-delta pos">+18% QQ</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fee</div>
          <div className="cb-kpi-value">{formatCurrency(stats.financial.platformRevenue, 'INR')}</div>
          <div className="cb-kpi-delta">1% take</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow">Live event stream</div>
            <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>Pause ⏸</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {EVENT_FALLBACK.map((event, i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr auto',
                  gap: 12, padding: '10px 18px',
                  borderBottom: i < EVENT_FALLBACK.length - 1 ? '1px solid var(--cb-line)' : 'none',
                  background: event.warn ? 'rgba(200,96,43,0.04)' : 'transparent',
                }}
                className="cb-mono"
              >
                <span style={{ color: 'var(--cb-ink-3)', fontSize: 11 }}>{event.t}</span>
                <span style={{ color: event.warn ? 'var(--cb-ember)' : 'var(--cb-ink-2)', fontSize: 12 }}>{event.evt}</span>
                <span style={{ color: 'var(--cb-ink-3)', fontSize: 11 }}>{event.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow">Needs attention · {ATTENTION_FALLBACK.length} items</div>
          </div>
          {ATTENTION_FALLBACK.map((item, i) => (
            <div key={i} style={{ padding: '12px 18px', borderBottom: i < ATTENTION_FALLBACK.length - 1 ? '1px solid var(--cb-line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>⚠ {item.type}</span>
                <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{item.sla}</span>
              </div>
              <div style={{ fontSize: 13 }}>{item.id} · {item.desc}</div>
              <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 6 }}>{item.cta} →</div>
            </div>
          ))}
        </div>
      </div>

      <div className="cb-card">
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Top countries by GMV</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <div style={{ marginTop: 16 }}>
          <Link to="/admin/analytics" className="cb-btn cb-btn-link">View full analytics →</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
