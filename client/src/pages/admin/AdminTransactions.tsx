// =============================================================================
// Admin Transactions — View and manage all platform transactions
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, ArrowRight, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
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
    if (!confirm('Are you sure you want to refund this transaction?')) return;
    try {
      await api.post(`/transactions/${txId}/refund`);
      toast.success('Transaction refunded');
      fetchTransactions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Refund failed');
    }
  }

  const paymentIcons: Record<string, { icon: typeof Shield; color: string; bg: string }> = {
    ESCROW: { icon: Shield, color: 'text-status-warning', bg: 'bg-yellow-50' },
    RELEASED: { icon: CheckCircle, color: 'text-status-success', bg: 'bg-green-50' },
    REFUNDED: { icon: AlertTriangle, color: 'text-status-error', bg: 'bg-red-50' },
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Receipt className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">All Transactions</h1>
          <span className="text-sm text-text-muted ml-auto">{total} transactions</span>
        </div>

        {/* Filter */}
        <div className="flex gap-4 mb-4">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary text-sm"
          >
            <option value="">All Payment Status</option>
            <option value="ESCROW">In Escrow</option>
            <option value="RELEASED">Released</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-text-muted">Crop</th>
                    <th className="pb-3 font-medium text-text-muted">Farmer → Buyer</th>
                    <th className="pb-3 font-medium text-text-muted">Amount</th>
                    <th className="pb-3 font-medium text-text-muted">Fee</th>
                    <th className="pb-3 font-medium text-text-muted">Payment</th>
                    <th className="pb-3 font-medium text-text-muted">Delivery</th>
                    <th className="pb-3 font-medium text-text-muted">Date</th>
                    <th className="pb-3 font-medium text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const payment = paymentIcons[tx.paymentStatus] || paymentIcons.ESCROW;
                    const PayIcon = payment.icon;

                    return (
                      <tr key={tx.id} className="border-b border-border-light hover:bg-surface-alt">
                        <td className="py-3 font-medium text-text-primary">
                          {tx.listing.cropName}
                        </td>
                        <td className="py-3 text-text-secondary text-xs">
                          {tx.farmer.name} → {tx.buyer.name}
                        </td>
                        <td className="py-3 font-medium">
                          {tx.currency} {tx.totalAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 text-text-muted">
                          {tx.currency} {tx.platformFeeAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${payment.bg} ${payment.color}`}>
                            <PayIcon className="w-3 h-3" />
                            {tx.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-text-muted">
                          {tx.deliveryStatus.replace('_', ' ')}
                        </td>
                        <td className="py-3 text-xs text-text-muted">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Link to={`/transactions/${tx.id}`} className="text-primary hover:underline">
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                            {tx.paymentStatus === 'ESCROW' && (
                              <button
                                onClick={() => handleRefund(tx.id)}
                                className="text-xs text-status-error hover:underline"
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
