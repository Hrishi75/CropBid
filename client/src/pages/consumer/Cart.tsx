// =============================================================================
// Cart — the basket, priced against what is actually for sale
// =============================================================================
// The shop's middle step: everything the shopper has picked, in one list, with
// the bill underneath. Two things it deliberately does that a demo cart would
// not:
//
//   1. IT RE-PRICES ON OPEN. Every row is checked against its live listing
//      (useCartLines). A lot that sold out, went bulk-only or moved city stays
//      on screen with the reason, greyed and excluded from the bill, instead of
//      vanishing or — worse — being billed and then refused at the API.
//
//   2. IT SAYS HOW MANY ORDERS THIS IS. One basket is not one order here.
//      Every lot is a separate grower with a separate escrow settlement, so
//      four lots means four orders in Orders. Hiding that would make the orders
//      list look wrong the moment the shopper opened it.
//
// The stepper writes straight through to the cart, so quantity changes need no
// save button and no refetch — the price data is already in hand and only the
// arithmetic moves.
// =============================================================================

import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { pricePerKg, toKg } from '../../utils/units';
import { LANES } from '../../utils/delivery';
import { sellerDisplayName } from '../../utils/partner';
import type { DeliveryLane } from '../../utils/delivery';
import { QuantityStepper } from './QuantityStepper';
import { BillDetails } from './BillDetails';
import { useCartLines, type CartLine } from './cartLines';

function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  const { item, listing, price, problem, repriced } = line;
  const image = item.image || cropImageFor(item.cropName);
  // Live name wins over the snapshot, exactly as the live price does. A shop
  // that renamed itself, or a row saved before shop names existed, would
  // otherwise keep showing a name the shop page no longer uses.
  const seller = sellerDisplayName(listing?.farmer) ?? item.farmerName;
  // Stock can only be trusted once the live listing has landed; until then the
  // stepper's ceiling is the quantity already chosen, so it never offers more
  // than we know exists. In kilograms, like everything else the shopper sees.
  const max = listing ? toKg(listing.remainingQuantity, listing.unit) : item.quantity;

  return (
    <div className="cn-cart-row" style={problem ? { opacity: 0.55 } : undefined}>
      <Link to={`/shop/${item.listingId}`} className="cn-cart-img" aria-label={item.cropName}>
        {image
          ? <img src={image} alt="" />
          : <span style={{ fontSize: 26 }}>🌾</span>}
      </Link>

      <div className="cn-cart-main">
        <Link to={`/shop/${item.listingId}`} className="cn-cart-name">{item.cropName}</Link>
        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
          {item.cropVariety ? `${item.cropVariety} · ` : ''}
          {item.organic ? 'Organic' : `Grade ${item.qualityGrade}`}
          {seller ? ` · ${seller}` : ''}
        </div>
        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
          {formatCurrency(pricePerKg(price, item.unit), item.currency)}/kg
        </div>

        {problem && (
          <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>{problem}</div>
        )}
        {!problem && repriced && (
          <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>
            Price updated by the grower — was {formatCurrency(pricePerKg(item.pricePerUnit, item.unit), item.currency)}/kg.
          </div>
        )}
      </div>

      <div className="cn-cart-side">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantity}
          max={Math.max(max, item.quantity)}
          size="sm"
          onEmpty={onRemove}
        />
        <div className="cb-mono cn-cart-amt">{formatCurrency(line.lineTotal, item.currency)}</div>
        <button type="button" className="cn-cart-remove" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

export function Cart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, setQuantity, remove, clear } = useCart();
  const city = user?.location?.trim() || '';
  const bill = useCartLines(items, city);

  if (items.length === 0) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>← Shop</Link>{' · '}Cart
        </div>
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="Your cart is empty"
            description="Add produce from the shop and it collects here — one bill, however many growers it comes from."
            actionLabel="Start shopping"
            actionHref="/"
          />
        </div>
      </DashboardLayout>
    );
  }

  const blocked = bill.lines.length - bill.orderable.length;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>← Shop</Link>{' · '}Cart
      </div>

      <div className="cb-section-head" style={{ marginTop: 4 }}>
        <div>
          <h1 className="cb-h3" style={{ fontSize: 22 }}>
            {items.length} {items.length === 1 ? 'lot' : 'lots'} in your cart
          </h1>
          {city && (
            <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
              Delivering to {city}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clear}>Empty cart</Button>
      </div>

      <div className="cn-split" style={{ marginTop: 16 }}>
        {/* Grouped by when it arrives, not by when it was added. A basket
            spanning both lanes turns up in two deliveries, and a shopper who
            only finds that out at the door has been misled by the cart. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['QUICK', 'NEXT_MORNING'] as DeliveryLane[]).map((laneKey) => {
            const meta = LANES[laneKey];
            const rows = bill.lines.filter((l) => l.lane === laneKey);
            if (rows.length === 0) return null;
            return (
              <div key={laneKey} className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="cn-lane-bar" style={{ ['--lane-color' as string]: meta.color }}>
                  <strong>{meta.promise}</strong>
                  <span>{rows.length} {rows.length === 1 ? 'lot' : 'lots'}</span>
                </div>
                {rows.map((line, i) => (
                  <div
                    key={line.item.listingId}
                    style={i > 0 ? { borderTop: '1px solid var(--cb-line)' } : undefined}
                  >
                    <CartRow
                      line={line}
                      onQuantity={(qty) => setQuantity(line.item.listingId, qty)}
                      onRemove={() => remove(line.item.listingId)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
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
            disabled={bill.loading || bill.orderable.length === 0}
            onClick={() => navigate('/checkout')}
          >
            {bill.loading
              ? 'Checking stock…'
              : bill.orderable.length === 0
                ? 'Nothing to check out'
                : `Checkout · ${formatCurrency(bill.toPay, bill.currency)}`}
            {!bill.loading && bill.orderable.length > 0 && <ArrowIcon />}
          </Button>

          <Link to="/" className="cb-btn cb-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
            Keep shopping
          </Link>
        </aside>
      </div>
    </DashboardLayout>
  );
}
