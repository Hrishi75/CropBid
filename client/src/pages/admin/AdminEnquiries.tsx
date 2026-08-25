// =============================================================================
// AdminEnquiries — Inbound equipment leads
// =============================================================================
// Equipment enquiries never become a Transaction, so they appear on no other
// admin screen. This is the only place a machinery lead is visible: who asked,
// for which machine, whether they want to buy or hire, and which dealer to
// pass it to. Status is editable inline so a lead can be worked off this page.
// =============================================================================

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

interface AdminEnquiry {
  id: string;
  equipment: {
    id: string;
    title: string;
    category: string;
    dealer: { name: string; contactPhone: string | null; state: string } | null;
  } | null;
  user: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    location: string | null;
  } | null;
  intent: string;
  message: string | null;
  rentFrom: string | null;
  rentTo: string | null;
  status: string;
  createdAt: string;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  NEW: { label: 'NEW', color: 'var(--cb-ember)' },
  CONTACTED: { label: 'CTCD', color: 'var(--cb-wheat)' },
  CLOSED: { label: 'CLSD', color: 'var(--cb-sage)' },
};

// Where a lead can move next. CLOSED is terminal in the UI — reopening is
// rare enough that an accidental click shouldn't do it.
const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  NEW: { to: 'CONTACTED', label: 'Mark contacted' },
  CONTACTED: { to: 'CLOSED', label: 'Close lead' },
};

function formatRentWindow(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const fmt = (d: string) => new Date(d).toLocaleDateString();
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  return from ? `from ${fmt(from)}` : `until ${fmt(to!)}`;
}

export function AdminEnquiries() {
  const [enquiries, setEnquiries] = useState<AdminEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchEnquiries();
  }, [statusFilter, page]);

  async function fetchEnquiries() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/enquiries?${params}`);
      setEnquiries(res.data.enquiries);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load enquiries:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await api.patch(`/admin/enquiries/${id}`, { status });
      toast.success(`Lead marked ${status.toLowerCase()}`);
      fetchEnquiries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const newCount = enquiries.filter((e) => e.status === 'NEW').length;
  const buying = enquiries.filter((e) => e.intent === 'SALE').length;
  const hiring = enquiries.filter((e) => e.intent === 'RENT').length;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Equipment leads · {total.toLocaleString()} total</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Machinery demand,<br />
            <span className="cb-italic">as it lands.</span>
          </h1>
        </div>
      </div>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Unworked</div>
          <div className="cb-kpi-value">{newCount}</div>
          <div className="cb-kpi-delta">on this page</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">To buy</div>
          <div className="cb-kpi-value">{buying}</div>
          <div className="cb-kpi-delta">purchase intent</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">To hire</div>
          <div className="cb-kpi-value">{hiring}</div>
          <div className="cb-kpi-delta">rental intent</div>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => { setStatusFilter(tab.value); setPage(0); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : enquiries.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">No equipment enquiries match.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {enquiries.map((eq, i) => {
            const meta = STATUS_META[eq.status] || { label: eq.status.slice(0, 4), color: 'var(--cb-ink-3)' };
            const next = NEXT_STATUS[eq.status];
            const rentWindow = formatRentWindow(eq.rentFrom, eq.rentTo);
            return (
              <div
                key={eq.id}
                style={{ padding: '16px 20px', borderBottom: i < enquiries.length - 1 ? '1px solid var(--cb-line)' : 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #E-{eq.id.slice(-6).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500 }}>{eq.equipment?.title || 'Equipment'}</span>
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: meta.color }}>
                    ● {meta.label} · {eq.intent === 'RENT' ? 'HIRE' : 'BUY'}
                  </span>
                </div>

                <div className="cb-small" style={{ marginBottom: 8 }}>
                  {eq.user?.name || 'Unknown'}
                  {eq.user?.location ? ` · ${eq.user.location}` : ''} · {new Date(eq.createdAt).toLocaleDateString()}
                </div>

                {eq.message && (
                  <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)' }}>
                    “{eq.message}”
                  </div>
                )}

                {rentWindow && (
                  <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 8 }}>
                    wants it {rentWindow}
                  </div>
                )}

                {/* Both phone numbers — working a lead means calling the
                    farmer and the dealer who holds the machine. */}
                <div
                  className="cb-cols-2"
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed var(--cb-line)',
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>ENQUIRER</div>
                    <div className="cb-mono" style={{ fontSize: 13 }}>{eq.user?.phone || eq.user?.email || '—'}</div>
                  </div>
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>DEALER</div>
                    <div className="cb-mono" style={{ fontSize: 13 }}>
                      {eq.equipment?.dealer
                        ? `${eq.equipment.dealer.name}${eq.equipment.dealer.contactPhone ? ` · ${eq.equipment.dealer.contactPhone}` : ''}`
                        : '—'}
                    </div>
                  </div>
                </div>

                {next && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(eq.id, next.to)}
                      className="cb-btn cb-btn-link"
                      style={{ fontSize: 12 }}
                    >
                      {next.label} →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
          <span>page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
        </div>
      )}
    </DashboardLayout>
  );
}
