// =============================================================================
// BrowseListings — Buyer marketplace browse
// =============================================================================
// The buyer's shopping view. Combines ListingFilters (search/crop/state/grade/
// price/sort) with a paginated, grid-or-row list of ListingCards from /browse.
// Filters and page sync into the query string; changing a filter resets to
// page 1. Each card links to ListingDetail / PlaceBid.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { ListingFilters } from '../../components/listings/ListingFilters';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import api from '../../lib/axios';
import { FRESH_PRODUCE_CROPS } from '../../utils/crops';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function BrowseListings() {
  const [listings, setListings] = useState<(Listing & { _count?: { bids: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<'grid' | 'row'>('grid');

  const [filters, setFilters] = useState({
    search: '', crop: '', state: '', quality: '',
    organic: '', freshProduce: '', priceMin: '', priceMax: '', sort: 'createdAt',
  });

  useEffect(() => { setPage(1); }, [filters]);

  useEffect(() => {
    fetchListings();
  }, [filters, page]);

  async function fetchListings() {
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
      if (filters.freshProduce === 'true' && !filters.crop) {
        params.set('crops', FRESH_PRODUCE_CROPS.join(','));
      }
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.sort) {
        params.set('sort', filters.sort);
        params.set('order', filters.sort === 'pricePerUnitMin' ? 'asc' : 'desc');
      }
      const { data } = await api.get(`/browse?${params.toString()}`);
      setListings(data.listings);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Marketplace · live · {total > 0 ? `${total} lots clearing` : 'loading'}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Sourced from<br />
        <span className="cb-italic">20+ origins.</span>
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cb-pill-group">
          <button type="button" className={`cb-pill ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={`cb-pill ${view === 'row' ? 'active' : ''}`} onClick={() => setView('row')}>Table</button>
        </div>
        <Link to="/agent" className="cb-btn cb-btn-primary" style={{ marginLeft: 'auto' }}>
          Brief agent
          <ArrowIcon />
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
        <ListingFilters filters={filters} onChange={setFilters} />

        <div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={view === 'grid' ? 320 : 80} />)}
            </div>
          ) : listings.length === 0 ? (
            <EmptyState
              title="No lots match"
              description="Loosen filters or brief your agent to auto-bid as new lots land."
            />
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {listings.map((l) => <ListingCard key={l.id} listing={l} variant="grid" />)}
            </div>
          ) : (
            <div className="cb-card" style={{ padding: 0 }}>
              {listings.map((l) => <ListingCard key={l.id} listing={l} variant="row" />)}
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
