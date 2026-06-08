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
import api from '../../lib/axios';
import toast from 'react-hot-toast';

interface AdminTransaction {
  id: string;
  listing: { cropName: string; cropVariety: string | null; unit: string };
  farmer: { id: string; name: string };
  buyer: { id: string; name: string };
  finalPricePerUnit: number;
  totalAmount: number;
  currency: string;
  platformFeeAmount: number;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string;
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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, page]);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('paymentStatus', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/transactions?${params}`);
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund(txId: string) {
    if (!confirm('Refund this transaction?')) return;
    try {
      await api.post(`/transactions/${txId}/refund`);
      toast.success('Transaction refunded');
      fetchTransactions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Refund failed');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const inEscrow = transactions.filter((t) => t.paymentStatus === 'ESCROW').length;
  const released = transactions.filter((t) => t.paymentStatus === 'RELEASED').length;
  const refunded = transactions.filter((t) => t.paymentStatus === 'REFUNDED').length;
  const totalFees = transactions.reduce((sum, t) => sum + t.platformFeeAmount, 0);

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

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">In escrow</div>
          <div className="cb-kpi-value">{inEscrow}</div>
          <div className="cb-kpi-delta">awaiting</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Released</div>
          <div className="cb-kpi-value">{released}</div>
          <div className="cb-kpi-delta pos">settled</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Refunded</div>
          <div className="cb-kpi-value">{refunded}</div>
          <div className="cb-kpi-delta">{transactions.length > 0 ? ((refunded / transactions.length) * 100).toFixed(1) : 0}% rate</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Disputed</div>
          <div className="cb-kpi-value">0</div>
          <div className="cb-kpi-delta">no SLA breach</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Fees</div>
          <div className="cb-kpi-value">{formatCurrency(totalFees, 'INR')}</div>
          <div className="cb-kpi-delta">1% take</div>
        </div>
      </div>

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
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="cb-mono" style={{ fontSize: 14 }}>{formatCurrency(tx.totalAmount, tx.currency)}</div>
                  <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>
                    fee +{formatCurrency(tx.platformFeeAmount, tx.currency)}
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                  <Link to={`/transactions/${tx.id}`} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>View →</Link>
                  {tx.paymentStatus === 'ESCROW' && (
                    <button type="button" onClick={() => handleRefund(tx.id)} className="cb-btn cb-btn-link" style={{ fontSize: 12, color: 'var(--cb-ember)' }}>
                      ↺ Force refund
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
          <span>page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
        </div>
      )}
    </DashboardLayout>
  );
}
