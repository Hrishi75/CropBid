// =============================================================================
// BillDetails — what the shopper actually pays, itemised
// =============================================================================
// The same card on the cart and on the checkout, because the number must not
// change between the two screens. Every line here is a real line: the money
// column adds up to the amount the direct-purchase API will charge.
//
// WHY DELIVERY AND THE PLATFORM FEE ARE WORDS, NOT ZEROS
// Neither is charged to the shopper. The grower brings a retail order in on
// their local round, and CropBid's 2% comes out of the grower's settlement
// (transaction.service deducts platformFeeAmount from the payout) rather than
// being added on top. A "₹0" against each would read as a placeholder for a
// fee that lands later; saying who pays it is both shorter and true.
//
// If a delivery charge is ever levied, it arrives as `deliveryFee` and this
// card starts showing a number without any other page having to change.
// =============================================================================

import { formatCurrency } from '../../utils/currency';

interface BillDetailsProps {
  itemCount: number;
  itemsTotal: number;
  deliveryFee: number;
  toPay: number;
  currency: string;
  /** Rows the shopper still has in the basket that are not being billed. */
  excludedCount?: number;
  /** How many separate orders this bill becomes. Omitted on a single-lot bill. */
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
  toPay,
  currency,
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
        label="Delivery"
        value={deliveryFee > 0 ? formatCurrency(deliveryFee, currency) : 'Free'}
        muted={deliveryFee === 0}
      />
      <Row label="Platform fee" value="Paid by the grower" muted />

      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
          marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--cb-line)',
        }}
      >
        <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TO PAY</span>
        <span className="cb-mono" style={{ fontSize: 20, fontWeight: 600 }}>
          {formatCurrency(toPay, currency)}
        </span>
      </div>

      {excludedCount > 0 && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 10 }}>
          {excludedCount === 1 ? '1 lot in your cart is' : `${excludedCount} lots in your cart are`}{' '}
          not in this bill — see the note on {excludedCount === 1 ? 'it' : 'them'} above.
        </p>
      )}

      {orderCount != null && orderCount > 1 && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 10 }}>
          Each lot is settled with its own grower, so this becomes {orderCount} orders —
          one per lot, each tracked separately in Orders.
        </p>
      )}

      <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 10 }}>
        You pay after the order is placed. Money is held by CropBid and released to the
        grower only once you confirm the delivery arrived.
      </p>
    </div>
  );
}
