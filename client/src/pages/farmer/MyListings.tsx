// =============================================================================
// MyListings — Farmer's own crop listings
// =============================================================================
// Paginated grid of the farmer's listings (via /listings/my) with status-tab
// filtering. Each ListingCard exposes Edit (→ CreateListing in edit mode) and
// Delete (confirmed through ConfirmModal). Empty/loading states handled inline.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

type ListingExt = Listing & { _count?: { bids: number } };

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'IN_AUCTION', label: 'Auction' },
  { value: 'SOLD', label: 'Matched' },
  { value: 'EXPIRED', label: 'Closed' },
];

export function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<ListingExt[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchListings();
  }, [page]);

  async function fetchListings() {
    try {
      const { data } = await api.get(`/listings/my?page=${page}&limit=12`);
      setListings(data.listings);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/listings/${deleteTarget}`);
      toast.success('Listing deleted');
      setListings((prev) => prev.filter((l) => l.id !== deleteTarget));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const summary = useMemo(() => {
    const byStatus = {
      ACTIVE: { count: 0, value: 0 },
      DRAFT: { count: 0, value: 0 },
      SOLD: { count: 0, value: 0 },
      EXPIRED: { count: 0, value: 0 },
    } as Record<string, { count: number; value: number }>;
    for (const l of listings) {
      const k = byStatus[l.status] ? l.status : 'DRAFT';
      byStatus[k].count++;
      byStatus[k].value += ((l.pricePerUnitMin + l.pricePerUnitMax) / 2) * l.quantity;
    }
    return byStatus;
  }, [listings]);

  const filtered = statusFilter
    ? listings.filter((l) => l.status === statusFilter)
    : listings;

  const currency = listings[0]?.currency || 'INR';

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Listings</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Your lots,<br />
        <span className="cb-italic">on the market.</span>
      </h1>

      <div className="cb-kpi-strip" style={{ marginTop: 28, marginBottom: 24 }}>
        {[
          ['Active', 'ACTIVE'],
          ['Draft', 'DRAFT'],
          ['Matched', 'SOLD'],
          ['Closed', 'EXPIRED'],
        ].map(([label, key]) => (
          <div key={key} className="cb-kpi-cell">
            <div className="cb-kpi-label">{label}</div>
            <div className="cb-kpi-value">{summary[key].count}</div>
            <div className="cb-kpi-delta">
              {summary[key].value > 0 ? formatCurrency(summary[key].value, currency) : '—'}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cb-pill-group">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`cb-pill ${statusFilter === s.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate('/farmer/listings/new')}
          className="cb-btn cb-btn-primary"
          style={{ marginLeft: 'auto' }}
        >
          New lot
          <ArrowIcon />
        </button>
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 0 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: 20, borderBottom: i < 3 ? '1px solid var(--cb-line)' : 'none' }}>
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No listings yet"
          description="Create your first crop lot to start receiving bids from verified buyers."
          actionLabel="Create your first lot"
          onAction={() => navigate('/farmer/listings/new')}
        />
      ) : (
        <>
          <div className="cb-card" style={{ padding: 0 }}>
            {filtered.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                variant="row"
                showActions
                onEdit={(id) => navigate(`/farmer/listings/${id}/edit`)}
                onDelete={(id) => setDeleteTarget(id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="cb-btn cb-btn-link"
                style={{ fontSize: 12 }}
              >
                ← prev
              </button>
              <span>page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="cb-btn cb-btn-link"
                style={{ fontSize: 12 }}
              >
                next →
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete lot"
        message="This will permanently remove the listing and all associated bids. This action cannot be undone."
        confirmLabel="Delete lot"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
