// =============================================================================
// TransactionDetail — Single deal lifecycle + payment
// =============================================================================
// Shows one transaction and walks it through the lifecycle (MATCH → ESCROW →
// SHIPPED → DELIVERED → CONFIRMED → RELEASED). The buyer pays into escrow via
// Razorpay (lib/razorpay openCheckout); both sides advance delivery status and
// confirm receipt, which releases escrow to the farmer.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import { openCheckout } from '../../lib/razorpay';
import toast from 'react-hot-toast';
import type { Transaction, DeliveryStatus } from '../../types';

const DELIVERY_STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: 'PENDING', label: 'PENDING' },
  { key: 'IN_TRANSIT', label: 'SHIPPED' },
  { key: 'DELIVERED', label: 'DELIVERED' },
  { key: 'CONFIRMED', label: 'CONFIRMED' },
];

const LIFECYCLE = ['MATCH', 'ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'RELEASED'];

function SpecRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, gap: 8 }}>
      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--cb-ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/transactions/${id}`);
        setTransaction(res.data);
      } catch (err) {
        console.error('Failed to load transaction:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  async function handlePay() {
    if (!transaction) return;
    setPaying(true);
    try {
      // 1. Create a Razorpay order on the server for this transaction.
      const { data: order } = await api.post('/payments/order', { transactionId: transaction.id });

      // 2. Open Checkout. On success Razorpay calls handler with the signed handshake.
      await openCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'CropBid',
        description: `${transaction.listing?.cropName ?? 'Crop'} — escrow payment`,
        // Email is optional on an account now, so only prefill what we have.
        prefill: {
          name: user?.name,
          email: user?.email ?? undefined,
          contact: user?.phone ?? undefined,
        },
        theme: { color: '#2f6b3a' },
        handler: async (resp) => {
          try {
            // 3. Verify the signature server-side; transaction moves to ESCROW.
            const { data: updated } = await api.post('/payments/verify', resp);
            setTransaction(updated);
            toast.success('Payment captured — funds in escrow');
          } catch (err: any) {
            toast.error(err.response?.data?.message || 'Payment verification failed');
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not start payment');
      setPaying(false);
    }
  }

  // A retail order the shop cannot fulfil. It cancels the WHOLE shop order
  // (one delivery, one fee), puts the stock back and tells the shopper why,
  // which is why the reason is required rather than optional.
  async function cancelShopOrder() {
    const retailOrderId = transaction?.retailOrder?.id;
    if (!retailOrderId || cancelReason.trim().length === 0) return;
    setCancelling(true);
    try {
      await api.post(`/retail-orders/${retailOrderId}/cancel`, { reason: cancelReason.trim() });
      const res = await api.get(`/transactions/${id}`);
      setTransaction(res.data);
      setAskCancel(false);
      toast.success('Order cancelled, and the shopper has been told');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not cancel this order');
    } finally {
      setCancelling(false);
    }
  }

  async function updateDelivery(status: string) {
    setUpdating(true);
    try {
      const res = await api.patch(`/transactions/${id}/delivery`, { status });
      setTransaction(res.data);
      toast.success(`Marked ${status.replace('_', ' ').toLowerCase()}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Loading transaction…</div>
      </DashboardLayout>
    );
  }
  if (!transaction) {
    return (
      <DashboardLayout>
        <div className="cb-card" style={{ textAlign: 'center', padding: 32 }}>
          <span className="cb-tiny">Transaction not found.</span>
        </div>
      </DashboardLayout>
    );
  }

  const isFarmer = user?.id === transaction.farmerId;
  const isBuyer = user?.id === transaction.buyerId;

  // Freight is a real deduction from the seller's side, but only once we have
  // actually booked a carrier. Until then there is no cost to show, and 0 is
  // not a stand-in for "unknown": treating it as one would print a settlement
  // figure the seller is not going to receive.
  const freightCost = transaction.shipment?.transportCost ?? 0;
  const freightKnown = transaction.shipment?.transportCost != null;
  const currentStepIndex = DELIVERY_STEPS.findIndex((s) => s.key === transaction.deliveryStatus);

  const lifecycleStep = transaction.paymentStatus === 'RELEASED' ? 5
    : transaction.deliveryStatus === 'CONFIRMED' ? 4
    : transaction.deliveryStatus === 'DELIVERED' ? 3
    : transaction.deliveryStatus === 'IN_TRANSIT' ? 2
    : transaction.paymentStatus === 'ESCROW' ? 1
    : 0;

  // Where the money stands, in one word. A cancelled order is neither due nor
  // held: either nothing was ever taken, or it is on its way back.
  const moneyState = transaction.paymentStatus === 'AWAITING_PAYMENT' ? 'due'
    : transaction.paymentStatus === 'CANCELLED' ? 'not charged'
      : transaction.paymentStatus === 'REFUNDED' ? 'refunding'
        : transaction.paymentStatus === 'RELEASED' ? 'released'
          : 'held';

  // Retail shop orders only: a trade deal has a contract behind it, and
  // cancelling one is a conversation, not a button.
  const canCancel = isFarmer
    && transaction.retailOrder != null
    && !transaction.retailOrder.cancelledAt
    && transaction.deliveryStatus === 'PENDING';
  // A cancelled order has no journey left: the steps below would otherwise read
  // it as PENDING and reset the lifecycle to MATCH, telling the shop the
  // opposite of what just happened.
  const cancelled = transaction.deliveryStatus === 'CANCELLED';
  const nextAction = !cancelled && isFarmer && transaction.deliveryStatus === 'PENDING'
    ? { status: 'IN_TRANSIT', label: 'Mark as shipped' }
    : !cancelled && isFarmer && transaction.deliveryStatus === 'IN_TRANSIT'
      ? { status: 'DELIVERED', label: 'Mark as delivered' }
      : !cancelled && isBuyer && transaction.deliveryStatus === 'DELIVERED'
        ? { status: 'CONFIRMED', label: 'Confirm receipt' }
        : null;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div className="cb-page-eyebrow">
          <Link to="/transactions" style={{ color: 'inherit', textDecoration: 'none' }}>← Transactions</Link> · #T-{transaction.id.slice(-6).toUpperCase()}
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">↗ Contract.pdf ↓</button>
      </div>

      <div className="cb-card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span className="cb-chip cb-chip-wheat" style={{ fontSize: 11 }}>● {transaction.paymentStatus}</span>
          <span className="cb-mono" style={{ fontSize: 18, fontWeight: 500 }}>
            {formatCurrency(transaction.totalAmount, transaction.currency)} {moneyState}
          </span>
        </div>
        <h1 className="cb-h3" style={{ fontSize: 22, marginTop: 6 }}>
          {transaction.listing?.cropName}
          {transaction.listing?.cropVariety && <span className="cb-italic" style={{ marginLeft: 8 }}>· {transaction.listing.cropVariety}</span>}
        </h1>
        <div className="cb-small" style={{ marginTop: 4 }}>
          {transaction.bid?.quantity} {transaction.listing?.unit?.toLowerCase()} × {formatCurrency(transaction.finalPricePerUnit, transaction.currency)}/{transaction.listing?.unit?.toLowerCase()}
        </div>
        <div className="cb-small" style={{ marginTop: 4 }}>
          {transaction.farmer?.name} → {transaction.buyer?.name}
        </div>
      </div>

      {cancelled && (
        <div className="cb-card" style={{ marginBottom: 16 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Cancelled</div>
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
            {transaction.retailOrder?.cancelReason
              ? `Called off before dispatch. Reason given: ${transaction.retailOrder.cancelReason}.`
              : 'Called off before dispatch.'}
            {' '}The stock went back on the shelf.
            {transaction.paymentStatus === 'REFUNDED'
              ? ' The shopper had paid, so that money is going back to them by hand.'
              : ' Nothing was charged.'}
          </p>
        </div>
      )}

      {!cancelled && (
      <div className="cb-card" style={{ marginBottom: 16 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 18 }}>Lifecycle timeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {LIFECYCLE.map((step, i) => {
            const done = i < lifecycleStep;
            const current = i === lifecycleStep;
            const color = done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'var(--cb-line)';
            return (
              <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 6, left: '-50%', right: '50%', height: 1, background: done || current ? 'var(--cb-forest)' : 'var(--cb-line)' }} />
                )}
                <div style={{ width: 12, height: 12, borderRadius: 999, background: done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'transparent', border: `1px solid ${color}`, position: 'relative', zIndex: 1 }} />
                <span className="cb-mono cb-tiny" style={{ marginTop: 6, color, fontSize: 9.5 }}>{step}</span>
              </div>
            );
          })}
        </div>
        {nextAction && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
            <Button onClick={() => updateDelivery(nextAction.status)} loading={updating}>
              {nextAction.label}
              <ArrowIcon />
            </Button>
          </div>
        )}

        {/* A shop that has run out had no way to say so: it could only leave
            the order sitting. Retail only, and only until it is on the way. */}
        {canCancel && !askCancel && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="cb-tiny"
              onClick={() => setAskCancel(true)}
              style={{ background: 'none', border: 'none', color: 'var(--cb-ink-3)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Can't fulfil this order?
            </button>
          </div>
        )}

        {canCancel && askCancel && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Cancel this order</div>
            <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 10 }}>
              This cancels all {transaction.retailOrder?._count.transactions ?? 1}{' '}
              {(transaction.retailOrder?._count.transactions ?? 1) === 1 ? 'item' : 'items'} in it,
              puts the stock back on your shelf and tells the shopper. They see the reason you give.
            </p>
            <Input
              label="Why can't you fulfil it?"
              placeholder="Sold out this morning"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Button
                variant="ghost"
                onClick={cancelShopOrder}
                loading={cancelling}
                disabled={cancelReason.trim().length === 0}
              >
                Cancel the order
              </Button>
              <Button variant="ghost" onClick={() => setAskCancel(false)}>Keep it</Button>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="cb-cols-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Contract terms</div>
          <SpecRow label="Crop" value={transaction.listing?.cropName} />
          <SpecRow label="Quantity" value={`${transaction.bid?.quantity} ${transaction.listing?.unit?.toLowerCase()}`} />
          <SpecRow label="Price" value={<span className="cb-mono">{formatCurrency(transaction.finalPricePerUnit, transaction.currency)}/{transaction.listing?.unit?.toLowerCase()}</span>} />
          <SpecRow label="Total" value={<span className="cb-mono">{formatCurrency(transaction.totalAmount, transaction.currency)}</span>} />
          <SpecRow label="Platform fee" value={<span className="cb-mono">−{formatCurrency(transaction.platformFeeAmount, transaction.currency)}</span>} />
          {/*
            Freight. CropBid books the carrier and the seller carries the cost,
            so it belongs in the seller's column of this breakdown next to the
            platform fee.

            Two states, never one: the charge is only a number once a shipment
            exists. Before that we say who owes it and leave the amount blank,
            because a placeholder figure on a settlement screen is
            indistinguishable from a real one. Same reason `freightKnown` gates
            the total below.
          */}
          <SpecRow
            label="Delivery (paid by seller)"
            value={freightKnown
              ? <span className="cb-mono">−{formatCurrency(freightCost, transaction.currency)}</span>
              : <span className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>on booking</span>}
          />
          <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--cb-line)' }}>
            <SpecRow
              label={freightKnown ? 'Seller receives' : 'Seller receives, before delivery'}
              value={<span className="cb-mono" style={{ fontWeight: 600 }}>{formatCurrency(transaction.totalAmount - transaction.platformFeeAmount - freightCost, transaction.currency)}</span>}
            />
          </div>
          {/*
            Who books, and who pays. It stops there on purpose.

            DO NOT say we check the goods. Inspecting at pickup and settling on
            what we find is the INTENT behind owning the booking (CLAUDE.md
            §2b), not a thing that happens: ShipmentStatus has no inspection
            step, no result field, and no settlement can differ from the agreed
            price. The honest claim is that we book the carrier, so the
            delivery is ours to answer for.

            The same sentence is the lede on Deliveries. Change both.
          */}
          {isFarmer && (
            <p className="cb-tiny" style={{ marginTop: 8, color: 'var(--cb-ink-3)' }}>
              CropBid books the transport, so the delivery is ours to answer
              for. The freight charge is payable by you and is deducted from
              your settlement.
            </p>
          )}
          <SpecRow label="Lot ID" value={<span className="cb-mono">#{transaction.listingId.slice(-6).toUpperCase()}</span>} />
        </div>

        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Parties</div>
          <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>SELLER</div>
            <div style={{ fontWeight: 500, marginTop: 2 }}>{transaction.farmer?.name}</div>
            <div className="cb-tiny" style={{ marginTop: 2 }}>
              Trust {Math.round(transaction.farmer?.trustScore || 0)}
            </div>
          </div>
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>BUYER</div>
            <div style={{ fontWeight: 500, marginTop: 2 }}>{transaction.buyer?.name}{isBuyer && ' (YOU)'}</div>
            <div className="cb-tiny" style={{ marginTop: 2 }}>
              Trust {Math.round(transaction.buyer?.trustScore || 0)}
              {(transaction.bid?.contactPhone || transaction.buyer?.phone) && (
                <> · <a href={`tel:${transaction.bid?.contactPhone || transaction.buyer?.phone}`} style={{ color: 'var(--cb-ink)' }}>☎ {transaction.bid?.contactPhone || transaction.buyer?.phone}</a></>
              )}
            </div>
            {!isBuyer && transaction.contactReleased === false && (
              <div className="cb-tiny" style={{ marginTop: 2, color: 'var(--cb-ink-3)' }}>
                Contact details unlock once payment reaches escrow.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cb-cols-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Payment</div>
          <SpecRow label="Status" value={<span style={{ color: 'var(--cb-wheat)' }}>● {transaction.paymentStatus}</span>} />
          <SpecRow label={moneyState.charAt(0).toUpperCase() + moneyState.slice(1)} value={<span className="cb-mono">{formatCurrency(transaction.totalAmount, transaction.currency)}</span>} />
          <SpecRow label="Release" value="on delivery confirm" />
          <SpecRow label="Created" value={new Date(transaction.createdAt).toLocaleDateString()} />
          {transaction.razorpayPaymentId && (
            <SpecRow label="Razorpay" value={<span className="cb-mono cb-tiny">{transaction.razorpayPaymentId}</span>} />
          )}
          {isBuyer && transaction.paymentStatus === 'AWAITING_PAYMENT' && (
            <div style={{ marginTop: 14 }}>
              <Button onClick={handlePay} loading={paying} style={{ width: '100%' }}>
                Pay {formatCurrency(transaction.totalAmount, transaction.currency)} via Razorpay
                <ArrowIcon />
              </Button>
            </div>
          )}
        </div>

        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Delivery</div>
          <SpecRow label="Status" value={DELIVERY_STEPS[currentStepIndex]?.label || 'PENDING'} />
          {transaction.bid?.deliveryAddress && (
            <SpecRow label="Deliver to" value={transaction.bid.deliveryAddress} />
          )}
          {transaction.bid?.deliveryTerms && (
            <SpecRow label="Terms" value={[transaction.bid.paymentTerms, transaction.bid.deliveryTerms].filter(Boolean).join(' · ')} />
          )}
          {/* The carrier row is gone rather than dashed out. CropBid hires the
              haulier and the API withholds its identity from both sides, so a
              "Carrier —" row was promising a value that is never going to
              arrive. Booking moved to /admin/logistics/book/:id. */}
          <SpecRow label="Arranged by" value="CropBid" />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to={`/logistics/shipment/transaction/${id}`} className="cb-btn cb-btn-ghost" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>
              Track shipment →
            </Link>
          </div>
        </div>
      </div>

      <div className="cb-card" style={{ padding: 0 }}>
        <div className="cb-eyebrow" style={{ padding: '16px 20px 0' }}>Audit log</div>
        <div className="cb-table-wrap narrow">
          <table className="cb-table" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <td className="cb-mono" style={{ color: 'var(--cb-ink-3)', width: 100 }}>{new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>Match confirmed</td>
                <td className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>contract drafted</td>
              </tr>
              <tr>
                <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>Escrow lodged</td>
                <td className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{formatCurrency(transaction.totalAmount, transaction.currency)}</td>
              </tr>
              {transaction.deliveryStatus !== 'PENDING' && (
                <tr>
                  <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>—</td>
                  <td>Status: {transaction.deliveryStatus}</td>
                  <td className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>delivery update</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
