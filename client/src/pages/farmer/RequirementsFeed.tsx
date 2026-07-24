// =============================================================================
// RequirementsFeed — Farmers browse open buyer demand
// =============================================================================
// The demand-side twin of BrowseListings: same filter rail, same debounce,
// same pagination block. Each card carries two inline-expanding actions:
//   Fill  → POST /requirements/:id/accept — closes the deal on the spot at the
//           buyer's posted price
//   Counter → POST /requirements/:id/offers — proposes the farmer's own price,
//           which the buyer accepts or rejects
//
// Quantity defaults to the whole remaining amount but can be reduced, because
// requirements support partial fills.
// =============================================================================

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { RequirementCard } from '../../components/requirements/RequirementCard';
import {
  RequirementFilters,
  EMPTY_REQUIREMENT_FILTERS,
  type RequirementFilterState,
} from '../../components/requirements/RequirementFilters';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { BuyerRequirement } from '../../types';

export function RequirementsFeed() {
  const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<RequirementFilterState>({ ...EMPTY_REQUIREMENT_FILTERS });

  // Which card has an action panel open, and the values typed into it.
  const [openAction, setOpenAction] = useState<{ id: string; mode: 'fill' | 'counter' } | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { fetchFeed(); }, [filters, page]);

  async function fetchFeed() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '12');
      if (filters.search) params.set('search', filters.search);
      if (filters.crop) params.set('crop', filters.crop);
      if (filters.state) params.set('state', filters.state);
      if (filters.quality) params.set('quality', filters.quality);
      if (filters.organic) params.set('organic', filters.organic);
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.sort) {
        params.set('sort', filters.sort);
        // Deadline sorts soonest-first; everything else newest/highest-first.
        params.set('order', filters.sort === 'neededBy' ? 'asc' : 'desc');
      }
      const { data } = await api.get(`/requirements/feed?${params.toString()}`);
      setRequirements(data.requirements);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }

  function toggleAction(r: BuyerRequirement, mode: 'fill' | 'counter') {
    if (openAction?.id === r.id && openAction.mode === mode) {
      setOpenAction(null);
      return;
    }
    setOpenAction({ id: r.id, mode });
    // Default to supplying the whole outstanding amount at the buyer's price —
    // the common case — while leaving both editable for a partial fill.
    setQty(String(r.remainingQuantity));
    setPrice(String(r.pricePerUnit));
    setMessage('');
  }

  async function submitAction(r: BuyerRequirement) {
    if (!openAction) return;
    const quantity = parseFloat(qty);
    if (!quantity || quantity <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    if (quantity > r.remainingQuantity) {
      toast.error(`Only ${r.remainingQuantity} ${r.unit.toLowerCase()} still needed`);
      return;
    }

    setSubmitting(true);
    try {
      if (openAction.mode === 'fill') {
        await api.post(`/requirements/${r.id}/accept`, {
          quantity,
          message: message || undefined,
        });
        toast.success('Filled — the deal is in your Transactions');
      } else {
        const p = parseFloat(price);
        if (!p || p <= 0) {
          toast.error('Enter a valid price');
          setSubmitting(false);
          return;
        }
        await api.post(`/requirements/${r.id}/offers`, {
          quantity,
          pricePerUnit: p,
          message: message || undefined,
        });
        toast.success('Offer sent — the buyer will review it');
      }
      setOpenAction(null);
      fetchFeed();
    } catch (err: any) {
      // Carries the server's real message, so a 409 ("another farmer just
      // filled it") explains itself rather than reading as a generic error.
      toast.error(err.response?.data?.message || 'Failed to respond');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Requirements</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Buyers are <span className="cb-italic">looking.</span>
      </h1>
      <p className="cb-page-lede">
        Standing demand from verified buyers. Fill it at their price, or counter with yours.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 24, marginTop: 28, alignItems: 'start' }}>
        <RequirementFilters filters={filters} onChange={setFilters} />

        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 16 }}>
            {loading ? 'loading…' : `${total} open requirement${total === 1 ? '' : 's'}`}
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : requirements.length === 0 ? (
            <EmptyState
              title="No open requirements"
              description="Nothing matches these filters right now. Loosen them, or check back — buyers post new demand daily."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {requirements.map((r) => {
                const isOpen = openAction?.id === r.id;
                const mode = isOpen ? openAction!.mode : null;
                return (
                  <RequirementCard key={r.id} requirement={r} showMspWarning>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
                      <Button size="sm" onClick={() => toggleAction(r, 'fill')}>
                        Fill at {formatCurrency(r.pricePerUnit, r.currency)}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleAction(r, 'counter')}>
                        Counter
                      </Button>
                    </div>

                    {isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, padding: 12, background: 'var(--cb-paper-2)', borderRadius: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: mode === 'counter' ? '1fr 1fr' : '1fr', gap: 10 }}>
                          <Input
                            label={`Quantity (${r.unit.toLowerCase()})`}
                            type="number"
                            min={0}
                            max={r.remainingQuantity}
                            step="0.01"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            hint={`${r.remainingQuantity} still needed`}
                          />
                          {mode === 'counter' && (
                            <Input
                              label={`Your price / ${r.unit.toLowerCase()}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={price}
                              onChange={(e) => setPrice(e.target.value)}
                              hint={`Buyer offers ${formatCurrency(r.pricePerUnit, r.currency)}`}
                            />
                          )}
                        </div>
                        <Input
                          label="Message (optional)"
                          placeholder={mode === 'fill' ? 'Ready to dispatch this week' : 'Why your price is worth it'}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                        <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                          {mode === 'fill' ? 'You receive ' : 'You would receive '}
                          <strong className="cb-mono">
                            {formatCurrency(
                              (parseFloat(qty) || 0) * (mode === 'fill' ? r.pricePerUnit : parseFloat(price) || 0),
                              r.currency,
                            )}
                          </strong>
                          {mode === 'fill' && ' — the deal closes immediately.'}
                          {mode === 'counter' && ' if the buyer accepts.'}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <Button size="sm" onClick={() => submitAction(r)} loading={submitting}>
                            {mode === 'fill' ? 'Confirm fill' : 'Send offer'}
                          </Button>
                          <Button size="sm" variant="link" onClick={() => setOpenAction(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </RequirementCard>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
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
        </div>
      </div>
    </DashboardLayout>
  );
}
