import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { BidForm } from '../../components/bids/BidForm';
import { Skeleton } from '../../components/ui/Skeleton';
import { MiniChart } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

const SPARK = [4, 6, 5, 8, 7, 9, 11, 10, 12, 11, 13];

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
        <Skeleton height={32} width={240} />
        <div style={{ marginTop: 16 }}><Skeleton height={400} /></div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  const priceMid = (listing.pricePerUnitMin + listing.pricePerUnitMax) / 2;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Marketplace / <Link to={`/listings/${listing.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Lot #{listing.id.slice(-6).toUpperCase()}</Link> / Bid
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Make your<br />
        <span className="cb-italic">opening bid.</span>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 24, marginTop: 28 }}>
        <BidForm listing={listing} />

        <aside style={{ position: 'sticky', top: 76, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cb-card">
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--cb-paper-2)', overflow: 'hidden', flexShrink: 0 }}>
                {listing.images?.length > 0 ? (
                  <img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🌾</div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{listing.cropName}</div>
                {listing.cropVariety && <div className="cb-tiny" style={{ marginTop: 2 }}>{listing.cropVariety}</div>}
                <div className="cb-tiny" style={{ marginTop: 4 }}>Grade {listing.qualityGrade}{listing.organic && ' · Organic'}</div>
              </div>
            </div>
            <div className="cb-tiny" style={{ borderTop: '1px solid var(--cb-line)', paddingTop: 10 }}>
              {listing.quantity} {listing.unit.toLowerCase()} · {listing.location}, {listing.state}
            </div>
            {listing.farmer?.user && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
                <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Seller</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{listing.farmer.user.name}</div>
                <div className="cb-tiny" style={{ marginTop: 2 }}>Trust {Math.round(listing.farmer.user.trustScore || 0)}</div>
              </div>
            )}
          </div>

          <div className="cb-card">
            <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Agent intel</div>
            <div className="cb-small" style={{ marginBottom: 8 }}>
              Spot ref <span className="cb-mono" style={{ color: 'var(--cb-ink)' }}>{formatCurrency(priceMid, listing.currency)}/{listing.unit.toLowerCase()}</span>
            </div>
            <MiniChart data={SPARK} color="#6b8e4e" width={220} height={32} />
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Win likelihood</div>
              <div style={{ height: 6, background: 'var(--cb-paper-2)', borderRadius: 3 }}>
                <div style={{ width: '64%', height: '100%', background: 'var(--cb-sage)', borderRadius: 3 }} />
              </div>
              <div className="cb-tiny" style={{ marginTop: 4 }}>64% if bid ≥ {formatCurrency(priceMid, listing.currency)}</div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Suggested</div>
              <div className="cb-mono" style={{ fontSize: 16 }}>Counter at {formatCurrency(priceMid * 1.02, listing.currency)} to clear field</div>
            </div>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
