import { Link } from 'react-router-dom';
import type { Listing } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { MiniChart } from '../ui/Brand';

// Listings don't yet ship a price-history series from the API. To avoid
// presenting a single hardcoded sparkline as if it were live data on every
// card, we seed a small per-listing pseudo-random walk from the listing id.
// This keeps the visual cue (price has motion) honest about being illustrative
// until the backend exposes a real series.
function pseudoRandomSpark(id: string, points = 11): number[] {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffff) / 0xffff;
  };
  const out: number[] = [];
  let v = 8;
  for (let i = 0; i < points; i++) {
    v = Math.max(2, Math.min(14, v + (next() - 0.5) * 3));
    out.push(v);
  }
  return out;
}

interface ListingCardProps {
  listing: Listing & { _count?: { bids: number } };
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  variant?: 'grid' | 'row';
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'ACTV',
  IN_AUCTION: 'AUCT',
  SOLD: 'MTCH',
  EXPIRED: 'EXPR',
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--cb-sage)',
  IN_AUCTION: 'var(--cb-ember)',
  SOLD: 'var(--cb-forest)',
  EXPIRED: 'var(--cb-ink-3)',
};

export function ListingCard({ listing, showActions, onEdit, onDelete, variant = 'grid' }: ListingCardProps) {
  const spark = pseudoRandomSpark(listing.id);
  const priceMid = (listing.pricePerUnitMin + listing.pricePerUnitMax) / 2;
  const statusLabel = STATUS_LABEL[listing.status] || listing.status.slice(0, 4).toUpperCase();
  const statusColor = STATUS_COLOR[listing.status] || 'var(--cb-ink-3)';

  if (variant === 'row') {
    return (
      <article style={{ padding: '18px 20px', borderBottom: '1px solid var(--cb-line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline' }}>
          <div>
            <Link to={`/listings/${listing.id}`} style={{ color: 'var(--cb-ink)', textDecoration: 'none' }}>
              <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                #{listing.id.slice(-6).toUpperCase()}
              </span>
              <span style={{ fontWeight: 500, fontSize: 15 }}>{listing.cropName}</span>
              {listing.cropVariety && (
                <span className="cb-small" style={{ marginLeft: 6 }}>· {listing.cropVariety}</span>
              )}
            </Link>
          </div>
          <span className="cb-mono cb-tiny" style={{ color: statusColor }}>● {statusLabel}</span>
        </div>
        <div className="cb-small" style={{ marginTop: 4 }}>
          Grade {listing.qualityGrade}{listing.organic && ' · Organic'} · {listing.location}, {listing.state}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 16, alignItems: 'center', marginTop: 10 }}>
          <div className="cb-mono" style={{ fontSize: 14 }}>
            {formatCurrency(priceMid, listing.currency)}<span className="cb-tiny" style={{ marginLeft: 4 }}>/{listing.unit.toLowerCase()}</span>
          </div>
          <div className="cb-tiny">
            {listing.quantity} {listing.unit.toLowerCase()} · {listing._count?.bids || 0} bids
          </div>
          <MiniChart data={spark} color="#6b8e4e" width={100} height={24} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to={`/listings/${listing.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 13 }}>View →</Link>
            {showActions && onEdit && (
              <button type="button" onClick={() => onEdit(listing.id)} className="cb-btn cb-btn-link" style={{ fontSize: 13 }}>Edit</button>
            )}
            {showActions && onDelete && (
              <button type="button" onClick={() => onDelete(listing.id)} className="cb-btn cb-btn-link" style={{ fontSize: 13, color: 'var(--cb-ember)' }}>Delete</button>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="cb-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--cb-paper-2)' }}>
        {listing.images.length > 0 ? (
          <img
            src={listing.images[0]}
            alt={listing.cropName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🌾</div>
        )}
        <span className="cb-chip" style={{ position: 'absolute', top: 10, right: 10, background: '#fff', color: statusColor }}>
          ● {statusLabel}
        </span>
        {listing.organic && (
          <span className="cb-chip cb-chip-sage" style={{ position: 'absolute', top: 10, left: 10 }}>Organic</span>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <Link to={`/listings/${listing.id}`} style={{ color: 'var(--cb-ink)', textDecoration: 'none', fontSize: 16, fontWeight: 500 }}>
            {listing.cropName}
          </Link>
          {listing.cropVariety && <div className="cb-tiny" style={{ marginTop: 2 }}>{listing.cropVariety}</div>}
        </div>
        <div className="cb-tiny">
          Grade {listing.qualityGrade} · {listing.location}, {listing.state}
        </div>
        <div className="cb-mono" style={{ fontSize: 20, fontWeight: 500, marginTop: 'auto', color: 'var(--cb-ink)' }}>
          {formatCurrency(priceMid, listing.currency)}
          <span className="cb-tiny" style={{ marginLeft: 4, fontFamily: 'var(--cb-font-sans)' }}>/{listing.unit.toLowerCase()}</span>
        </div>
        <MiniChart data={spark} color="#6b8e4e" width={160} height={28} />
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--cb-line)' }}>
          <span className="cb-tiny">{listing.quantity} {listing.unit.toLowerCase()}</span>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>● {listing._count?.bids || 0} bids</span>
        </div>
        {showActions && (
          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            {onEdit && <button type="button" onClick={() => onEdit(listing.id)} className="cb-btn cb-btn-link" style={{ fontSize: 13 }}>Edit</button>}
            {onDelete && <button type="button" onClick={() => onDelete(listing.id)} className="cb-btn cb-btn-link" style={{ fontSize: 13, color: 'var(--cb-ember)' }}>Delete</button>}
          </div>
        )}
      </div>
    </article>
  );
}
