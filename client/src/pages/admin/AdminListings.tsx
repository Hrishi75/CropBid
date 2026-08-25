// =============================================================================
// AdminListings — Moderate all crop listings
// =============================================================================
// Admin table of every listing on the platform (via /admin/listings) with
// status-tab filtering and pagination. Shows crop, farmer, price range, bid
// count, and status; links into each listing's detail view.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';

interface AdminListing {
  id: string;
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  unit: string;
  qualityGrade?: string;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: string;
  status: string;
  location: string;
  state: string;
  organic: boolean;
  createdAt: string;
  farmer: { user: { id: string; name: string; trustScore?: number; country?: string } };
  _count: { bids: number };
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'IN_AUCTION', label: 'Auction' },
  { value: 'SOLD', label: 'Matched' },
  { value: 'EXPIRED', label: 'Expired' },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'ACTV', color: 'var(--cb-sage)' },
  IN_AUCTION: { label: 'AUCT', color: 'var(--cb-ember)' },
  SOLD: { label: 'MTCH', color: 'var(--cb-forest)' },
  EXPIRED: { label: 'EXPR', color: 'var(--cb-ink-3)' },
};

export function AdminListings() {
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchListings();
  }, [statusFilter, page]);

  async function fetchListings() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/listings?${params}`);
      setListings(res.data.listings);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load listings:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Listings · {total.toLocaleString()} total</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Marketplace lots,<br />
            <span className="cb-italic">every one.</span>
          </h1>
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">Export ↓ CSV</button>
      </div>

      <div className="cb-pill-group" style={{ marginTop: 8, marginBottom: 24 }}>
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
      ) : listings.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">No listings match.</span></div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {listings.map((l, i) => {
            const meta = STATUS_META[l.status] || { label: l.status.slice(0, 4), color: 'var(--cb-ink-3)' };
            const priceMid = (l.pricePerUnitMin + l.pricePerUnitMax) / 2;
            return (
              <div key={l.id} style={{ padding: '16px 20px', borderBottom: i < listings.length - 1 ? '1px solid var(--cb-line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #L-{l.id.slice(-6).toUpperCase()}
                    </span>
                    <Link to={`/listings/${l.id}`} style={{ color: 'var(--cb-ink)', textDecoration: 'none', fontWeight: 500 }}>
                      {l.cropName}
                    </Link>
                    {l.cropVariety && <span className="cb-small" style={{ marginLeft: 6 }}>· {l.cropVariety}</span>}
                    {l.organic && <span className="cb-chip cb-chip-sage" style={{ marginLeft: 8 }}>organic</span>}
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: meta.color }}>● {meta.label}</span>
                </div>
                <div className="cb-small" style={{ marginBottom: 6 }}>
                  Grade {l.qualityGrade ?? '—'} · {l.location}, {l.state} · {new Date(l.createdAt).toLocaleDateString()} · {l._count.bids} bids
                </div>
                <div className="cb-cols-3" style={{ gap: 16, alignItems: 'center' }}>
                  <div className="cb-mono" style={{ fontSize: 14 }}>
                    {formatCurrency(priceMid, l.currency)}
                    <span className="cb-tiny" style={{ marginLeft: 4 }}>/{l.unit.toLowerCase()}</span>
                  </div>
                  <div className="cb-mono cb-tiny">{l.quantity} {l.unit.toLowerCase()}</div>
                  <div className="cb-tiny">{l.farmer.user.name} · trust {Math.round(l.farmer.user.trustScore || 0)}</div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Link to={`/listings/${l.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>View →</Link>
                  <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12, color: 'var(--cb-wheat)' }}>⚠ Flag</button>
                  <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12, color: 'var(--cb-ember)' }}>✕ Take down</button>
                </div>
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
