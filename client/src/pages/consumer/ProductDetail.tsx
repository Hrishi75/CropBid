// =============================================================================
// ProductDetail — a shopper's view of one direct-sale listing
// =============================================================================
// The retail twin of pages/shared/ListingDetail. That page shows a LOT: bid
// history, market position, MSP, top-quartile pricing — everything a company
// needs to decide what to offer. None of it means anything to someone buying
// two kilos of tomatoes, so this page shows a PRODUCT instead: photo, price,
// how much you want, what it costs, who grew it.
//
// Provenance is deliberately kept. On the B2B surfaces the counterparty is
// anonymous, but "grown by" is the entire pitch of the retail channel — a
// shopper is paying for the fact that a named farm grew it.
//
// Only listings with directSaleEnabled and a retailPricePerUnit can be bought
// here; anything else is bulk-only and says so rather than 404ing, since a
// stale link from the storefront should explain itself.
// =============================================================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { localizedDescription } from '../../utils/localized';
import { QuantityStepper, KG_PER_UNIT } from './QuantityStepper';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

export function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    api.get(`/listings/${id}`)
      .then(({ data }) => {
        setListing(data);
        // A quintal-denominated listing would otherwise open at "1", which is
        // 100 kg — start at the smallest sensible step instead.
        setQty(data.unit === 'KG' ? 1 : 0.5);
      })
      .catch(() => {
        toast.error('Product not found');
        navigate('/');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton height={32} width={240} />
        <div style={{ marginTop: 16 }}><Skeleton height={400} /></div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  const unit = listing.unit.toLowerCase();
  const retail = listing.retailPricePerUnit;
  const inStock = listing.remainingQuantity;

  // The shelf only ever shows local produce, but a link can be shared, pasted
  // or bookmarked — so the city rule is re-checked here rather than trusted to
  // the list that led here. Without this the filter would be cosmetic.
  const city = user?.location?.trim() || '';
  const outOfRange = city !== '' && listing.location.toLowerCase() !== city.toLowerCase();

  // SOLD/EXPIRED lots and lots the farmer never opened to retail both land here
  // from stale links, so treat "can I buy this" as one question.
  const buyable = listing.directSaleEnabled
    && retail != null
    && listing.status === 'ACTIVE'
    && inStock > 0
    && !outOfRange;

  const description = localizedDescription(listing, i18n.language);
  const total = retail != null ? retail * qty : 0;
  const image = listing.images[selectedImage] || cropImageFor(listing.cropName);

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>← Shop</Link>
        {' · '}{listing.cropName}
      </div>

      <div className="cn-split" style={{ marginTop: 16 }}>
        <div>
          <div className="cb-card" style={{ padding: 8 }}>
            <div style={{ aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)' }}>
              {image ? (
                <img src={image} alt={listing.cropName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    aria-label={`Photo ${i + 1}`}
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
              <div className="cb-eyebrow" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                {t('Description')}
                {description.isTranslated && (
                  <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', fontWeight: 400 }}>· {t('Translated')}</span>
                )}
              </div>
              <p className="cb-body" style={{ whiteSpace: 'pre-wrap' }}>{description.text}</p>
            </div>
          )}
        </div>

        <aside className="cn-aside">
          <div className="cb-card">
            <h1 className="cb-h3" style={{ fontSize: 24 }}>
              {listing.cropName}
              {listing.cropVariety && (
                <span className="cb-italic" style={{ display: 'block', fontSize: 18, marginTop: 4 }}>{listing.cropVariety}</span>
              )}
            </h1>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <span className="cb-chip">Grade {listing.qualityGrade}</span>
              {listing.organic && <span className="cb-chip cb-chip-sage">☘ Organic</span>}
              <span className="cb-chip">{listing.location}, {listing.state}</span>
            </div>

            {buyable ? (
              <>
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                  <div className="cb-mono" style={{ fontSize: 22, fontWeight: 500 }}>
                    {formatCurrency(retail!, listing.currency)}
                    <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', fontWeight: 400 }}> /{unit}</span>
                  </div>
                  <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
                    {inStock} {unit} left
                  </div>
                </div>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                  <div className="cb-eyebrow" style={{ marginBottom: 10 }}>How much?</div>
                  <QuantityStepper
                    value={qty}
                    onChange={setQty}
                    unit={listing.unit}
                    max={inStock}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL</span>
                    <span className="cb-mono" style={{ fontSize: 20, fontWeight: 600 }}>
                      {formatCurrency(total, listing.currency)}
                    </span>
                  </div>
                  {listing.unit !== 'KG' && (
                    <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', textAlign: 'right', marginTop: 2 }}>
                      that's {+(qty * KG_PER_UNIT[listing.unit]).toFixed(2)} kg
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 18 }}>
                  <Button
                    size="lg"
                    style={{ width: '100%' }}
                    onClick={() => navigate(`/checkout/${listing.id}?qty=${qty}`)}
                  >
                    Buy now
                    <ArrowIcon />
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                  {outOfRange
                    ? `This farm is in ${listing.location}, and you're in ${city}. Fresh produce doesn't travel that far — browse what's growing near you instead.`
                    : inStock <= 0 || listing.status !== 'ACTIVE'
                      ? 'Sold out. The grower may list more of this soon.'
                      : 'This lot is sold in bulk only — it is not open for retail orders.'}
                </p>
                <Link to="/" className="cb-btn cb-btn-ghost" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}>
                  Back to shop
                </Link>
              </div>
            )}

            {listing.farmer?.user && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Grown by</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{listing.farmer.user.name}</div>
                <div className="cb-tiny" style={{ marginTop: 2 }}>
                  {listing.farmer.state}
                  {listing.farmer.organicCertified && listing.farmer.certificationBody
                    && ` · ${listing.farmer.certificationBody} certified`}
                  {' · '}Trust ★ {Math.round(listing.farmer.user.trustScore || 0)}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
