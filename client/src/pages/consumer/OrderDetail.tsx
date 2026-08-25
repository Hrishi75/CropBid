// =============================================================================
// OrderDetail — one order, its payment, and where it has got to
// =============================================================================
// The retail twin of pages/shared/TransactionDetail. That page is a contract
// view: platform fee, farmer net, lot id, audit log, book-transport. A shopper
// needs none of it — they need to pay, to watch it move, and to say it arrived.
//
// The two things that DO carry over are the ones with money attached, and they
// are deliberately the same calls the B2B page makes so there is one payment
// path on the client:
//   POST /payments/order + /payments/verify  → escrow (lib/razorpay)
//   PATCH /transactions/:id/delivery         → CONFIRMED, which releases escrow
//                                              to the grower and lifts both
//                                              trust scores by 2
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { ORDER_STAGE } from './orderStage';
import api from '../../lib/axios';
import { openCheckout } from '../../lib/razorpay';
import toast from 'react-hot-toast';
import type { Transaction } from '../../types';

// What the shopper sees of the journey. The underlying column has a PENDING
// state that means "paid, grower hasn't shipped yet" — "Preparing" says that
// in a way that doesn't read as an error.
const STEPS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Preparing' },
  { key: 'IN_TRANSIT', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CONFIRMED', label: 'Confirmed' },
];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, gap: 8 }}>
      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--cb-ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.get(`/transactions/${id}`)
      .then(({ data }) => setOrder(data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function handlePay() {
    if (!order) return;
    setPaying(true);
    try {
      const { data: rzp } = await api.post('/payments/order', { transactionId: order.id });

      await openCheckout({
        key: rzp.keyId,
        amount: rzp.amount,
        currency: rzp.currency,
        order_id: rzp.orderId,
        name: 'CropBid',
        description: `${order.listing?.cropName ?? 'Order'} — CropBid`,
        prefill: {
          name: user?.name,
          email: user?.email ?? undefined,
          contact: user?.phone ?? undefined,
        },
        theme: { color: '#2f6b3a' },
        handler: async (resp) => {
          try {
            const { data: updated } = await api.post('/payments/verify', resp);
            setOrder(updated);
            toast.success('Paid — your order is on its way');
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

  async function handleConfirm() {
    setConfirming(true);
    try {
      const { data } = await api.patch(`/transactions/${id}/delivery`, { status: 'CONFIRMED' });
      setOrder(data);
      toast.success('Thanks — the grower has been paid');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not confirm the delivery');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton height={32} width={200} />
        <div style={{ marginTop: 16 }}><Skeleton height={320} /></div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="cb-card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="cb-body">We couldn't find that order.</p>
          <Link to="/orders" className="cb-btn cb-btn-primary" style={{ marginTop: 16 }}>Back to orders</Link>
        </div>
      </DashboardLayout>
    );
  }

  const stage = ORDER_STAGE(order);
  const unit = order.listing?.unit?.toLowerCase() ?? '';
  const image = order.listing?.images?.[0] || cropImageFor(order.listing?.cropName ?? '');
  const stepIndex = STEPS.findIndex((s) => s.key === order.deliveryStatus);
  const awaitingPayment = order.paymentStatus === 'AWAITING_PAYMENT';
  const canConfirm = order.deliveryStatus === 'DELIVERED';

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/orders" style={{ color: 'inherit', textDecoration: 'none' }}>← Orders</Link>
        {' · '}#{order.id.slice(-6).toUpperCase()}
      </div>

      <div className="cb-card" style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)', flexShrink: 0 }}>
          {image
            ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 30 }}>🌾</div>}
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="cb-h3" style={{ fontSize: 20 }}>
            {order.listing?.cropName}
            {order.listing?.cropVariety && <span className="cb-italic" style={{ marginLeft: 8 }}>· {order.listing.cropVariety}</span>}
          </h1>
          <div className="cb-small" style={{ marginTop: 2 }}>
            {order.bid?.quantity} {unit} · {formatCurrency(order.totalAmount, order.currency)}
          </div>
          <div className="cb-tiny" style={{ color: stage.color, marginTop: 4 }}>● {stage.label}</div>
        </div>
      </div>

      {/* The one thing to do next, if there is one — full width, hard to miss. */}
      {(awaitingPayment || canConfirm) && (
        <div className="cb-card" style={{ marginTop: 16 }}>
          {awaitingPayment ? (
            <>
              <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Payment</div>
              <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginBottom: 14 }}>
                CropBid holds your money until you confirm the order arrived.
              </p>
              <Button size="lg" style={{ width: '100%' }} loading={paying} onClick={handlePay}>
                Pay {formatCurrency(order.totalAmount, order.currency)}
                <ArrowIcon />
              </Button>
            </>
          ) : (
            <>
              <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Did it arrive?</div>
              <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginBottom: 14 }}>
                Confirming releases the payment to the grower. Only do this once you have the goods.
              </p>
              <Button size="lg" style={{ width: '100%' }} loading={confirming} onClick={handleConfirm}>
                Yes, it arrived
                <ArrowIcon />
              </Button>
            </>
          )}
        </div>
      )}

      <div className="cb-card" style={{ marginTop: 16 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 18 }}>Tracking</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {STEPS.map((step, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            const color = done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'var(--cb-line)';
            return (
              <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 6, left: '-50%', right: '50%', height: 1, background: done || current ? 'var(--cb-forest)' : 'var(--cb-line)' }} />
                )}
                <div style={{ width: 12, height: 12, borderRadius: 999, background: done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'transparent', border: `1px solid ${color}`, position: 'relative', zIndex: 1 }} />
                <span className="cb-mono cb-tiny" style={{ marginTop: 6, color, fontSize: 10 }}>{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cn-pair" style={{ marginTop: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Summary</div>
          <Row label="Item" value={order.listing?.cropName} />
          <Row label="Quantity" value={`${order.bid?.quantity} ${unit}`} />
          <Row label="Price" value={<span className="cb-mono">{formatCurrency(order.finalPricePerUnit, order.currency)}/{unit}</span>} />
          <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--cb-line)' }}>
            <Row label="Paid" value={<span className="cb-mono" style={{ fontWeight: 600 }}>{formatCurrency(order.totalAmount, order.currency)}</span>} />
          </div>
          <Row label="Ordered" value={new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
        </div>

        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Delivery</div>
          {order.bid?.deliveryAddress && <Row label="To" value={order.bid.deliveryAddress} />}
          {order.bid?.contactPhone && <Row label="Phone" value={order.bid.contactPhone} />}
          <Row label="From" value={`${order.listing?.location ?? ''}${order.listing?.state ? `, ${order.listing.state}` : ''}`} />
          {order.farmer?.name && <Row label="Grown by" value={order.farmer.name} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
