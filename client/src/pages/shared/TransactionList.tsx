// =============================================================================
// Transaction List — View all transactions with status tracking
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt, ArrowRight, Shield, Truck, CheckCircle,
  AlertTriangle, DollarSign, Package,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';
import type { Transaction } from '../../types';

interface TransactionStats {
  total: number;
  inEscrow: number;
  released: number;
  refunded: number;
  totalRevenue: number;
}

export function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  const paymentConfig = {
    ESCROW: { label: 'In Escrow', icon: Shield, color: 'text-status-warning', bg: 'bg-yellow-50' },
    RELEASED: { label: 'Released', icon: CheckCircle, color: 'text-status-success', bg: 'bg-green-50' },
    REFUNDED: { label: 'Refunded', icon: AlertTriangle, color: 'text-status-error', bg: 'bg-red-50' },
  };

  const deliveryConfig = {
    PENDING: { label: 'Pending', color: 'text-text-muted' },
    IN_TRANSIT: { label: 'In Transit', color: 'text-status-info' },
    DELIVERED: { label: 'Delivered', color: 'text-status-warning' },
    CONFIRMED: { label: 'Confirmed', color: 'text-status-success' },
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Receipt className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-center">
                <Package className="w-5 h-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
                <p className="text-xs text-text-muted">Total</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <Shield className="w-5 h-5 mx-auto mb-1 text-status-warning" />
                <p className="text-2xl font-bold text-text-primary">{stats.inEscrow}</p>
                <p className="text-xs text-text-muted">In Escrow</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <CheckCircle className="w-5 h-5 mx-auto mb-1 text-status-success" />
                <p className="text-2xl font-bold text-text-primary">{stats.released}</p>
                <p className="text-xs text-text-muted">Completed</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-accent" />
                <p className="text-2xl font-bold text-text-primary">
                  {stats.totalRevenue.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-muted">Revenue (INR)</p>
              </div>
            </Card>
          </div>
        )}

        {/* Transaction list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : transactions.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No transactions yet.</p>
              <p className="text-sm text-text-muted mt-1">
                Transactions are created when bids are accepted.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const payment = paymentConfig[tx.paymentStatus];
              const delivery = deliveryConfig[tx.deliveryStatus];
              const PaymentIcon = payment.icon;

              return (
                <Link key={tx.id} to={`/transactions/${tx.id}`} className="block">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-text-primary">
                            {tx.listing?.cropName || 'Crop'}
                            {tx.listing?.cropVariety ? ` (${tx.listing.cropVariety})` : ''}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${payment.bg} ${payment.color}`}>
                            <PaymentIcon className="w-3 h-3" />
                            {payment.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-text-muted">
                          <span>
                            {tx.currency} {tx.totalAmount.toLocaleString('en-IN')}
                          </span>
                          <span>•</span>
                          <span>
                            {tx.finalPricePerUnit}/{tx.listing?.unit || 'unit'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            <span className={delivery.color}>{delivery.label}</span>
                          </span>
                          <span>•</span>
                          <span>{new Date(tx.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
                          <span>Farmer: {tx.farmer?.name}</span>
                          <span>Buyer: {tx.buyer?.name}</span>
                        </div>
                      </div>

                      <ArrowRight className="w-5 h-5 text-text-muted" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
