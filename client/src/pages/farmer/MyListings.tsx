import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { Button } from '../../components/ui/Button';
import { Plus } from 'lucide-react';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<(Listing & { _count?: { bids: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchListings();
  }, [page]);

  async function fetchListings() {
    try {
      const { data } = await api.get(`/listings/my?page=${page}&limit=12`);
      setListings(data.listings);
      setTotalPages(data.pagination.totalPages);
    } catch (err: any) {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    try {
      await api.delete(`/listings/${id}`);
      toast.success('Listing deleted');
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">My Listings</h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage your crop listings
          </p>
        </div>
        <Link to="/farmer/listings/new">
          <Button size="md">
            <Plus size={18} className="mr-1" /> New Listing
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border-light h-80 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">🌱</p>
          <h2 className="text-xl font-semibold text-text mb-2">No listings yet</h2>
          <p className="text-text-secondary mb-6">
            Create your first crop listing to start receiving bids from buyers.
          </p>
          <Link to="/farmer/listings/new">
            <Button>Create Your First Listing</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showActions
                onEdit={(id) => navigate(`/farmer/listings/${id}/edit`)}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
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
    </DashboardLayout>
  );
}
