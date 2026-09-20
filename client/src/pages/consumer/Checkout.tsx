// =============================================================================
// Checkout — turn the basket into real orders
// =============================================================================
// ONE BASKET, ONE ORDER PER SHOP, ONE PAYMENT
// Each shop delivers separately, so POST /retail-orders takes one shop's lines
// at a time: it claims their stock and works out that shop's delivery fee (free
// from ₹200, ₹30 below). Inside it every lot is still its own settlement,
// released when that lot arrives. A basket from three shops is three orders,
// and the page says so before the shopper commits.
//
// But it is ONE payment, opened the moment the orders exist, like any grocery
// app: sending a shopper off to find a pay button is a lost payment, and two
// approvals in a row for one basket is another. Closing the payment window
// leaves the orders waiting in Orders, which has a button for exactly that.
//
// A SHOP'S ORDER IS ALL OR NOTHING, THE BASKET IS NOT
// If one of a shop's lots has sold out underneath the basket, that shop's whole
// order fails, because a delivery fee worked out on four items is wrong for
// three. Other shops are separate requests and may already have succeeded, and
// a client cannot unwind those. So the shops that worked leave the cart, the
// ones that failed STAY in it with the reason, and the shopper is told which.
//
// AND A FAILURE IS NOT ALWAYS A FAILURE
// A request whose response is lost on the way back is indistinguishable here
// from one the server rejected: both land in the catch, and both leave the
// shop's lots sitting in the cart looking unbought. Every line therefore
// carries a purchaseKey (see CartContext), sent as that line's idempotencyKey,
// and a retry with the same keys returns the order that already exists instead
// of claiming the stock again. The keys live in the stored cart rather than in
// this component, because a shopper whose request vanished may well reload the
// page before trying again.
//
// THE FEE THE SHOPPER SAW IS SENT WITH THE ORDER
// If a re-price has moved a shop across ₹200 since the bill was drawn, the
// server refuses rather than charge a fee nobody was shown.
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
import { formatWeight, pricePerKg, toKg } from '../../utils/units';
import { LANES } from '../../utils/delivery';
import { cropImageFor } from '../../utils/cropImages';
import { BillDetails } from './BillDetails';
import { useCartLines } from './cartLines';
import { payRetailOrders } from './payRetailOrders';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing, RetailOrder } from '../../types';

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
    const shops = bill.shops.filter((shop) => shop.orderable.length > 0);
    if (!addressValid || !phoneValid || shops.length === 0 || bill.deliveryFee === null) return;

    setPlacing(true);

    const placedLots: string[] = [];
    const placedOrders: RetailOrder[] = [];
    const failures: { name: string; message: string }[] = [];

    // Sequential, not Promise.all: each call decrements stock, and a seller
    // watching their listings should see orders arrive as orders, not as a
    // burst of parallel writes racing each other's stock claims.
    for (const shop of shops) {
      try {
        const { data: order } = await api.post<RetailOrder>('/retail-orders', {
          lines: shop.orderable.map((line) => ({
            listingId: line.item.listingId,
            // The one place kilograms turn back into the lot's own unit, worked
            // out in cartLines with the LIVE unit rather than the snapshot on
            // line.item: a seller can change an active listing's denomination
            // while it sits in the basket, and converting with the stale one
            // sends a 1 kg order the server reads as 1 quintal.
            quantity: line.orderQuantity,
            // The unit that conversion used, so the server can refuse the
            // mismatch instead of silently rescaling the order by a hundred.
            unit: line.unit,
            // The line's own key, minted when it was added and re-minted
            // whenever its quantity moved. A failure leaves the shop in the
            // cart carrying them, so pressing Place order again replays THIS
            // order rather than making a second one.
            idempotencyKey: line.item.purchaseKey,
          })),
          deliveryAddress: address.trim(),
          contactPhone: phone.trim(),
          deliveryFee: shop.deliveryFee,
        });
        placedOrders.push(order);
        placedLots.push(...shop.orderable.map((line) => line.item.listingId));
      } catch (err: any) {
        failures.push({
          name: shop.sellerName ?? 'One shop',
          message: err.response?.data?.message || 'Could not be ordered',
        });
      }
    }

    // Only what actually became an order leaves the basket.
    if (placedLots.length > 0) removeMany(placedLots);

    if (placedOrders.length === 0) {
      toast.error(failures[0]?.message || 'Could not place your order');
      setPlacing(false);
      return;
    }

    if (failures.length > 0) {
      toast.error(
        `${placedOrders.length} of ${placedOrders.length + failures.length} shops ordered. ` +
        `${failures.map((f) => `${f.name}: ${f.message}`).join(' ')} ` +
        'The rest is still in your cart.',
        { duration: 8000 },
      );
    }

    // Pay for everything that was placed, in one go. `placing` stays true
    // throughout: the placed lots have left the basket, and the guard at the
    // top would otherwise bounce an emptied checkout back to the cart behind
    // the payment window.
    const { outcome, message } = await payRetailOrders(
      placedOrders.map((o) => o.id),
      user,
      placedOrders.length === 1 ? 'Your order' : `${placedOrders.length} orders`,
    );
    if (outcome === 'paid') {
      toast.success('Paid. Your order is on its way');
    } else if (outcome === 'closed') {
      toast('Your order is placed. You can pay for it from Orders.');
    } else {
      toast.error(`${message} Your order is placed; you can pay from Orders.`, { duration: 8000 });
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
                hint="Every shop in this order uses this to arrange delivery."
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
                {/* One block per shop, because each is its own order: when it
                    arrives and what its delivery costs are stated here, the
                    last screen before money moves, not discovered after. */}
                {bill.shops.map((shop, si) => (
                  <div
                    key={shop.sellerId}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 12,
                      ...(si > 0 ? { paddingTop: 12, borderTop: '1px solid var(--cb-line)' } : {}),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{shop.sellerName ?? 'Seller'}</div>
                        <div className="cb-tiny" style={{ color: LANES[shop.lane].color }}>
                          {LANES[shop.lane].promise}
                        </div>
                      </div>
                      {shop.orderable.length > 0 && shop.deliveryFee !== null && (
                        <div className="cb-tiny" style={{ textAlign: 'right', color: 'var(--cb-ink-3)' }}>
                          Delivery{' '}
                          <span className="cb-mono" style={{ color: shop.deliveryFee > 0 ? 'var(--cb-ink)' : 'var(--cb-forest)' }}>
                            {shop.deliveryFee > 0 ? formatCurrency(shop.deliveryFee, bill.currency) : 'Free'}
                          </span>
                        </div>
                      )}
                    </div>
                    {shop.lines.map((line) => {
                      const image = line.item.image || cropImageFor(line.item.cropName);
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
                ))}
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
              shopsPayingDelivery={bill.shopsPayingDelivery}
              toPay={bill.toPay}
              currency={bill.currency}
              rules={bill.rules}
              excludedCount={blocked}
              orderCount={bill.orderCount}
            />
          )}

          {bill.rulesFailed ? (
            <Button size="lg" variant="ghost" style={{ width: '100%' }} onClick={bill.reload}>
              Couldn't load delivery charges. Try again
            </Button>
          ) : (
            <Button
              size="lg"
              style={{ width: '100%' }}
              loading={placing}
              disabled={bill.loading || bill.orderable.length === 0}
              onClick={handlePlaceOrder}
            >
              {bill.orderCount > 1 ? `Place ${bill.orderCount} orders and pay` : 'Place order and pay'}
              {bill.toPay !== null ? ` · ${formatCurrency(bill.toPay, bill.currency)}` : ''}
              <ArrowIcon />
            </Button>
          )}
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
