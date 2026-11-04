// =============================================================================
// AdminTransactions — All deals + escrow oversight
// =============================================================================
// Admin table of every transaction (via /admin/transactions) with status-tab
// filtering and pagination. Surfaces payment + delivery status, platform fee,
// and the farmer/buyer pair for each closed deal.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency } from '../../utils/currency';
import { ConfirmButton } from './ConfirmButton';
import api from '../../lib/axios';
import { LoadFailed } from './LoadFailed';
import toast from 'react-hot-toast';

interface AdminTransaction {
  id: string;
  listing: { cropName: string; cropVariety: string | null; unit: string };
  farmer: { id: string; name: string; phone: string | null };
  buyer: { id: string; name: string; phone: string | null };
  // Fulfilment snapshot, captured on the bid at order time. Null on older
  // rows and on flows that never collected an address.
  bid: {
    quantity: number;
    deliveryAddress: string | null;
    contactPhone: string | null;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    isDirectPurchase: boolean;
  } | null;
  finalPricePerUnit: number;
  totalAmount: number;
  currency: string;
  platformFeeAmount: number;
  paymentStatus: string;
  deliveryStatus: string;
  // Null until ops books a carrier. Present means the freight is arranged, so
  // the row offers tracking rather than the booking form.
  shipment: { id: string; status: string } | null;
  // What the buyer paid for this deal (goods plus their share of delivery,
  // §2c), worked out on the server. A refund owes them this.
  buyerPaid: number;
  // A household lot's shop order. Its delivery fee is per order, so the row
  // carries how many of the order's lots are refunded.
  retailOrder: { id: string; deliveryFee: number; lots: number; refundedLots: number } | null;
  createdAt: string;
}

// Refunds only change a column (CLAUDE.md §6). The money goes back by hand,
// so the row says how much, rather than "refunded" reading as done.
//
// A shop order's delivery fee is per order, not per lot, and is owed back once,
// when every lot in it is refunded. So the lot's own line never includes it;
// the order's line says how many of its lots are refunded and, only once all
// are, that the fee goes back once for the whole order. Review caught the
// version that repeated the fee instruction on every lot.
function refundOwed(tx: AdminTransaction): string {
  return `Send ${formatCurrency(tx.buyerPaid, tx.currency)} back to the buyer by bank transfer. CropBid moves no money on its own.`;
}

function shopOrderFee(tx: AdminTransaction): string | null {
  const o = tx.retailOrder;
  if (!o || o.deliveryFee <= 0) return null;
  const ref = `Shop order #O-${o.id.slice(-6).toUpperCase()}`;
  const fee = formatCurrency(o.deliveryFee, tx.currency);
  return o.refundedLots >= o.lots
    ? `${ref}: all ${o.lots} ${o.lots === 1 ? 'lot' : 'lots'} refunded, so its ${fee} delivery fee goes back too, once for the whole order, not per lot.`
    : `${ref}: ${o.refundedLots} of ${o.lots} lots refunded. Its ${fee} delivery fee is owed back only once every lot is.`;
}

