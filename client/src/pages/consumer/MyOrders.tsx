// =============================================================================
// MyOrders — a shopper's order history
// =============================================================================
// The retail framing of GET /transactions, which already scopes CONSUMER to
// their own buyer-side rows (transaction.service.getMyTransactions). No new
// endpoint: every item bought is a transaction, told in shopper language:
// what you bought, what it cost, and where it has got to.
//
// ONE CARD PER SHOP ORDER. Everything bought from one shop is one order with
// one delivery fee and one payment, so it is shown as one card with its items
// underneath, and the amount on it is what the shopper actually paid, delivery
// included. Orders placed before shop orders existed have none, and keep their
// one-card-per-item look.
//
// The card leads with whatever the shopper has to DO next: pay for it, or
// confirm it arrived. Everything else is status text.
//
// EVERYTHING STILL OWED IS ONE PAYMENT. Checkout opens payment straight away,
// so an unpaid order here is one whose payment window was closed. The banner at
// the top pays every unpaid shop order together, the same single approval the
// shopper would have made at checkout.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { formatWeight, toKg } from '../../utils/units';
import { sellerDisplayName } from '../../utils/partner';
import { ORDER_STAGE } from './orderStage';
import { payRetailOrders } from './payRetailOrders';
import api from '../../lib/axios';
import type { RetailOrderSummary, Transaction } from '../../types';

interface OrderGroup {
  key: string;
  shopOrder: RetailOrderSummary | null;
  items: Transaction[];
}

// Folds the item rows into shop orders, keeping the list's newest-first order:
// a shop order sits where its first item came back.
function groupOrders(orders: Transaction[]): OrderGroup[] {
  const groups: OrderGroup[] = [];
  const byShopOrder = new Map<string, OrderGroup>();
  for (const o of orders) {
    const shopOrder = o.retailOrder ?? null;
    if (!shopOrder) {
      groups.push({ key: o.id, shopOrder: null, items: [o] });
      continue;
    }
    const existing = byShopOrder.get(shopOrder.id);
    if (existing) {
      existing.items.push(o);
    } else {
      const group = { key: shopOrder.id, shopOrder, items: [o] };
      byShopOrder.set(shopOrder.id, group);
      groups.push(group);
    }
  }
  return groups;
}

// The order comes back denominated in the lot's unit; a shopper reads it in
// the kilograms they bought it in.
const orderedKg = (o: Transaction) => (o.listing?.unit ? toKg(o.bid?.quantity ?? 0, o.listing.unit) : null);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Thumb({ order, size }: { order: Transaction; size: number }) {
  const image = order.listing?.images?.[0] || cropImageFor(order.listing?.cropName ?? '');
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper-2)', flexShrink: 0 }}>
      {image
        ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: size * 0.43 }}>🌾</div>}
    </div>
  );
}

// One item on its own: an order from before shop orders, or a shop order that
// holds a single item. The amount is what was paid for it, delivery included.
function SingleOrderCard({ order, shopOrder }: { order: Transaction; shopOrder: RetailOrderSummary | null }) {
  const stage = ORDER_STAGE(order);
  const kg = orderedKg(order);
  // Which shop it came from. The storefront is organised by shop, so an order
  // that cannot name its own is the one place the thread breaks, and it is
  // what a shopper reorders by.
  const seller = sellerDisplayName(order.listing?.farmer);
  const amount = shopOrder ? shopOrder.totalAmount : order.totalAmount;

  return (
    <Link
      to={`/orders/${order.id}`}
      className="cb-card cn-order-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Thumb order={order} size={60} />

      <div className="cn-order-main">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 500 }}>{order.listing?.cropName}</span>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
            #{order.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
          {kg != null ? formatWeight(kg) : ''}
          {seller ? ` · ${seller}` : ''}
          {' · '}{shortDate(order.createdAt)}
        </div>
        <div className="cb-tiny" style={{ color: stage.color, marginTop: 4 }}>
          ● {stage.label}
        </div>
      </div>

      <div className="cn-order-amt">
        <div className="cb-mono" style={{ fontWeight: 600 }}>
          {formatCurrency(amount, order.currency)}
        </div>
        {shopOrder && shopOrder.deliveryFee > 0 && (
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
            incl. {formatCurrency(shopOrder.deliveryFee, shopOrder.currency)} delivery
          </div>
        )}
        {stage.action && (
          <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>
            {stage.action} →
          </div>
        )}
      </div>
    </Link>
  );
}

