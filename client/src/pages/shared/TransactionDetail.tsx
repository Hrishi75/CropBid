// =============================================================================
// Transaction Detail — View and manage a single transaction
// =============================================================================
// Shows the full transaction lifecycle with actionable status updates.
// Farmers can mark shipment progress. Buyers can confirm delivery.
// Payment is automatically released when delivery is confirmed.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Receipt, Shield, Truck, CheckCircle,
  Package, MapPin, User, DollarSign, Clock,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Transaction } from '../../types';

// Delivery status steps for the progress tracker
const DELIVERY_STEPS = [
  { key: 'PENDING', label: 'Pending', icon: Package },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: MapPin },
  { key: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle },
];

export function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/transactions/${id}`);
        setTransaction(res.data);
      } catch (err) {
        console.error('Failed to load transaction:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  async function updateDelivery(status: string) {
    setUpdating(true);
    try {
      const res = await api.patch(`/transactions/${id}/delivery`, { status });
      setTransaction(res.data);
      toast.success(`Delivery status updated to ${status.replace('_', ' ').toLowerCase()}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!transaction) {
    return (
      <DashboardLayout>
        <Card><p className="text-center text-text-muted py-8">Transaction not found.</p></Card>
      </DashboardLayout>
    );
  }

  const isFarmer = user?.id === transaction.farmerId;
  const isBuyer = user?.id === transaction.buyerId;
  const currentStepIndex = DELIVERY_STEPS.findIndex(s => s.key === transaction.deliveryStatus);

  // What action can the current user take?
  const nextAction = isFarmer && transaction.deliveryStatus === 'PENDING'
    ? { status: 'IN_TRANSIT', label: 'Mark as Shipped' }
    : isFarmer && transaction.deliveryStatus === 'IN_TRANSIT'
      ? { status: 'DELIVERED', label: 'Mark as Delivered' }
      : isBuyer && transaction.deliveryStatus === 'DELIVERED'
        ? { status: 'CONFIRMED', label: 'Confirm Receipt' }
        : null;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Link to="/transactions" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Receipt className="w-7 h-7 text-primary" />
          <h1 className="text-xl font-bold text-text-primary">
            Transaction: {transaction.listing?.cropName || 'Crop'}
          </h1>
        </div>

        {/* Delivery Progress Tracker */}
        <Card className="mb-6">
          <h3 className="font-semibold text-text-primary mb-4">Delivery Progress</h3>
          <div className="flex items-center justify-between mb-6">
            {DELIVERY_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isCompleted = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div key={step.key} className="flex-1 flex flex-col items-center relative">
                  {/* Connector line */}
                  {idx > 0 && (
                    <div
                      className={`absolute top-4 -left-1/2 w-full h-0.5 ${
                        idx <= currentStepIndex ? 'bg-accent' : 'bg-border'
                      }`}
                      style={{ zIndex: 0 }}
                    />
                  )}

                  {/* Step circle */}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-colors
                      ${isCompleted ? 'bg-accent text-white' : 'bg-surface-alt text-text-muted border border-border'}
                      ${isCurrent ? 'ring-2 ring-accent ring-offset-2' : ''}`}
                  >
                    <StepIcon className="w-4 h-4" />
                  </div>

                  <p className={`text-xs mt-2 ${isCompleted ? 'text-accent font-medium' : 'text-text-muted'}`}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Action button */}
          {nextAction && transaction.paymentStatus === 'ESCROW' && (
            <div className="flex justify-center">
              <Button onClick={() => updateDelivery(nextAction.status)} loading={updating}>
                {nextAction.label}
              </Button>
            </div>
          )}

          {transaction.paymentStatus === 'RELEASED' && (
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-status-success mx-auto mb-1" />
              <p className="text-sm font-medium text-status-success">
                Payment released to farmer. Transaction complete!
              </p>
            </div>
          )}

          {transaction.paymentStatus === 'REFUNDED' && (
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-sm font-medium text-status-error">
                Transaction refunded to buyer.
              </p>
            </div>
          )}
        </Card>

        {/* Logistics section */}
        <Card className="mb-6">
          <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Logistics & Transport
          </h3>
          <div className="flex gap-3">
            <Link to={`/logistics/shipment/transaction/${id}`}>
              <Button variant="outline" size="sm">
                <Truck className="w-4 h-4 mr-1" />
                Track Shipment
              </Button>
            </Link>
            {transaction.deliveryStatus === 'PENDING' && (
              <Link to={`/logistics/book/${id}`}>
                <Button size="sm">
                  <Truck className="w-4 h-4 mr-1" />
                  Book Transport
                </Button>
              </Link>
            )}
          </div>
        </Card>

        {/* Transaction details grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Financial details */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Financial Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Price per unit</span>
                <span className="font-medium">{transaction.currency} {transaction.finalPricePerUnit}/{transaction.listing?.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Quantity</span>
                <span className="font-medium">{transaction.bid?.quantity} {transaction.listing?.unit}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-text-muted">Subtotal</span>
                <span className="font-medium">{transaction.currency} {transaction.totalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Platform fee ({transaction.platformFeePercent}%)</span>
                <span className="text-text-muted">- {transaction.currency} {transaction.platformFeeAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Farmer receives</span>
                <span className="text-primary">
                  {transaction.currency} {(transaction.totalAmount - transaction.platformFeeAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment status */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Payment & Escrow
            </h3>
            <div className="space-y-3">
              <div className={`p-3 rounded-lg ${
                transaction.paymentStatus === 'ESCROW' ? 'bg-yellow-50' :
                transaction.paymentStatus === 'RELEASED' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <p className="text-sm font-medium">
                  Status: {transaction.paymentStatus}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {transaction.paymentStatus === 'ESCROW'
                    ? 'Funds are held securely. Released when buyer confirms delivery.'
                    : transaction.paymentStatus === 'RELEASED'
                      ? 'Payment has been released to the farmer.'
                      : 'Funds have been refunded to the buyer.'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Clock className="w-3 h-3" />
                Created {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
          </Card>

          {/* Farmer info */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Farmer
            </h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{transaction.farmer?.name}</p>
              {(transaction.farmer as any)?.email && (
                <p className="text-text-muted">{(transaction.farmer as any).email}</p>
              )}
              {(transaction.farmer as any)?.phone && (
                <p className="text-text-muted">{(transaction.farmer as any).phone}</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Trust Score:</span>
                <span className="font-medium text-primary">{transaction.farmer?.trustScore}/100</span>
              </div>
            </div>
          </Card>

          {/* Buyer info */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Buyer
            </h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{transaction.buyer?.name}</p>
              {(transaction.buyer as any)?.email && (
                <p className="text-text-muted">{(transaction.buyer as any).email}</p>
              )}
              {(transaction.buyer as any)?.phone && (
                <p className="text-text-muted">{(transaction.buyer as any).phone}</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Trust Score:</span>
                <span className="font-medium text-primary">{transaction.buyer?.trustScore}/100</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