// Counted by the server over every deal, not the page on screen. There is no
// dispute record in the schema, so there is no dispute tile: it read "0, no
// SLA breach" as a constant. The fee rate is the one the server charges; the
// tile said 1% when it is 2%.
interface TransactionSummary {
  byStatus: { AWAITING_PAYMENT: number; ESCROW: number; RELEASED: number; REFUNDED: number; CANCELLED: number };
  total: number;
  feesOnReleased: number;
  feePercent: number;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'ESCROW', label: 'Escrow' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const PMT_META: Record<string, { label: string; color: string }> = {
  ESCROW: { label: 'ESCR', color: 'var(--cb-wheat)' },
  RELEASED: { label: 'RELS', color: 'var(--cb-sage)' },
  REFUNDED: { label: 'RFND', color: 'var(--cb-ember)' },
};

const DLV_META: Record<string, string> = {
  PENDING: '—',
  IN_TRANSIT: 'IN',
  DELIVERED: 'DLV',
  CONFIRMED: '✓',
};

export function AdminTransactions() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, page]);

  async function fetchTransactions() {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('paymentStatus', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/transactions?${params}`);
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
      setSummary(res.data.summary ?? null);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Asked through ConfirmButton, not window.confirm, which embedded browsers
  // can suppress without showing anything.
  async function handleRefund(txId: string) {
    try {
      await api.post(`/transactions/${txId}/refund`);
      toast.success('Marked refunded. The transfer back is still to make by hand.');
      fetchTransactions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Refund failed');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const st = summary?.byStatus;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Transactions · {total.toLocaleString()} total</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Settlement,<br />
            <span className="cb-italic">end to end.</span>
          </h1>
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">Export ↓ CSV</button>
      </div>

      {st && summary && (
      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Unpaid</div>
          <div className="cb-kpi-value">{st.AWAITING_PAYMENT}</div>
          <div className="cb-kpi-delta">awaiting payment</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">In escrow</div>
          <div className="cb-kpi-value">{st.ESCROW}</div>
          <div className="cb-kpi-delta">paid, not released</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Released</div>
          <div className="cb-kpi-value">{st.RELEASED}</div>
          <div className="cb-kpi-delta">seller due a transfer</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Refunded</div>
          <div className="cb-kpi-value">{st.REFUNDED}</div>
          <div className="cb-kpi-delta">{summary.total > 0 ? ((st.REFUNDED / summary.total) * 100).toFixed(1) : 0}% of all deals</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fees</div>
          <div className="cb-kpi-value">{formatCurrency(summary.feesOnReleased, 'INR')}</div>
          <div className="cb-kpi-delta">{summary.feePercent}% of released deals</div>
        </div>
      </div>
      )}

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => { setStatusFilter(tab.value); setPage(0); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : failed ? (
        <LoadFailed what="transactions" onRetry={fetchTransactions} />
      ) : transactions.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">No transactions match.</span></div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {transactions.map((tx, i) => {
            const pmt = PMT_META[tx.paymentStatus] || { label: tx.paymentStatus.slice(0, 4), color: 'var(--cb-ink-3)' };
            return (
              <div key={tx.id} style={{ padding: '16px 20px', borderBottom: i < transactions.length - 1 ? '1px solid var(--cb-line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #T-{tx.id.slice(-6).toUpperCase()}
                    </span>
                    <Link to={`/transactions/${tx.id}`} style={{ color: 'var(--cb-ink)', textDecoration: 'none', fontWeight: 500 }}>
                      {tx.listing?.cropName || 'Crop'}
                    </Link>
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: pmt.color }}>● {pmt.label} · {DLV_META[tx.deliveryStatus] || '?'}</span>
                </div>
                <div className="cb-small" style={{ marginBottom: 8 }}>
                  {tx.farmer?.name} → {tx.buyer?.name} · {new Date(tx.createdAt).toLocaleDateString()}
                  {tx.bid?.isDirectPurchase && (
                    <span className="cb-mono cb-tiny" style={{ marginLeft: 8, color: 'var(--cb-ink-3)' }}>
                      direct buy
                    </span>
                  )}
                </div>
                <div className="cb-cols-2" style={{ gap: 16 }}>
                  <div className="cb-mono" style={{ fontSize: 14 }}>
                    {formatCurrency(tx.totalAmount, tx.currency)}
                    {tx.bid && (
                      <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginLeft: 6 }}>
                        {tx.bid.quantity} {tx.listing?.unit}
                      </span>
                    )}
                  </div>
                  <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>
                    fee +{formatCurrency(tx.platformFeeAmount, tx.currency)}
                  </div>
                </div>

                {/* Fulfilment block — where this order ships and who to call.
                    Falls back to the buyer's account phone when the order flow
                    didn't capture a separate contact number. */}
                <div
                  className="cb-split-auto"
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed var(--cb-line)',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>
                      SHIP TO
                    </div>
                    <div className="cb-small">
                      {tx.bid?.deliveryAddress || (
                        <span style={{ color: 'var(--cb-ember)' }}>No address captured — call the buyer</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>
                      CONTACT
                    </div>
                    <div className="cb-mono" style={{ fontSize: 13 }}>
                      {tx.bid?.contactPhone || tx.buyer?.phone || '—'}
                    </div>
                  </div>
                </div>

                {(tx.bid?.paymentTerms || tx.bid?.deliveryTerms) && (
                  <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginTop: 6 }}>
                    {[tx.bid.paymentTerms, tx.bid.deliveryTerms].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Link to={`/transactions/${tx.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>View →</Link>
                  {/* Freight is ours to arrange, so this row is the only way
                      into the booking form. Sellers and buyers no longer have
                      one. A booked deal links to tracking instead. */}
                  {tx.shipment ? (
                    <Link to={`/logistics/shipment/transaction/${tx.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>
                      ⊞ Track delivery →
                    </Link>
                  ) : (
                    <Link to={`/admin/logistics/book/${tx.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>
                      ⊞ Book delivery →
                    </Link>
                  )}
                  {tx.paymentStatus === 'ESCROW' && (
                    <ConfirmButton
                      label="↺ Force refund"
                      confirmLabel={`Mark this deal refunded? ${refundOwed(tx)}`}
                      onConfirm={() => handleRefund(tx.id)}
                    />
                  )}
                </div>
                {tx.paymentStatus === 'REFUNDED' && (
                  <div className="cb-tiny" style={{ marginTop: 8, color: 'var(--cb-ember)' }}>
                    Refunded in CropBid. {refundOwed(tx)}
                    {shopOrderFee(tx) && <div style={{ marginTop: 4 }}>{shopOrderFee(tx)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
          <span>page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
        </div>
      )}
    </DashboardLayout>
  );
}
