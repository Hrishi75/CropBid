import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import type { Transaction } from '../../types';

interface TransactionStats {
  total: number;
  inEscrow: number;
  released: number;
  refunded: number;
  totalRevenue: number;
}

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  ESCROW: { label: 'ESCR', color: 'var(--cb-wheat)' },
  RELEASED: { label: 'RELS', color: 'var(--cb-sage)' },
  REFUNDED: { label: 'RFND', color: 'var(--cb-ember)' },
};

const DELIVERY_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '— pending', color: 'var(--cb-ink-3)' },
  IN_TRANSIT: { label: '◷ in transit', color: 'var(--cb-info)' },
  DELIVERED: { label: '◷ delivered', color: 'var(--cb-wheat)' },
  CONFIRMED: { label: '✓ confirmed', color: 'var(--cb-sage)' },
};

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ESCROW', label: 'Escrow' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const [txRes, statsRes] = await Promise.all([
          api.get('/transactions'),
          api.get('/transactions/stats'),
        ]);
        setTransactions(txRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const filtered = filter ? transactions.filter((t) => t.paymentStatus === filter) : transactions;
  const currency = transactions[0]?.currency || 'INR';

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Transactions · ledger</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Every settled deal,<br />
            <span className="cb-italic">on the books.</span>
          </h1>
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">Export ↓ CSV</button>
      </div>

      {stats && (
        <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 8, marginBottom: 24 }}>
          <div className="cb-kpi-cell">
            <div className="cb-kpi-label">In escrow</div>
            <div className="cb-kpi-value">{stats.inEscrow}</div>
            <div className="cb-kpi-delta">awaiting release</div>
          </div>
          <div className="cb-kpi-cell">
            <div className="cb-kpi-label">Released</div>
            <div className="cb-kpi-value">{stats.released}</div>
            <div className="cb-kpi-delta pos">settled</div>
          </div>
          <div className="cb-kpi-cell">
            <div className="cb-kpi-label">Refunded</div>
            <div className="cb-kpi-value">{stats.refunded}</div>
            <div className="cb-kpi-delta">{stats.total > 0 ? `${((stats.refunded / stats.total) * 100).toFixed(1)}% rate` : '—'}</div>
          </div>
          <div className="cb-kpi-cell">
            <div className="cb-kpi-label">Volume</div>
            <div className="cb-kpi-value">{formatCurrency(stats.totalRevenue, currency)}</div>
            <div className="cb-kpi-delta pos">+18% QQ</div>
          </div>
        </div>
      )}

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {STATUS_FILTERS.map((tab) => (
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
        <EmptyState title="No transactions yet" description="Transactions are created when bids are accepted." />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {filtered.map((tx, i) => {
            const pmt = PAYMENT_META[tx.paymentStatus] || { label: tx.paymentStatus.slice(0, 4), color: 'var(--cb-ink-3)' };
            const dlv = DELIVERY_META[tx.deliveryStatus] || { label: tx.deliveryStatus.toLowerCase(), color: 'var(--cb-ink-3)' };
            return (
              <Link
                key={tx.id}
                to={`/transactions/${tx.id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '18px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--cb-line)' : 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #T-{tx.id.slice(-6).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500 }}>{tx.listing?.cropName || 'Crop'}</span>
                    {tx.listing?.cropVariety && <span className="cb-small" style={{ marginLeft: 6 }}>· {tx.listing.cropVariety}</span>}
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: pmt.color }}>● {pmt.label}</span>
                </div>
                <div className="cb-small" style={{ marginBottom: 8 }}>
                  {tx.farmer?.name} → {tx.buyer?.name} · {new Date(tx.createdAt).toLocaleDateString()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div className="cb-mono" style={{ fontSize: 14 }}>
                    {formatCurrency(tx.totalAmount, tx.currency)}
                  </div>
                  <div className="cb-mono cb-tiny">
                    {formatCurrency(tx.finalPricePerUnit, tx.currency)}/{tx.listing?.unit?.toLowerCase() || 'unit'}
                  </div>
                  <div className="cb-mono cb-tiny" style={{ color: dlv.color }}>
                    {dlv.label}
                  </div>
                </div>
                <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginTop: 8 }}>View settlement →</div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
