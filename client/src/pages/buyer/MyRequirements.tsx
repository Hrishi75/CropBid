// =============================================================================
// MyRequirements — Buyer's own posted demand
// =============================================================================
// Paginated list of the buyer's requirements (via /requirements/my) with status
// tabs. Each card links to its offers inbox and, while OPEN, offers Edit and
// Close (confirmed through ConfirmModal).
//
// The offer count on each card is PENDING-only — the number the buyer actually
// has to act on, not the lifetime total.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { RequirementCard } from '../../components/requirements/RequirementCard';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { postPath, restocksByList } from '../../utils/restock';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { BuyerRequirement } from '../../types';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'FULFILLED', label: 'Filled' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'EXPIRED', label: 'Expired' },
];

export function MyRequirements() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const postTo = postPath(user);
  const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => { setPage(1); }, [statusFilter]);
  useEffect(() => { fetchRequirements(); }, [page, statusFilter]);

  async function fetchRequirements() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/requirements/my?${params}`);
      setRequirements(data.requirements);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error('Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }

  async function handleClose() {
    if (!closeTarget) return;
    setClosing(true);
    try {
      await api.put(`/requirements/${closeTarget}/close`);
      toast.success('Requirement closed');
      fetchRequirements();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to close');
    } finally {
      setClosing(false);
      setCloseTarget(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Requirements</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        What you're <span className="cb-italic">buying.</span>
      </h1>
      <p className="cb-page-lede">
        Post what you need and let farmers come to you — outright at your price, or with a counter-offer.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', margin: '24px 0 20px' }}>
        <div className="cb-pill-group">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`cb-pill ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {restocksByList(user) && (
            <Link to="/buyer/requirements/new" className="cb-btn cb-btn-link">Just one crop</Link>
          )}
          <Button onClick={() => navigate(postTo)}>
            {restocksByList(user) ? 'New restock list' : 'Post a requirement'} <ArrowIcon />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="cb-cards" style={{ gap: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : requirements.length === 0 ? (
        <EmptyState
          title={statusFilter ? 'Nothing in this status' : 'No requirements yet'}
          description={
            statusFilter
              ? 'Try another status tab.'
              : "Post what you need — crop, volume and the price you'll pay — and farmers can fill it directly."
          }
          actionLabel={statusFilter ? undefined : 'Post a requirement'}
          onAction={statusFilter ? undefined : () => navigate(postTo)}
        />
      ) : (
        <div className="cb-cards" style={{ gap: 16 }}>
          {requirements.map((r, i) => {
            // The first item of a restock list on this page carries a header
            // for the list: its items were posted together, so they sit together.
            const listItems = r.listId ? requirements.filter((x) => x.listId === r.listId) : [];
            const listHead = r.listId && requirements.findIndex((x) => x.listId === r.listId) === i;
            const listOffers = listItems.reduce((n, x) => n + (x._count?.offers ?? 0), 0);
            return (
            <div key={r.id} className={r.listId ? 'cb-rl-member' : undefined} style={{ display: 'contents' }}>
            {listHead && (
              <div className="cb-rl-group">
                <span className="cb-mono">RESTOCK LIST · {listItems.length} ITEMS{r.repeatEveryDays ? ` · EVERY ${r.repeatEveryDays} DAYS` : ''}</span>
                <strong>{r.listName || `To ${r.deliveryLocation}`}</strong>
                <span>{listItems.map((x) => x.cropName).join(', ')}{listOffers > 0 ? ` · ${listOffers} ${listOffers === 1 ? 'offer' : 'offers'} waiting` : ''}</span>
              </div>
            )}
            <RequirementCard requirement={r} href={`/buyer/requirements/${r.id}`}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
                <Link to={`/buyer/requirements/${r.id}`} className="cb-btn cb-btn-secondary cb-btn-sm">
                  {r._count?.offers ? `${r._count.offers} offer${r._count.offers === 1 ? '' : 's'} waiting` : 'View offers'}
                </Link>
                {r.status === 'OPEN' && (
                  <>
                    <Link to={`/buyer/requirements/${r.id}/edit`} className="cb-btn cb-btn-ghost cb-btn-sm">
                      Edit
                    </Link>
                    <button type="button" className="cb-btn cb-btn-link" onClick={() => setCloseTarget(r.id)}>
                      Close
                    </button>
                  </>
                )}
              </div>
            </RequirementCard>
            </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'center', marginTop: 28 }}>
          <button
            type="button"
            className="cb-btn cb-btn-link"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← prev
          </button>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
            page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="cb-btn cb-btn-link"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            next →
          </button>
        </div>
      )}

      <ConfirmModal
        open={Boolean(closeTarget)}
        title="Close requirement"
        message="Farmers will no longer see this requirement, and any offers still awaiting your decision will expire. Fills that already went through are unaffected."
        confirmLabel="Close it"
        variant="warning"
        loading={closing}
        onConfirm={handleClose}
        onCancel={() => setCloseTarget(null)}
      />
    </DashboardLayout>
  );
}
