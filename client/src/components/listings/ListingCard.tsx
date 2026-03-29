import { Link } from 'react-router-dom';
import { MapPin, Calendar, Star } from 'lucide-react';
import type { Listing } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface ListingCardProps {
  listing: Listing & { _count?: { bids: number } };
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ListingCard({ listing, showActions, onEdit, onDelete }: ListingCardProps) {
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-accent text-white',
    IN_AUCTION: 'bg-warning text-white',
    SOLD: 'bg-text-muted text-white',
    EXPIRED: 'bg-error text-white',
  };

  const qualityLabels: Record<string, string> = {
    A: 'Premium',
    B: 'Standard',
    C: 'Economy',
  };

  return (
    <article className="bg-surface rounded-xl border border-border-light overflow-hidden hover:shadow-md transition-all group">
      {/* Image */}
      <div className="relative h-48 bg-surface-alt overflow-hidden">
        {listing.images.length > 0 ? (
          <img
            src={listing.images[0]}
            alt={`${listing.cropName} listing`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-linear-to-br from-surface-alt to-surface">
            <span aria-hidden="true">🌾</span>
          </div>
        )}

        {/* Status badge */}
        <span className={`absolute top-2 right-2 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[listing.status] || 'bg-border text-text'}`}>
          {listing.status}
        </span>

        {/* Organic badge */}
        {listing.organic && (
          <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white">
            Organic
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold text-text">
              {listing.cropName}
              {listing.cropVariety && (
                <span className="text-text-secondary font-normal"> ({listing.cropVariety})</span>
              )}
            </h3>
            <p className="text-sm text-text-secondary">
              {listing.quantity} {listing.unit} · Grade {listing.qualityGrade} ({qualityLabels[listing.qualityGrade]})
            </p>
          </div>
        </div>

        {/* Price range */}
        <div className="mb-3">
          <p className="text-lg font-bold text-primary">
            {formatCurrency(listing.pricePerUnitMin, listing.currency)}
            {' – '}
            {formatCurrency(listing.pricePerUnitMax, listing.currency)}
            <span className="text-xs font-normal text-text-secondary">/{listing.unit}</span>
          </p>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap gap-3 text-xs text-text-secondary mb-3">
          <span className="flex items-center gap-1">
            <MapPin size={12} aria-hidden="true" />
            {listing.location}, {listing.state}
          </span>
          {listing.harvestDate && (
            <span className="flex items-center gap-1">
              <Calendar size={12} aria-hidden="true" />
              {new Date(listing.harvestDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </span>
          )}
          {listing.farmer?.user && (
            <span className="flex items-center gap-1">
              <Star size={12} aria-hidden="true" />
              {Math.round(listing.farmer.user.trustScore)}/100
            </span>
          )}
        </div>

        {/* Bid count */}
        {listing._count && (
          <p className="text-xs text-text-muted mb-3">
            {listing._count.bids} bid{listing._count.bids !== 1 ? 's' : ''} placed
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            to={`/listings/${listing.id}`}
            className="flex-1 text-center px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-light transition-colors"
          >
            View Details
          </Link>
          {showActions && (
            <>
              {onEdit && listing.status === 'ACTIVE' && (
                <button
                  onClick={() => onEdit(listing.id)}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors"
                  aria-label={`Edit ${listing.cropName} listing`}
                >
                  Edit
                </button>
              )}
              {onDelete && listing.status === 'ACTIVE' && (
                <button
                  onClick={() => onDelete(listing.id)}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-error text-error hover:bg-error hover:text-white transition-colors"
                  aria-label={`Delete ${listing.cropName} listing`}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
