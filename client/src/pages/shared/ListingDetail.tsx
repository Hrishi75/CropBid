import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MapPin, Calendar, Star, ArrowLeft, Leaf, Award } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<(Listing & { _count?: { bids: number } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    fetchListing();
  }, [id]);

  async function fetchListing() {
    try {
      const { data } = await api.get(`/listings/${id}`);
      setListing(data);
    } catch {
      toast.error('Listing not found');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-48" />
          <div className="h-96 bg-surface rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  const qualityLabels: Record<string, string> = {
    A: 'Premium', B: 'Standard', C: 'Economy',
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left — Images */}
          <div className="lg:col-span-3">
            <Card padding="sm">
              {/* Main image */}
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-surface-alt mb-2">
                {listing.images.length > 0 ? (
                  <img
                    src={listing.images[selectedImage]}
                    alt={listing.cropName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl">🌾</div>
                )}
              </div>

              {/* Thumbnail strip */}
              {listing.images.length > 1 && (
                <div className="flex gap-2">
                  {listing.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors
                        ${i === selectedImage ? 'border-primary' : 'border-transparent hover:border-accent'}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Description */}
            {listing.description && (
              <Card className="mt-4">
                <h3 className="font-semibold text-text mb-2">Description</h3>
                <p className="text-text-secondary text-sm whitespace-pre-wrap">
                  {listing.description}
                </p>
              </Card>
            )}
          </div>

          {/* Right — Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Title & Status */}
            <Card>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h1 className="text-xl font-bold text-text">
                    {listing.cropName}
                    {listing.cropVariety && (
                      <span className="text-text-secondary font-normal"> ({listing.cropVariety})</span>
                    )}
                  </h1>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium
                    ${listing.status === 'ACTIVE' ? 'bg-accent text-white' : 'bg-text-muted text-white'}`}>
                    {listing.status}
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="bg-surface-alt rounded-lg p-3 mb-3">
                <p className="text-xs text-text-muted mb-1">Price Range (per {listing.unit})</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(listing.pricePerUnitMin, listing.currency)}
                  {' – '}
                  {formatCurrency(listing.pricePerUnitMax, listing.currency)}
                </p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-muted">Quantity</p>
                  <p className="font-medium text-text">{listing.quantity} {listing.unit}</p>
                </div>
                <div>
                  <p className="text-text-muted">Quality</p>
                  <p className="font-medium text-text flex items-center gap-1">
                    <Award size={14} className="text-accent" />
                    Grade {listing.qualityGrade} ({qualityLabels[listing.qualityGrade]})
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">Location</p>
                  <p className="font-medium text-text flex items-center gap-1">
                    <MapPin size={14} /> {listing.location}, {listing.state}
                  </p>
                </div>
                {listing.harvestDate && (
                  <div>
                    <p className="text-text-muted">Harvest Date</p>
                    <p className="font-medium text-text flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(listing.harvestDate).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                {listing.organic && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    <Leaf size={12} /> Organic Certified
                  </span>
                )}
                {listing._count && listing._count.bids > 0 && (
                  <span className="px-2 py-1 bg-accent/10 text-accent text-xs rounded-full">
                    {listing._count.bids} bid{listing._count.bids !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </Card>

            {/* Farmer info */}
            {listing.farmer?.user && (
              <Card>
                <h3 className="font-semibold text-text mb-3">Seller</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {listing.farmer.user.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-text">{listing.farmer.user.name}</p>
                    <p className="text-xs text-text-secondary flex items-center gap-1">
                      <Star size={12} className="text-accent" />
                      Trust Score: {Math.round(listing.farmer.user.trustScore)}/100
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Action buttons */}
            {user?.role === 'BUYER' && listing.status === 'ACTIVE' && (
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate(`/listings/${listing.id}/bid`)}
              >
                Place a Bid
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
