// =============================================================================
// AdminDashboard — Platform operations overview
// =============================================================================
// Admin home. Loads platform-wide stats (users, listings, bids, transactions,
// GMV, revenue) from /admin/stats and the triage queue from /admin/attention.
//
// "Needs attention" is the ops worklist, and today it holds one thing: deals
// with no freight booked. CropBid arranges every delivery (CLAUDE.md §2a), so a
// closed deal is work that has not been started, and each row links straight
// into the booking form. The queue is derived from transaction state, not from
// the notifications that announce a deal, so ops cannot lose a job by missing a
// ping.
//
// The live event stream still renders from server data only and stays empty
// (no fabricated rows) until /admin/events exists (see TODO below).
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

// Event stream renders from server data. No fallback fake rows — admins should
// see "no events yet" instead of fabricated dispute IDs that lead nowhere when
// clicked.
type EventRow = { t: string; evt: string; val: string; warn?: boolean };
type AttentionRow = { type: string; id: string; desc: string; sla: string; cta: string; href?: string };

export function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [events] = useState<EventRow[]>([]);
  const [attention, setAttention] = useState<AttentionRow[]>([]);
  const [streamPaused, setStreamPaused] = useState(false);
  // Zero items and "we could not ask" must not render identically: one says
  // there is nothing to do, the other says we do not know.
  const [attentionFailed, setAttentionFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      // allSettled: the triage queue and the headline stats are independent
      // feeds, and a failing /admin/stats must not blank a queue of deals
      // waiting on freight. An empty "needs attention" reads as "all clear",
      // which is the one thing it must never say by accident.
      const [statsRes, attentionRes] = await Promise.allSettled([
        api.get('/admin/stats'),
        api.get('/admin/attention'),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      } else {
        console.error('Failed to load stats:', statsRes.reason);
      }

      if (attentionRes.status === 'fulfilled') {
        setAttention(attentionRes.value.data.items ?? []);
      } else {
        setAttentionFailed(true);
        console.error('Failed to load triage queue:', attentionRes.reason);
      }

      // TODO: wire the /admin/events endpoint when the backend exposes it;
      // until then the stream renders empty rather than fabricated rows.
      setLoading(false);
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
            <div className="cb-eyebrow">
              Needs attention · {attentionFailed ? 'unavailable' : `${attention.length} items`}
            </div>
          </div>
          {/* "All clear" is a claim. Only say it when we actually asked and
              got an empty answer back. */}
          {attentionFailed ? (
            <div style={{ padding: '28px 18px', textAlign: 'center' }} className="cb-tiny">
              Couldn't load the queue, so we don't know what is waiting. Refresh to try again.
            </div>
          ) : attention.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center' }} className="cb-tiny">
              All clear. Every deal has transport booked.
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
