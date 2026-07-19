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
        prefill: { name: user?.name, email: user?.email },
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
  const currentStepIndex = DELIVERY_STEPS.findIndex((s) => s.key === transaction.deliveryStatus);

  const lifecycleStep = transaction.paymentStatus === 'RELEASED' ? 5
    : transaction.deliveryStatus === 'CONFIRMED' ? 4
    : transaction.deliveryStatus === 'DELIVERED' ? 3
    : transaction.deliveryStatus === 'IN_TRANSIT' ? 2
    : transaction.paymentStatus === 'ESCROW' ? 1
    : 0;

  const nextAction = isFarmer && transaction.deliveryStatus === 'PENDING'
    ? { status: 'IN_TRANSIT', label: 'Mark as shipped' }
    : isFarmer && transaction.deliveryStatus === 'IN_TRANSIT'
      ? { status: 'DELIVERED', label: 'Mark as delivered' }
      : isBuyer && transaction.deliveryStatus === 'DELIVERED'
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
            {formatCurrency(transaction.totalAmount, transaction.currency)} {transaction.paymentStatus === 'AWAITING_PAYMENT' ? 'due' : 'held'}
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
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <Button onClick={() => updateDelivery(nextAction.status)} loading={updating}>
              {nextAction.label}
              <ArrowIcon />
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Contract terms</div>
          <SpecRow label="Crop" value={transaction.listing?.cropName} />
          <SpecRow label="Quantity" value={`${transaction.bid?.quantity} ${transaction.listing?.unit?.toLowerCase()}`} />
          <SpecRow label="Price" value={<span className="cb-mono">{formatCurrency(transaction.finalPricePerUnit, transaction.currency)}/{transaction.listing?.unit?.toLowerCase()}</span>} />
          <SpecRow label="Total" value={<span className="cb-mono">{formatCurrency(transaction.totalAmount, transaction.currency)}</span>} />
          <SpecRow label="Platform fee" value={<span className="cb-mono">−{formatCurrency(transaction.platformFeeAmount, transaction.currency)}</span>} />
          <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--cb-line)' }}>
            <SpecRow label="Farmer receives" value={<span className="cb-mono" style={{ fontWeight: 600 }}>{formatCurrency(transaction.totalAmount - transaction.platformFeeAmount, transaction.currency)}</span>} />
          </div>
          <SpecRow label="Lot ID" value={<span className="cb-mono">#{transaction.listingId.slice(-6).toUpperCase()}</span>} />
        </div>

        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Parties</div>
          <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>SELLER</div>
            <div style={{ fontWeight: 500, marginTop: 2 }}>{transaction.farmer?.name}</div>
            <div className="cb-tiny" style={{ marginTop: 2 }}>
              Trust {Math.round(transaction.farmer?.trustScore || 0)}
              {transaction.farmer?.phone && <> · <a href={`tel:${transaction.farmer.phone}`} style={{ color: 'var(--cb-ink)' }}>☎ {transaction.farmer.phone}</a></>}
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
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Payment</div>
          <SpecRow label="Status" value={<span style={{ color: 'var(--cb-wheat)' }}>● {transaction.paymentStatus}</span>} />
          <SpecRow label={transaction.paymentStatus === 'AWAITING_PAYMENT' ? 'Due' : 'Held'} value={<span className="cb-mono">{formatCurrency(transaction.totalAmount, transaction.currency)}</span>} />
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
          <SpecRow label="Carrier" value="—" />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to={`/logistics/shipment/transaction/${id}`} className="cb-btn cb-btn-ghost" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>
              Track shipment →
            </Link>
            {transaction.deliveryStatus === 'PENDING' && (
              <Link to={`/logistics/book/${id}`} className="cb-btn cb-btn-primary" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>
                ⊞ Book transport →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="cb-card" style={{ padding: 0 }}>
        <div className="cb-eyebrow" style={{ padding: '16px 20px 0' }}>Audit log</div>
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
    </DashboardLayout>
  );
}
