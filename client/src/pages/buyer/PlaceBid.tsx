import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidForm } from '../../components/bids/BidForm';
import { Card } from '../../components/ui/Card';
import { ArrowLeft, MapPin } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function PlaceBid() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/listings/${id}`)
      .then(({ data }) => setListing(data))
      .catch(() => {
        toast.error('Listing not found');
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-48" />
          <div className="h-64 bg-surface rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back to listing
        </button>

        {/* Listing summary */}
        <Card className="mb-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-surface-alt shrink-0">
              {listing.images.length > 0 ? (
                <img src={listing.images[0]} alt={listing.cropName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">🌾</div>
              )}
            </div>
            <div>
              <h2 className="font-semibold text-text">
                {listing.cropName}
                {listing.cropVariety && ` (${listing.cropVariety})`}
              </h2>
              <p className="text-sm text-text-secondary">
                {listing.quantity} {listing.unit} · Grade {listing.qualityGrade}
              </p>
              <p className="text-sm text-text-secondary flex items-center gap-1">
                <MapPin size={12} /> {listing.location}, {listing.state}
              </p>
              <p className="text-sm font-medium text-primary mt-1">
                {formatCurrency(listing.pricePerUnitMin, listing.currency)} – {formatCurrency(listing.pricePerUnitMax, listing.currency)} / {listing.unit}
              </p>
            </div>
          </div>
        </Card>

        <BidForm listing={listing} />
      </div>
    </DashboardLayout>
  );
}
