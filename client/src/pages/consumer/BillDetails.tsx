// =============================================================================
// BillDetails — what the shopper actually pays, itemised
// =============================================================================
// The same card on the cart and on the checkout, because the number must not
// change between the two screens. Every line here is a real line: the money
// column adds up to what the shop orders will charge.
//
// DELIVERY IS PER SHOP. Each shop makes its own run: free from ₹200 of that
// shop's items, ₹30 below. The row is the sum across shops, and says how many
// are paying so a ₹60 line on a two-shop basket is not a mystery.
//
// THE PLATFORM FEE IS WORDS, NOT A ZERO. CropBid's 2% comes out of the
// seller's settlement rather than being added on top, so a "₹0" would read as a
// placeholder for a fee that lands later. Saying who pays it is shorter and true.
// =============================================================================

import { formatCurrency } from '../../utils/currency';
import type { RetailRules } from '../../types';

interface BillDetailsProps {
  itemCount: number;
  itemsTotal: number;
  /** Every shop's delivery fee together. Null when the rules could not be loaded. */
  deliveryFee: number | null;
  /** How many shops in this bill pay for delivery. */
  shopsPayingDelivery: number;
  toPay: number | null;
  currency: string;
  rules: RetailRules | null;
  /** Rows the shopper still has in the basket that are not being billed. */
  excludedCount?: number;
  /** How many separate orders this bill becomes: one per shop. */
  orderCount?: number;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--cb-ink-2)' }}>{label}</span>
      <span className="cb-mono" style={{ color: muted ? 'var(--cb-ink-3)' : 'var(--cb-ink)', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

export function BillDetails({
  itemCount,
  itemsTotal,
  deliveryFee,
  shopsPayingDelivery,
  toPay,
  currency,
  rules,
  excludedCount = 0,
  orderCount,
}: BillDetailsProps) {
  return (
    <div className="cb-card">
      <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Bill details</div>

      <Row
        label={`Items total (${itemCount} ${itemCount === 1 ? 'lot' : 'lots'})`}
        value={formatCurrency(itemsTotal, currency)}
      />
      <Row
        label={shopsPayingDelivery > 1 ? `Delivery (${shopsPayingDelivery} shops)` : 'Delivery'}
        value={deliveryFee === null
          ? 'Could not load'
          : deliveryFee > 0 ? formatCurrency(deliveryFee, currency) : 'Free'}
        muted={deliveryFee === 0}
      />
      <Row label="Platform fee" value="Paid by the seller" muted />

      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
          marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--cb-line)',
        }}
      >
        <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TO PAY</span>
        <span className="cb-mono" style={{ fontSize: 20, fontWeight: 600 }}>
          {toPay === null ? '—' : formatCurrency(toPay, currency)}
        </span>
      </div>

      {excludedCount > 0 && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 10 }}>
          {excludedCount === 1 ? '1 lot in your cart is' : `${excludedCount} lots in your cart are`}{' '}
          not in this bill — see the note on {excludedCount === 1 ? 'it' : 'them'} above.
        </p>
      )}

      {rules && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 10 }}>
          Delivery is free on {formatCurrency(rules.freeDeliveryFrom, currency)} or more from a
          shop, and {formatCurrency(rules.deliveryFee, currency)} per shop below that.
        </p>
      )}

      {orderCount != null && orderCount > 1 && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 10 }}>
          Each shop delivers separately, so this becomes {orderCount} orders: one per shop,
          each paid for and tracked on its own in Orders.
        </p>
      )}

      <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 10 }}>
        You pay after the order is placed. Money is held by CropBid and released to the
        seller only once you confirm the delivery arrived.
      </p>
    </div>
  );
}
