// =============================================================================
// Checkout — turn the basket into real orders
// =============================================================================
// ONE BASKET, SEVERAL ORDERS — AND WHY THAT IS NOT A BUG
// POST /bids/direct-purchase claims one lot's stock, mints a pre-ACCEPTED bid
// and opens a Transaction in the same DB transaction. That pairing is the whole
// escrow model: one lot, one grower, one settlement the shopper releases when
// that grower's produce arrives. Four lots genuinely are four settlements, so
// this page places four purchases and says so before the shopper commits,
// rather than inventing a basket-level order the rest of the system has no
// concept of.
//
// PARTIAL SUCCESS IS A REAL OUTCOME, SO IT IS HANDLED
// The calls go one at a time. If the third fails — someone else took the last
// two kilos in the seconds since the cart was priced — the first two orders
// already exist and cannot be unwound by a client. So the successful lots are
// removed from the cart, the failed ones are LEFT in it with the reason, and
// the shopper is told exactly which is which. Clearing the whole basket there
// would hide an order they still want; retrying the whole basket would
// double-order the two that worked.
//
// AND A FAILURE IS NOT ALWAYS A FAILURE
// A request whose response is lost on the way back is indistinguishable here
// from one the server rejected: both land in the catch, and both leave the lot
// sitting in the cart looking unbought. Retrying used to buy it a second time.
// Every line therefore carries a purchaseKey (see CartContext), sent as the
// request's idempotencyKey, and a retry with the same key returns the order
// that already exists instead of claiming the stock again. The key lives in the
// stored cart rather than in this component, because a shopper whose request
// vanished may well reload the page before trying again.
//
// WHY THE ADDRESS AND PHONE ARE COLLECTED HERE
// The API treats both as optional and falls back to the buyer's profile, but
// bid.service then REFUSES a retail order that ends up with neither. Asking
// here, prefilled from the profile, means that error never fires.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/currency';
import { formatWeight, fromKg, pricePerKg, toKg } from '../../utils/units';
import { LANES } from '../../utils/delivery';
import { cropImageFor } from '../../utils/cropImages';
import { BillDetails } from './BillDetails';
import { useCartLines } from './cartLines';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing, Transaction } from '../../types';

