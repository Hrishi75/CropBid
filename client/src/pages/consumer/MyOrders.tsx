// =============================================================================
// MyOrders — a shopper's order history
// =============================================================================
// The retail framing of GET /transactions, which already scopes CONSUMER to
// their own buyer-side rows (transaction.service.getMyTransactions). No new
// endpoint: an order IS a transaction, just told in shopper language — what you
// bought, what it cost, and where it has got to.
//
// The card leads with whatever the shopper has to DO next: pay for it, or
// confirm it arrived. Everything else is status text.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { ORDER_STAGE } from './orderStage';
import api from '../../lib/axios';
import type { Transaction } from '../../types';

export function MyOrders() {
  const [orders, setOrders] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/transactions')
      .then(({ data }) => setOrders(data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Orders</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div className="cb-page-eyebrow">Orders</div>
      </div>

      {orders.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="No orders yet"
            description="Everything you buy shows up here, with its delivery status."
            actionLabel="Start shopping"
            actionHref="/"
          />
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((o) => {
            const stage = ORDER_STAGE(o);
            const unit = o.listing?.unit?.toLowerCase() ?? '';
            const image = o.listing?.images?.[0] || cropImageFor(o.listing?.cropName ?? '');

            return (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="cb-card cn-order-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)', flexShrink: 0 }}>
                  {image
                    ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 26 }}>🌾</div>}
                </div>

                <div className="cn-order-main">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{o.listing?.cropName}</span>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                      #{o.id.slice(-6).toUpperCase()}
                    </span>
                  </div>
                  <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
                    {o.bid?.quantity} {unit} · {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="cb-tiny" style={{ color: stage.color, marginTop: 4 }}>
                    ● {stage.label}
                  </div>
                </div>

                <div className="cn-order-amt">
                  <div className="cb-mono" style={{ fontWeight: 600 }}>
                    {formatCurrency(o.totalAmount, o.currency)}
                  </div>
                  {stage.action && (
                    <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>
                      {stage.action} →
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
