// =============================================================================
// CartBar — the basket, always one tap away
// =============================================================================
// A shopper filling a basket is scrolling a grid, not watching a header. The
// bar rides the bottom of the screen from the first ADD onwards so the running
// total is never something they have to go and look for, and the way to the
// cart is under the thumb on a phone.
//
// It paints from the cart's own snapshot rather than re-pricing every lot: this
// is a signpost, not a bill. The real number — checked against live stock and
// live prices — is on the cart and checkout pages, which is exactly why the bar
// hides itself on both. A summary bar under the bill it is summarising would
// just cover the button.
// =============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/currency';

export function CartBar() {
  const { user } = useAuth();
  const { items, count, snapshotTotal, currency } = useCart();
  const { pathname } = useLocation();

  // Retail only. A farmer or buyer has no basket, and an empty one has nothing
  // to say.
  if (user?.role !== 'CONSUMER' || items.length === 0) return null;
  if (pathname === '/cart' || pathname.startsWith('/checkout')) return null;

  const label = count === 1 ? '1 lot' : `${count} lots`;

  return (
    <>
      {/* The bar is fixed, so it would sit on top of whatever the page ends
          with — a checkout button, the last row of the footer. The spacer is
          rendered at the end of the document flow to give the page that height
          back, and only exists while the bar does. */}
      <div className="cn-cartbar-spacer" aria-hidden="true" />
      <Link to="/cart" className="cn-cartbar" aria-label={`View cart, ${label}`}>
        <span className="cn-cartbar-l">
          <span className="cn-cartbar-count">{count}</span>
          <span className="cn-cartbar-txt">
            <span className="cn-cartbar-items">{label}</span>
            <span className="cn-cartbar-total cb-mono">{formatCurrency(snapshotTotal, currency)}</span>
          </span>
        </span>
        <span className="cn-cartbar-cta">View cart →</span>
      </Link>
    </>
  );
}

// =============================================================================
// CartLink — the header's basket chip
// =============================================================================
// The storefront header is where a shopper looks for a cart on a desktop, out
// of habit from every other shop. The sticky bar covers the phone; this covers
// the muscle memory. It renders nothing when the basket is empty, so the
// header of a first-time shopper is unchanged.
// =============================================================================
export function CartLink() {
  const { user } = useAuth();
  const { count } = useCart();

  if (user?.role !== 'CONSUMER' || count === 0) return null;

  return (
    <Link to="/cart" className="st-cart-link" aria-label={count === 1 ? 'Cart, 1 lot' : `Cart, ${count} lots`}>
      <span aria-hidden="true">🧺</span>
      <span className="st-cart-count">{count}</span>
    </Link>
  );
}