export function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, removeMany } = useCart();
  const city = user?.location?.trim() || '';
  const bill = useCartLines(items, city);

  const [placing, setPlacing] = useState(false);
  const [address, setAddress] = useState(user?.location || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [touched, setTouched] = useState(false);

  // An empty basket has nothing to check out, and the cart page is where the
  // shopper can see that and act on it. Guarded in an effect so the redirect
  // also fires when the last row is removed from another tab mid-checkout.
  useEffect(() => {
    if (items.length === 0 && !placing) navigate('/cart', { replace: true });
  }, [items.length, placing, navigate]);

  const addressValid = address.trim().length >= 6;
  // Same shape the signup form enforces, for the same reason: a delivery phone
  // that can't be dialled is worse than no order.
  const phoneValid =
    /^[+0-9][0-9\s\-()]*$/.test(phone.trim())
    && phone.trim().length <= 20
    && phone.replace(/[^0-9]/g, '').length >= 7;

  async function handlePlaceOrder() {
    setTouched(true);
    if (!addressValid || !phoneValid || bill.orderable.length === 0) return;

    setPlacing(true);

    const placed: string[] = [];
    const failures: { name: string; message: string }[] = [];
    let lastBidId: string | null = null;

    // Sequential, not Promise.all: each call decrements stock, and a farmer
    // watching their listings should see orders arrive as orders, not as a
    // burst of parallel writes racing each other's stock claims.
    for (const line of bill.orderable) {
      try {
        const { data: bid } = await api.post('/bids/direct-purchase', {
          listingId: line.item.listingId,
          // The one place kilograms turn back into the lot's own unit. The
          // whole retail surface is denominated in kg; the API is denominated
          // in whatever the farmer listed in, and this is the seam.
          //
          // line.unit, NOT line.item.unit: the second is the snapshot taken
          // when the row went into the basket, and a seller can change an
          // active listing's denomination while it sits there. Converting with
          // the stale one sends a number the server reads in a different unit
          // — a 1 kg order arriving as 1 quintal, charged and decremented as
          // such. The line carries the live unit for exactly this call.
          quantity: fromKg(line.quantity, line.unit),
          deliveryAddress: address.trim(),
          contactPhone: phone.trim(),
          // The line's own key, minted when it was added and re-minted whenever
          // its quantity moved. A failure leaves the line in the cart carrying
          // it, so pressing Place order again replays THIS purchase rather than
          // making a second one.
          idempotencyKey: line.item.purchaseKey,
        });
        placed.push(line.item.listingId);
        lastBidId = bid.id;
      } catch (err: any) {
        failures.push({
          name: line.item.cropName,
          message: err.response?.data?.message || 'Could not be ordered',
        });
      }
    }

    // Only what actually became an order leaves the basket.
    if (placed.length > 0) removeMany(placed);

    if (placed.length === 0) {
      toast.error(failures[0]?.message || 'Could not place your order');
      setPlacing(false);
      return;
    }

    if (failures.length > 0) {
      toast.error(
        `${placed.length} of ${placed.length + failures.length} ordered. ` +
        `${failures.map((f) => `${f.name}: ${f.message}`).join(' ')} ` +
        'The rest is still in your cart.',
        { duration: 8000 },
      );
    } else {
      toast.success(placed.length === 1 ? 'Order placed' : `${placed.length} orders placed`);
    }

    // A single order can be opened straight away, which is where the shopper
    // pays. The endpoint returns the Bid rather than the Transaction created
    // alongside it, so the order is found by its bid. Any failure in that
    // lookup is cosmetic — the order exists either way — so it falls back to
    // the list rather than implying something went wrong.
    if (placed.length === 1 && lastBidId) {
      try {
        const { data: orders } = await api.get('/transactions');
        const match = (orders as Transaction[]).find((o) => o.bidId === lastBidId);
        navigate(match ? `/orders/${match.id}` : '/orders');
        return;
      } catch {
        // falls through to the list
      }
    }
    navigate('/orders');
  }

  if (items.length === 0) return null;

  const blocked = bill.lines.length - bill.orderable.length;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/cart" style={{ color: 'inherit', textDecoration: 'none' }}>← Cart</Link>
        {' · '}Checkout
      </div>

      <div className="cn-split" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                hint="Every grower in this order uses this to arrange delivery."
              />
            </div>
          </div>

          <div className="cb-card">
            <div className="cb-eyebrow" style={{ marginBottom: 14 }}>
              Your order{bill.orderCount > 1 ? `s · ${bill.orderCount}` : ''}
            </div>

            {bill.loading ? (
              <Skeleton height={64} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* The order summary states the delivery day per line, because
                    this is the last screen before money moves and "when does
                    it come?" must not be a surprise after it does. */}
                {bill.lines.map((line) => {
                  const image = line.item.image || cropImageFor(line.item.cropName);
                  const lane = LANES[line.lane];
                  return (
                    <div
                      key={line.item.listingId}
                      style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        opacity: line.problem ? 0.55 : 1,
                      }}
                    >
                      <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)', flexShrink: 0 }}>
                        {image
                          ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 20 }}>🌾</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{line.item.cropName}</div>
                        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                          {formatWeight(line.quantity)} · {formatCurrency(pricePerKg(line.price, line.unit), line.item.currency)}/kg
                        </div>
                        {!line.problem && (
                          <div className="cb-tiny" style={{ color: lane.color, marginTop: 2 }}>
                            {lane.promise}
                          </div>
                        )}
                        {line.problem && (
                          <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 2 }}>
                            {line.problem} <Link to="/cart" style={{ color: 'inherit' }}>Fix in cart</Link>
                          </div>
                        )}
                      </div>
                      <div className="cb-mono" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
                        {line.problem ? '—' : formatCurrency(line.lineTotal, line.item.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="cn-aside" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bill.loading ? (
            <Skeleton height={230} />
          ) : (
            <BillDetails
              itemCount={bill.orderable.length}
              itemsTotal={bill.itemsTotal}
              deliveryFee={bill.deliveryFee}
              toPay={bill.toPay}
              currency={bill.currency}
              excludedCount={blocked}
              orderCount={bill.orderCount}
            />
          )}

          <Button
            size="lg"
            style={{ width: '100%' }}
            loading={placing}
            disabled={bill.loading || bill.orderable.length === 0}
            onClick={handlePlaceOrder}
          >
            {bill.orderable.length > 1 ? `Place ${bill.orderable.length} orders` : 'Place order'}
            <ArrowIcon />
          </Button>
        </aside>
      </div>
    </DashboardLayout>
  );
}

// =============================================================================
// BuyNowRedirect — keeps /checkout/:listingId?qty= working
// =============================================================================
// The shop used to send a shopper straight from a product to a one-lot
// checkout at this URL, and those links are bookmarked, pasted and sitting in
// old order emails. Rather than 404 them, the lot is put in the basket at the
// quantity the link carried and the shopper lands on the real checkout — the
// same order, now with anything else they had already picked.
// =============================================================================
export function BuyNowRedirect() {
  const { listingId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const qty = Number(params.get('qty')) || 0;

  useEffect(() => {
    let on = true;
    api.get(`/listings/${listingId}`)
      .then(({ data }: { data: Listing }) => {
        if (!on) return;
        // A link with no qty would otherwise add 0 and drop the row; fall back
        // to the same opening kilo the product page and the shelf both use.
        add(data, qty > 0 ? qty : Math.min(1, toKg(data.remainingQuantity, data.unit)));
        navigate('/checkout', { replace: true });
      })
      .catch(() => {
        if (!on) return;
        toast.error('Product not found');
        navigate('/', { replace: true });
      });
    return () => { on = false; };
    // add/navigate are stable; re-running on them would re-add the lot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, qty]);

  return (
    <DashboardLayout>
      <Skeleton height={32} width={240} />
      <div style={{ marginTop: 16 }}><Skeleton height={320} /></div>
    </DashboardLayout>
  );
}