// Several items from one shop: one order, one payment, one delivery fee. The
// header carries the payment; each item keeps its own row and page, because
// delivery is still confirmed item by item.
function ShopOrderCard({ shopOrder, items }: { shopOrder: RetailOrderSummary; items: Transaction[] }) {
  const [first] = items;
  const seller = sellerDisplayName(first.listing?.farmer) ?? 'Shop order';
  const awaitingPayment = items.some((o) => o.paymentStatus === 'AWAITING_PAYMENT');

  return (
    <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
      <Link
        to={`/orders/${first.id}`}
        className="cn-order-row"
        style={{ textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--cb-line)' }}
      >
        <div className="cn-order-main">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{seller}</span>
            <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
              #{shopOrder.id.slice(-6).toUpperCase()}
            </span>
          </div>
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
            {items.length} items · {shortDate(first.createdAt)}
          </div>
          {awaitingPayment && (
            <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>● Payment due</div>
          )}
        </div>
        <div className="cn-order-amt">
          <div className="cb-mono" style={{ fontWeight: 600 }}>
            {formatCurrency(shopOrder.totalAmount, shopOrder.currency)}
          </div>
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
            {shopOrder.deliveryFee > 0
              ? `incl. ${formatCurrency(shopOrder.deliveryFee, shopOrder.currency)} delivery`
              : 'Free delivery'}
          </div>
          {awaitingPayment && (
            <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 4 }}>Pay now →</div>
          )}
        </div>
      </Link>

      {items.map((o, i) => {
        const stage = ORDER_STAGE(o);
        const kg = orderedKg(o);
        return (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            style={{
              display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px',
              textDecoration: 'none', color: 'inherit',
              ...(i > 0 ? { borderTop: '1px solid var(--cb-line)' } : {}),
            }}
          >
            <Thumb order={o} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>{o.listing?.cropName}</div>
              <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                {kg != null ? formatWeight(kg) : ''}
                {/* Payment is the shop order's, said once in the header. */}
                {!awaitingPayment && <span style={{ color: stage.color }}>{kg != null ? ' · ' : ''}{stage.label}</span>}
              </div>
            </div>
            <div className="cb-mono cb-tiny">{formatCurrency(o.totalAmount, o.currency)}</div>
          </Link>
        );
      })}
    </div>
  );
}

// Shop orders nothing has paid for yet. Orders from before shop orders
// existed have none, and are paid from their own page as they always were.
function unpaidShopOrders(groups: OrderGroup[]): RetailOrderSummary[] {
  return groups
    .filter((g) => g.shopOrder && !g.shopOrder.paidAt && g.items.some((o) => o.paymentStatus === 'AWAITING_PAYMENT'))
    .map((g) => g.shopOrder!);
}

export function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => (
    api.get('/transactions')
      .then(({ data }) => setOrders(data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  ), []);

  useEffect(() => { void load(); }, [load]);

  const groups = groupOrders(orders);
  const owed = unpaidShopOrders(groups);
  const owedTotal = Math.round(owed.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100;

  async function payAll() {
    setPaying(true);
    const { outcome, message } = await payRetailOrders(
      owed.map((o) => o.id),
      user,
      owed.length === 1 ? 'Your order' : `${owed.length} orders`,
    );
    if (outcome === 'paid') toast.success('Paid. Your order is on its way');
    if (outcome === 'failed') toast.error(message ?? 'Payment did not go through');
    await load();
    setPaying(false);
  }

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

      {owed.length > 0 && (
        <div className="cb-card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>
              {formatCurrency(owedTotal, owed[0].currency)} to pay
            </div>
            <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 2 }}>
              {owed.length === 1 ? '1 order is' : `${owed.length} orders are`} waiting for payment
              {owed.length > 1 ? ', paid together in one go' : ''}. The shop only gets your address
              and number once it is paid.
            </div>
          </div>
          <Button loading={paying} onClick={payAll}>
            Pay {formatCurrency(owedTotal, owed[0].currency)}
            <ArrowIcon />
          </Button>
        </div>
      )}

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
          {groups.map((g) => (g.shopOrder && g.items.length > 1
            ? <ShopOrderCard key={g.key} shopOrder={g.shopOrder} items={g.items} />
            : <SingleOrderCard key={g.key} order={g.items[0]} shopOrder={g.shopOrder} />))}
        </div>
      )}
    </DashboardLayout>
  );
}
