// =============================================================================
// Deliveries — Seller's dispatch board
// =============================================================================
// One place for a seller to watch every sold lot: lists all their deals with
// shipment state, splits them into awaiting transport (no shipment yet) and
// booked (tracking status from the shipment), and links each booked row into
// live tracking (/logistics/shipment/transaction/:transactionId).
//
// It is a board to READ, not to act on. CropBid books the carrier, because we
// inspect the goods on the way through, so there is no booking flow to link to
// from here any more and the API no longer sends this page a carrier name.
// What the seller does owe is the freight charge, which is why the lede says so
// before any row does.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import type { Transaction } from '../../types';

const SHIPMENT_META: Record<string, { label: string; color: string }> = {
  PENDING_PICKUP: { label: '◷ awaiting pickup', color: 'var(--cb-wheat)' },
  PICKED_UP: { label: '◷ picked up', color: 'var(--cb-info)' },
  IN_TRANSIT: { label: '◷ in transit', color: 'var(--cb-info)' },
  OUT_FOR_DELIVERY: { label: '◷ out for delivery', color: 'var(--cb-info)' },
  DELIVERED: { label: '✓ delivered', color: 'var(--cb-sage)' },
  FAILED: { label: '✗ failed', color: 'var(--cb-ember)' },
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'TO_BOOK', label: 'Awaiting transport' },
  { value: 'MOVING', label: 'In transit' },
  { value: 'DELIVERED', label: 'Delivered' },
];

const MOVING_STATUSES = ['PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];

export function Deliveries() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/transactions');
        setTransactions(res.data);
      } catch (err) {
        console.error('Failed to load deliveries:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const toBook = transactions.filter((t) => !t.shipment);
  const moving = transactions.filter((t) => t.shipment && MOVING_STATUSES.includes(t.shipment.status));
  const delivered = transactions.filter((t) => t.shipment?.status === 'DELIVERED');

  const filtered =
    filter === 'TO_BOOK' ? toBook
    : filter === 'MOVING' ? moving
    : filter === 'DELIVERED' ? delivered
    : transactions;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Deliveries · dispatch</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Every sold lot,<br />
            <span className="cb-italic">on its way.</span>
          </h1>
        </div>
      </div>

      {/*
        Says both halves of the arrangement in one place, because a seller who
        learns about the freight charge from a deduction later has been
        surprised by it. The same sentence appears on the settlement breakdown
        in TransactionDetail; if one changes, change the other.
      */}
      <p className="cb-page-lede" style={{ marginTop: 12 }}>
        CropBid books the transport and checks the goods before they travel.
        The freight charge is payable by you and comes out of your settlement.
      </p>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Awaiting transport</div>
          <div className="cb-kpi-value">{toBook.length}</div>
          <div className="cb-kpi-delta">we are arranging these</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">In transit</div>
          <div className="cb-kpi-value">{moving.length}</div>
          <div className="cb-kpi-delta">booked &amp; moving</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Delivered</div>
          <div className="cb-kpi-value">{delivered.length}</div>
          <div className="cb-kpi-delta pos">reached the buyer</div>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {FILTERS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${filter === tab.value ? 'active' : ''}`}
            onClick={() => setFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === 'TO_BOOK' ? 'Nothing waiting for transport' : 'No deliveries yet'}
          description="When a bid is accepted the deal lands here and we arrange the transport for it."
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {filtered.map((tx, i) => {
            const shp = tx.shipment;
            const meta = shp ? (SHIPMENT_META[shp.status] || { label: shp.status.toLowerCase(), color: 'var(--cb-ink-3)' }) : null;
            const awaitingPayment = tx.paymentStatus === 'AWAITING_PAYMENT';
            return (
              <div
                key={tx.id}
                style={{ padding: '18px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--cb-line)' : 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #T-{tx.id.slice(-6).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500 }}>{tx.listing?.cropName || 'Crop'}</span>
                    {tx.listing?.cropVariety && <span className="cb-small" style={{ marginLeft: 6 }}>· {tx.listing.cropVariety}</span>}
                  </div>
                  {meta ? (
                    <span className="cb-mono cb-tiny" style={{ color: meta.color }}>{meta.label}</span>
                  ) : (
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-wheat)' }}>◷ arranging transport</span>
                  )}
                </div>
                <div className="cb-small" style={{ marginBottom: 8 }}>
                  to {tx.buyer?.name || 'buyer'}
                  {(tx.bid?.contactPhone || tx.buyer?.phone) && (
                    <> · <a href={`tel:${tx.bid?.contactPhone || tx.buyer?.phone}`} style={{ color: 'var(--cb-ink)' }}>☎ {tx.bid?.contactPhone || tx.buyer?.phone}</a></>
                  )}
                  {/* Route, not carrier. The API stops sending logisticsPartner
                      to a seller at all, so there is nothing to print here. */}
                  {shp
                    ? <> · {shp.pickupLocation} → {shp.deliveryLocation}</>
                    : tx.bid?.deliveryAddress
                      ? <> · deliver to {tx.bid.deliveryAddress}</>
                      : tx.listing ? <> · from {tx.listing.location}, {tx.listing.state}</> : null}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                    <span className="cb-mono" style={{ fontSize: 14 }}>{formatCurrency(tx.totalAmount, tx.currency)}</span>
                    <span className="cb-mono cb-tiny">
                      {tx.bid?.quantity ?? tx.listing?.quantity} {tx.listing?.unit?.toLowerCase() || 'unit'}
                    </span>
                    {awaitingPayment && (
                      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>payment pending</span>
                    )}
                  </div>
                  {/* No "Book delivery" any more. We arrange it; the seller
                      watches it. Before pickup there is a status to read, not
                      an action to take, so the slot says what is happening
                      rather than offering a button that would 403. */}
                  {shp ? (
                    <Link to={`/logistics/shipment/transaction/${tx.id}`} className="cb-btn cb-btn-ghost" style={{ textDecoration: 'none' }}>
                      Track shipment →
                    </Link>
                  ) : (
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                      CropBid is arranging transport
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
