import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Plus, Package } from 'lucide-react';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<(Listing & { _count?: { bids: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setListings(prev => prev.filter(l => l.id !== deleteTarget));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
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
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8" />}
          title="No listings yet"
          description="Create your first crop listing to start receiving bids from buyers."
          actionLabel="Create Your First Listing"
          onAction={() => navigate('/farmer/listings/new')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showActions
                onEdit={(id) => navigate(`/farmer/listings/${id}/edit`)}
                onDelete={(id) => setDeleteTarget(id)}
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

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Listing"
        message="This will permanently remove the listing and all associated bids. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
