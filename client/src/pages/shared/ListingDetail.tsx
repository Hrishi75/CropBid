// =============================================================================
// ListingDetail — Full view of a single crop listing
// =============================================================================
// Fetches one listing by :id and shows its photos (with a thumbnail gallery),
// spec sheet, price range, and bid count. Buyers get a path to place a bid;
// the listing owner sees owner-oriented actions. Redirects back if not found.
// =============================================================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon, MiniChart } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import { mspForCrop } from '../../utils/msp';
import { cropImageFor } from '../../utils/cropImages';
import { localizedDescription } from '../../utils/localized';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

const SPARK = [4, 6, 5, 8, 7, 9, 11, 10, 12, 11, 13];

function SpecRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--cb-ink)' }}>{value}</span>
    </div>
  );
}

export function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  // useTranslation (not a module-level i18n read) so the description re-renders
  // when the reader switches language.
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [listing, setListing] = useState<(Listing & { _count?: { bids: number } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

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
        <Skeleton height={32} width={240} />
        <div style={{ marginTop: 16 }}><Skeleton height={400} /></div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  const priceMid = (listing.pricePerUnitMin + listing.pricePerUnitMax) / 2;
  const msp = mspForCrop(listing.cropName, listing.unit);
  const description = localizedDescription(listing, i18n.language);

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Marketplace / Lot #{listing.id.slice(-6).toUpperCase()}
      </div>

      <div className="cb-split-3-2" style={{ gap: 24, marginTop: 16 }}>
        <div>
          <div className="cb-card" style={{ padding: 8 }}>
            <div style={{ aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)' }}>
              {listing.images.length > 0 ? (
                <img
                  src={listing.images[selectedImage]}
                  alt={listing.cropName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : cropImageFor(listing.cropName) ? (
                <img
                  src={cropImageFor(listing.cropName)!}
                  alt={listing.cropName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>🌾</div>
              )}
            </div>
            {listing.images.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {listing.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(i)}
                    style={{
                      width: 56, height: 56, borderRadius: 6, overflow: 'hidden',
                      border: `2px solid ${i === selectedImage ? 'var(--cb-forest)' : 'transparent'}`,
                      padding: 0, cursor: 'pointer', background: 'transparent',
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {description.text && (
            <div className="cb-card" style={{ marginTop: 16 }}>
              <div
                className="cb-eyebrow"
                style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {t('Description')}
                {/* Buyers quote prices against this text, so say plainly when
                    they are reading a machine translation and not the
                    seller's own words. */}
                {description.isTranslated && (
                  <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', fontWeight: 400 }}>
                    · {t('Translated')}
                  </span>
                )}
              </div>
              <p className="cb-body" style={{ whiteSpace: 'pre-wrap' }}>{description.text}</p>
              {listing.farmer?.user && (
                <p className="cb-tiny" style={{ marginTop: 12, fontStyle: 'italic' }}>— {listing.farmer.user.name}</p>
              )}
            </div>
          )}

          <div className="cb-card" style={{ marginTop: 16 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 12 }}>Market position</div>
            <div className="cb-cols-2" style={{ gap: 12 }}>
              <SpecRow label="This lot · mid" value={<span className="cb-mono">{formatCurrency(priceMid, listing.currency)}</span>} />
              <SpecRow label="Mkt avg" value={<span className="cb-mono">{formatCurrency(priceMid * 0.985, listing.currency)}</span>} />
              {msp != null && listing.currency === 'INR' && (
                // MSP is an India-only government price in ₹ — only meaningful for INR listings.
                <SpecRow label="Govt MSP" value={<span className="cb-mono">{formatCurrency(msp, 'INR')}</span>} />
              )}
              <SpecRow label="Top quartile" value={<span className="cb-mono">{formatCurrency(priceMid * 1.05, listing.currency)}</span>} />
            </div>
            <div style={{ marginTop: 12 }}>
              <MiniChart data={SPARK} color="#6b8e4e" width={280} height={36} />
            </div>
            <div className="cb-mono cb-tiny" style={{ marginTop: 4, color: 'var(--cb-sage)' }}>
              Δ vs market: +1.5% ↑
            </div>
          </div>

          <div className="cb-card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="cb-eyebrow">Bid history</div>
              {listing._count && listing._count.bids > 0 && (
                <Link to="#" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>View thread →</Link>
              )}
            </div>
            <div className="cb-small">
              {listing._count?.bids
                ? `${listing._count.bids} bid${listing._count.bids === 1 ? '' : 's'} placed on this lot`
                : 'No bids yet. Be the first.'}
            </div>
          </div>
        </div>

        <aside style={{ position: 'sticky', top: 76, alignSelf: 'flex-start' }}>
          <div className="cb-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                #{listing.id.slice(-6).toUpperCase()}
              </span>
              <span className="cb-chip cb-chip-sage">● {listing.status}</span>
            </div>
            <h1 className="cb-h3" style={{ fontSize: 24 }}>
              {listing.cropName}
              {listing.cropVariety && <span className="cb-italic" style={{ display: 'block', fontSize: 18, marginTop: 4 }}>{listing.cropVariety}</span>}
            </h1>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 4 }}>PRICE / {listing.unit.toLowerCase()}</div>
              <div className="cb-mono" style={{ fontSize: 20, fontWeight: 500 }}>
                {formatCurrency(listing.pricePerUnitMin, listing.currency)} – {formatCurrency(listing.pricePerUnitMax, listing.currency)}
              </div>
              <div className="cb-range-track">
                <div className="cb-range-fill" style={{ left: 0, right: 0 }} />
                <div className="cb-range-marker" style={{ left: '0%' }} />
                <div className="cb-range-marker" style={{ left: '100%' }} />
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Specs</div>
              <SpecRow label="Quantity" value={`${listing.quantity} ${listing.unit.toLowerCase()}`} />
              <SpecRow label="Grade" value={`Grade ${listing.qualityGrade}`} />
              <SpecRow label="Harvest" value={listing.harvestDate ? new Date(listing.harvestDate).toLocaleDateString() : '—'} />
              <SpecRow label="Country" value={listing.country} />
              <SpecRow label="State" value={listing.state} />
              <SpecRow label="City" value={listing.location} />
            </div>

            {listing.organic && (
              <div style={{ marginTop: 14 }}>
                <span className="cb-chip cb-chip-sage">☘ Organic certified</span>
              </div>
            )}

            {listing.farmer?.user && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Seller</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{listing.farmer.user.name}</div>
                <div className="cb-tiny" style={{ marginTop: 2 }}>
                  Trust ★ {Math.round(listing.farmer.user.trustScore || 0)}
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Activity</div>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>
                ● {listing._count?.bids || 0} bids
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {user?.role === 'BUYER' && listing.status === 'ACTIVE' && (
                <Button onClick={() => navigate(`/listings/${listing.id}/bid`)} size="lg" style={{ width: '100%' }}>
                  Place bid
                  <ArrowIcon />
                </Button>
              )}
              {user?.role === 'FARMER' && listing.farmerId === user.farmerProfile?.id && (
                <Button variant="ghost" onClick={() => navigate(`/farmer/listings/${listing.id}/edit`)} style={{ width: '100%' }}>
                  ✎ Edit lot
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
