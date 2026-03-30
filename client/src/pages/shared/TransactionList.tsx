import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt, ArrowRight, Shield, Truck, CheckCircle,
  AlertTriangle, DollarSign, Package,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonStats, SkeletonCard } from '../../components/ui/Skeleton';
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
    ESCROW: { label: 'In Escrow', icon: Shield, color: 'text-status-warning', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
    RELEASED: { label: 'Released', icon: CheckCircle, color: 'text-status-success', bg: 'bg-green-50 dark:bg-green-900/20' },
    REFUNDED: { label: 'Refunded', icon: AlertTriangle, color: 'text-status-error', bg: 'bg-red-50 dark:bg-red-900/20' },
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
          <Receipt className="w-7 h-7 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-text">Transactions</h1>
        </div>

        {/* Stats cards */}
        {loading ? (
          <div className="mb-6"><SkeletonStats /></div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-center">
                <Package className="w-5 h-5 mx-auto mb-1 text-primary" aria-hidden="true" />
                <p className="text-2xl font-bold text-text">{stats.total}</p>
                <p className="text-xs text-text-muted">Total</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <Shield className="w-5 h-5 mx-auto mb-1 text-status-warning" aria-hidden="true" />
                <p className="text-2xl font-bold text-text">{stats.inEscrow}</p>
                <p className="text-xs text-text-muted">In Escrow</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <CheckCircle className="w-5 h-5 mx-auto mb-1 text-status-success" aria-hidden="true" />
                <p className="text-2xl font-bold text-text">{stats.released}</p>
                <p className="text-xs text-text-muted">Completed</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-accent" aria-hidden="true" />
                <p className="text-2xl font-bold text-text">
                  {stats.totalRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted">Revenue</p>
              </div>
            </Card>
          </div>
        )}

        {/* Transaction list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-8 h-8" />}
            title="No transactions yet"
            description="Transactions are created when bids are accepted."
          />
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const payment = paymentConfig[tx.paymentStatus];
              const delivery = deliveryConfig[tx.deliveryStatus];
              const PaymentIcon = payment.icon;

              return (
                <Link key={tx.id} to={`/transactions/${tx.id}`} className="block group">
                  <Card className="group-hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-text truncate">
                            {tx.listing?.cropName || 'Crop'}
                            {tx.listing?.cropVariety ? ` (${tx.listing.cropVariety})` : ''}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${payment.bg} ${payment.color}`}>
                            <PaymentIcon className="w-3 h-3" />
                            {payment.label}
                          </span>
                        </div>

                        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                          <span>
                            {tx.currency} {tx.totalAmount.toLocaleString()}
                          </span>
                          <span className="hidden sm:inline">·</span>
                          <span className="hidden sm:inline">
                            {tx.finalPricePerUnit}/{tx.listing?.unit || 'unit'}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" aria-hidden="true" />
                            <span className={delivery.color}>{delivery.label}</span>
                          </span>
                          <span>·</span>
                          <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
                          <span>Farmer: {tx.farmer?.name}</span>
                          <span>Buyer: {tx.buyer?.name}</span>
                        </div>
                      </div>

                      <ArrowRight className="w-5 h-5 text-text-muted shrink-0 ml-3 group-hover:translate-x-1 transition-transform" />
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
