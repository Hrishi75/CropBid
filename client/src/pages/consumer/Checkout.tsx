// =============================================================================
// Checkout — turn a chosen quantity into a real order
// =============================================================================
// One listing, one order. POST /bids/direct-purchase claims the stock, mints a
// pre-ACCEPTED bid and opens a Transaction in the same DB transaction, so by
// the time this page returns the order genuinely exists and is awaiting payment.
//
// WHY THE ADDRESS AND PHONE ARE COLLECTED HERE
// The API treats both as optional and falls back to the buyer's profile, but
// bid.service then REFUSES a retail order that ends up with neither — a
// shopper whose profile has no address would get a 400 after clicking Buy.
// Asking here, prefilled from the profile, means that error never fires.
//
// The quantity arrives as a query param from the product page. It is re-read
// against the listing rather than trusted: a stale tab could carry a quantity
// that has since been sold to someone else, and the friendly place to catch
// that is before the request, not in the 409 handler.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing, Transaction } from '../../types';

export function Checkout() {
  const { listingId } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [address, setAddress] = useState(user?.location || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [touched, setTouched] = useState(false);

  const qty = Number(params.get('qty')) || 0;

  useEffect(() => {
    api.get(`/listings/${listingId}`)
      .then(({ data }) => setListing(data))
      .catch(() => {
        toast.error('Product not found');
        navigate('/');
      })
      .finally(() => setLoading(false));
  }, [listingId, navigate]);

  const addressValid = address.trim().length >= 6;
  // Same shape the signup form enforces, for the same reason: a delivery phone
  // that can't be dialled is worse than no order.
  const phoneValid =
    /^[+0-9][0-9\s\-()]*$/.test(phone.trim())
    && phone.trim().length <= 20
    && phone.replace(/[^0-9]/g, '').length >= 7;

  async function handlePlaceOrder() {
    setTouched(true);
    if (!listing || !addressValid || !phoneValid) return;

    setPlacing(true);
    try {
      const { data: bid } = await api.post('/bids/direct-purchase', {
        listingId: listing.id,
        quantity: qty,
        deliveryAddress: address.trim(),
        contactPhone: phone.trim(),
      });

      toast.success('Order placed');

      // The endpoint returns the Bid, not the Transaction that was created
      // alongside it, so find the order by its bid to land the shopper on a
      // page where they can pay straight away. If that lookup fails for any
      // reason the order still exists — send them to the list rather than
      // implying something went wrong.
      try {
        const { data: orders } = await api.get('/transactions');
        const match = (orders as Transaction[]).find((o) => o.bidId === bid.id);
        navigate(match ? `/orders/${match.id}` : '/orders');
      } catch {
        navigate('/orders');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not place the order');
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton height={32} width={240} />
        <div style={{ marginTop: 16 }}><Skeleton height={320} /></div>
      </DashboardLayout>
    );
  }

  if (!listing) return null;

  const unit = listing.unit.toLowerCase();
  const retail = listing.retailPricePerUnit;

  // Everything that makes this order impossible, answered in one place so the
  // page can explain itself instead of failing at the button.
  // Re-checked here as well as on the product page: this page can be reached
  // by a pasted URL, and it is the last gate before an order exists.
  const city = user?.location?.trim() || '';
  const outOfRange = city !== '' && listing.location.toLowerCase() !== city.toLowerCase();

  const blocker =
    !listing.directSaleEnabled || retail == null
      ? 'This lot is sold in bulk only.'
      : listing.status !== 'ACTIVE'
        ? 'This lot is no longer for sale.'
        : outOfRange
          ? `This farm is in ${listing.location} and you're in ${city} — too far for a fresh delivery.`
          : qty <= 0
            ? 'Pick a quantity first.'
            : qty > listing.remainingQuantity
              ? `Only ${listing.remainingQuantity} ${unit} left — go back and lower the quantity.`
              : null;

  const total = retail != null ? retail * qty : 0;
  const image = listing.images[0] || cropImageFor(listing.cropName);

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to={`/shop/${listing.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>← Back</Link>
        {' · '}Checkout
      </div>

      {blocker ? (
        <div className="cb-card" style={{ marginTop: 16, textAlign: 'center', padding: 32 }}>
          <p className="cb-body">{blocker}</p>
          <Link to="/" className="cb-btn cb-btn-primary" style={{ marginTop: 16 }}>Back to shop</Link>
        </div>
      ) : (
        <div className="cn-split" style={{ marginTop: 16 }}>
          <div className="cb-card">
            <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Where should it go?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="Delivery address"
                placeholder="Flat / street, area, city, PIN"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !addressValid ? 'Enter a full delivery address' : undefined}
              />
              <Input
                label="Phone"
                placeholder="+91-9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !phoneValid ? 'Enter a valid phone number' : undefined}
                hint="The grower uses this to arrange delivery."
              />
            </div>

            <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 18 }}>
              You pay after the order is placed. Money is held by CropBid and released
              to the grower only once you confirm the delivery arrived.
            </p>
          </div>

          <aside className="cn-aside">
            <div className="cb-card">
              <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Your order</div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)', flexShrink: 0 }}>
                  {image
                    ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 24 }}>🌾</div>}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>{listing.cropName}</div>
                  <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                    {qty} {unit} · Grade {listing.qualityGrade}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                  <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                    {formatCurrency(retail!, listing.currency)} × {qty} {unit}
                  </span>
                  <span className="cb-mono">{formatCurrency(total, listing.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--cb-line)' }}>
                  <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL</span>
                  <span className="cb-mono" style={{ fontSize: 20, fontWeight: 600 }}>
                    {formatCurrency(total, listing.currency)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <Button
                  size="lg"
                  style={{ width: '100%' }}
                  loading={placing}
                  onClick={handlePlaceOrder}
                >
                  Place order
                  <ArrowIcon />
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </DashboardLayout>
  );
}
