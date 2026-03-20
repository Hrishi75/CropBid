// =============================================================================
// Admin Listings — View all listings across the platform
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';

interface AdminListing {
  id: string;
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  unit: string;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: string;
  status: string;
  location: string;
  state: string;
  organic: boolean;
  createdAt: string;
  farmer: { user: { id: string; name: string } };
  _count: { bids: number };
}

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

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-50 text-green-700',
    IN_AUCTION: 'bg-red-50 text-red-700',
    SOLD: 'bg-blue-50 text-blue-700',
    EXPIRED: 'bg-gray-50 text-gray-600',
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Package className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">All Listings</h1>
          <span className="text-sm text-text-muted ml-auto">{total} listings</span>
        </div>

        {/* Filter */}
        <div className="flex gap-4 mb-4">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_AUCTION">In Auction</option>
            <option value="SOLD">Sold</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-text-muted">Crop</th>
                    <th className="pb-3 font-medium text-text-muted">Farmer</th>
                    <th className="pb-3 font-medium text-text-muted">Price Range</th>
                    <th className="pb-3 font-medium text-text-muted">Qty</th>
                    <th className="pb-3 font-medium text-text-muted">Location</th>
                    <th className="pb-3 font-medium text-text-muted">Bids</th>
                    <th className="pb-3 font-medium text-text-muted">Status</th>
                    <th className="pb-3 font-medium text-text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr key={listing.id} className="border-b border-border-light hover:bg-surface-alt">
                      <td className="py-3">
                        <p className="font-medium text-text-primary">
                          {listing.cropName}
                          {listing.cropVariety ? ` (${listing.cropVariety})` : ''}
                        </p>
                        {listing.organic && (
                          <span className="text-xs text-accent">Organic</span>
                        )}
                      </td>
                      <td className="py-3 text-text-secondary">
                        {listing.farmer.user.name}
                      </td>
                      <td className="py-3 text-text-secondary">
                        {listing.currency} {listing.pricePerUnitMin}–{listing.pricePerUnitMax}/{listing.unit}
                      </td>
                      <td className="py-3 text-text-secondary">
                        {listing.quantity} {listing.unit}
                      </td>
                      <td className="py-3 text-text-muted text-xs">
                        {listing.location}, {listing.state}
                      </td>
                      <td className="py-3 font-medium">{listing._count.bids}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[listing.status] || ''}`}>
                          {listing.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <Link to={`/listings/${listing.id}`} className="text-primary hover:underline">
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
