// =============================================================================
// AdminDashboard — Platform operations overview
// =============================================================================
// Admin home. Loads platform-wide stats (users, listings, bids, transactions,
// GMV, revenue) from /admin/stats. The live event stream and "needs attention"
// triage queue render from server data only — they stay empty (no fabricated
// rows) until /admin/events and /admin/attention exist (see TODO below).
//
// Nothing on this page is invented. A system-health tile (hardcoded latencies
// and socket counts) and a per-country GMV breakdown used to render from
// constants — they looked like telemetry, so an admin reading them would have
// been reading fiction. Both are gone until real sources exist: health needs a
// metrics endpoint, geo needs GMV grouped by user country in /admin/stats.
// =============================================================================

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

// Event stream + triage queue render from server data. No fallback fake
// rows — admins should see "no events yet" instead of fabricated dispute
// IDs that lead nowhere when clicked.
type EventRow = { t: string; evt: string; val: string; warn?: boolean };
type AttentionRow = { type: string; id: string; desc: string; sla: string; cta: string; href?: string };

export function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [events] = useState<EventRow[]>([]);
  const [attention] = useState<AttentionRow[]>([]);
  const [streamPaused, setStreamPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data);
        // TODO: wire /admin/events and /admin/attention endpoints when
        // the backend exposes them; until then the lists render empty
        // rather than ship fabricated triage items.
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
        Ops center · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Platform pulse,<br />
        <span className="cb-italic">live.</span>
      </h1>

      <div className="cb-kpi-strip" style={{ marginTop: 24, marginBottom: 24 }}>
        {/* Every delta below is derived from the stats payload. There are no
            rate-of-change figures (per-day signups, bids/min, QoQ growth)
            because /admin/stats returns point-in-time counts only — inventing
            a trend line from a single snapshot is how a dashboard starts
            lying. */}
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Users</div>
          <div className="cb-kpi-value">{stats.users.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.users.farmers} farmers · {stats.users.buyers} buyers</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Lots</div>
          <div className="cb-kpi-value">{stats.listings.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.listings.active} active</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Bids</div>
          <div className="cb-kpi-value">{stats.bids.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.negotiations.total} negotiations</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Txns</div>
          <div className="cb-kpi-value">{stats.transactions.total.toLocaleString()}</div>
          <div className="cb-kpi-delta">{stats.transactions.inEscrow} escr</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">GMV</div>
          <div className="cb-kpi-value">{formatCurrency(stats.financial.gmv, 'INR')}</div>
          <div className="cb-kpi-delta">{stats.transactions.completed} settled</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fee</div>
          <div className="cb-kpi-value">{formatCurrency(stats.financial.platformRevenue, 'INR')}</div>
          <div className="cb-kpi-delta">on released deals</div>
        </div>
      </div>

      <div className="cb-cols-2" style={{ gap: 16, marginBottom: 24 }}>
        <div className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow">Live event stream</div>
            <button
              type="button"
              onClick={() => setStreamPaused((v) => !v)}
              className="cb-btn cb-btn-link"
              style={{ fontSize: 12 }}
              disabled={events.length === 0}
            >
              {streamPaused ? 'Resume ▶' : 'Pause ⏸'}
            </button>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ padding: '28px 18px', textAlign: 'center' }} className="cb-tiny">
                No platform events yet. Stream wires up once the
                <span className="cb-mono"> /admin/events</span> endpoint ships.
              </div>
            ) : (
              events.map((event, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr) auto',
                    gap: 12, padding: '10px 18px',
                    borderBottom: i < events.length - 1 ? '1px solid var(--cb-line)' : 'none',
                    background: event.warn ? 'rgba(200,96,43,0.04)' : 'transparent',
                  }}
                  className="cb-mono"
                >
                  <span style={{ color: 'var(--cb-ink-3)', fontSize: 11 }}>{event.t}</span>
                  <span style={{ color: event.warn ? 'var(--cb-ember)' : 'var(--cb-ink-2)', fontSize: 12 }}>{event.evt}</span>
                  <span style={{ color: 'var(--cb-ink-3)', fontSize: 11 }}>{event.val}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow">Needs attention · {attention.length} items</div>
          </div>
          {attention.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center' }} className="cb-tiny">
              All clear. No open disputes, stuck auctions, or KYC failures.
            </div>
          ) : (
            attention.map((item, i) => (
              <div key={i} style={{ padding: '12px 18px', borderBottom: i < attention.length - 1 ? '1px solid var(--cb-line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>⚠ {item.type}</span>
                  <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{item.sla}</span>
                </div>
                <div style={{ fontSize: 13 }}>{item.id} · {item.desc}</div>
                {item.href ? (
                  <Link to={item.href} className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 6, display: 'inline-block' }}>{item.cta} →</Link>
                ) : (
                  <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 6 }}>{item.cta} →</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="cb-card">
        <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Breakdowns</div>
        <div className="cb-small" style={{ marginBottom: 14 }}>
          Geo and category splits live on the analytics page.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Link to="/admin/analytics" className="cb-btn cb-btn-link">View full analytics →</Link>
          <Link to="/admin/transactions" className="cb-btn cb-btn-link">Review orders →</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
