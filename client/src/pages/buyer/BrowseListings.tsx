import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { ListingFilters } from '../../components/listings/ListingFilters';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function BrowseListings() {
  const [listings, setListings] = useState<(Listing & { _count?: { bids: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState({
    search: '', crop: '', state: '', quality: '',
    organic: '', priceMin: '', priceMax: '', sort: 'createdAt',
  });

  useEffect(() => {
    setPage(1); // Reset to page 1 when filters change
  }, [filters]);

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
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.sort) {
        params.set('sort', filters.sort);
        // Determine order from sort field
        params.set('order', filters.sort === 'pricePerUnitMin' ? 'asc' : 'desc');
      }

      const { data } = await api.get(`/browse?${params.toString()}`);
      setListings(data.listings);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">Browse Listings</h1>
          <p className="text-text-secondary text-sm mt-1">
            Discover crops from verified farmers across India
            {total > 0 && <span className="text-text-muted"> &middot; {total} listing{total !== 1 ? 's' : ''} found</span>}
          </p>
        </div>

        <ListingFilters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-xl border border-border-light h-80 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🔍</p>
            <h2 className="text-xl font-semibold text-text mb-2">No listings found</h2>
            <p className="text-text-secondary">
              Try adjusting your filters or search terms.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm text-text-secondary">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
