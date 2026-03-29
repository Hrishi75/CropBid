import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import { Star, MessageSquare } from 'lucide-react';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Bid, Listing, User } from '../../types';

interface BidCardProps {
  bid: Bid & { listing?: Listing; buyer?: Partial<User> };
  viewAs: 'farmer' | 'buyer';
  onUpdate?: () => void;
}

export function BidCard({ bid, viewAs, onUpdate }: BidCardProps) {
  const [showCounter, setShowCounter] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [showUpdate, setShowUpdate] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const currency = bid.currency || bid.listing?.currency || 'INR';

  const statusStyles: Record<string, string> = {
    PENDING: 'bg-warning/10 text-warning',
    ACCEPTED: 'bg-accent/10 text-accent',
    REJECTED: 'bg-error/10 text-error',
    COUNTERED: 'bg-primary/10 text-primary',
    EXPIRED: 'bg-text-muted/10 text-text-muted',
  };

  async function handleAction(action: string) {
    setLoading(action);
    try {
      if (action === 'accept') {
        await api.put(`/bids/${bid.id}/accept`);
        toast.success('Bid accepted!');
      } else if (action === 'reject') {
        await api.put(`/bids/${bid.id}/reject`);
        toast.success('Bid rejected');
      } else if (action === 'counter') {
        if (!counterPrice || Number(counterPrice) <= 0) {
          toast.error('Enter a valid counter price');
          setLoading('');
          return;
        }
        await api.put(`/bids/${bid.id}/counter`, { counterPrice: Number(counterPrice) });
        toast.success('Counter-offer sent');
        setShowCounter(false);
      } else if (action === 'update') {
        if (!newPrice || Number(newPrice) <= 0) {
          toast.error('Enter a valid price');
          setLoading('');
          return;
        }
        await api.put(`/bids/${bid.id}/update`, { bidPricePerUnit: Number(newPrice) });
        toast.success('Bid updated');
        setShowUpdate(false);
      } else if (action === 'withdraw') {
        await api.delete(`/bids/${bid.id}`);
        toast.success('Bid withdrawn');
        setConfirmWithdraw(false);
      }
      onUpdate?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${action}`);
    } finally {
      setLoading('');
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-start justify-between mb-3">
          {/* Left — listing or buyer info */}
          <div>
            {viewAs === 'buyer' && bid.listing && (
              <Link to={`/listings/${bid.listing.id}`} className="font-semibold text-text hover:text-primary transition-colors">
                {bid.listing.cropName}
                {bid.listing.cropVariety && ` (${bid.listing.cropVariety})`}
              </Link>
            )}
            {viewAs === 'farmer' && bid.buyer && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold" aria-hidden="true">
                  {bid.buyer.name?.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-text text-sm">{bid.buyer.name}</p>
                  {bid.buyer.trustScore !== undefined && (
                    <p className="text-xs text-text-secondary flex items-center gap-1">
                      <Star size={10} aria-hidden="true" /> {Math.round(bid.buyer.trustScore)}/100
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status badge */}
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[bid.status] || ''}`}>
            {bid.status}
          </span>
        </div>

        {/* Price info */}
        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
          <div>
            <p className="text-text-muted text-xs">Bid Price</p>
            <p className="font-semibold text-text">
              {formatCurrency(bid.bidPricePerUnit, currency)}
            </p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Quantity</p>
            <p className="font-semibold text-text">{bid.quantity} {bid.listing?.unit || ''}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Total</p>
            <p className="font-semibold text-primary">
              {formatCurrency(bid.totalAmount, currency)}
            </p>
          </div>
        </div>

        {/* Counter-offer display */}
        {bid.status === 'COUNTERED' && bid.counterPrice && (
          <div className="bg-primary/5 rounded-lg p-2.5 mb-3 text-sm">
            <p className="text-primary font-medium">
              Counter-offer: {formatCurrency(bid.counterPrice, currency)} per unit
            </p>
          </div>
        )}

        {/* Message */}
        {bid.message && (
          <div className="flex items-start gap-2 text-sm text-text-secondary mb-3">
            <MessageSquare size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{bid.message}</p>
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-text-muted mb-3">
          {new Date(bid.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
          {bid.isAgentBid && ' · AI Agent bid'}
        </p>

        {/* Farmer actions */}
        {viewAs === 'farmer' && bid.status === 'PENDING' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleAction('accept')} loading={loading === 'accept'}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCounter(!showCounter)}>
              Counter
            </Button>
            <Button size="sm" variant="danger" onClick={() => handleAction('reject')} loading={loading === 'reject'}>
              Reject
            </Button>
          </div>
        )}

        {/* Counter form */}
        {showCounter && (
          <div className="mt-3 flex gap-2 items-end">
            <Input
              label="Your counter price"
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter price"
              value={counterPrice}
              onChange={(e) => setCounterPrice(e.target.value)}
              aria-label="Counter price per unit"
            />
            <Button
              size="sm"
              onClick={() => handleAction('counter')}
              loading={loading === 'counter'}
              disabled={!counterPrice || Number(counterPrice) <= 0}
            >
              Send
            </Button>
          </div>
        )}

        {/* Buyer actions */}
        {viewAs === 'buyer' && (bid.status === 'PENDING' || bid.status === 'COUNTERED') && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowUpdate(!showUpdate)}>
              {bid.status === 'COUNTERED' ? 'Revise Bid' : 'Update Price'}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmWithdraw(true)}>
              Withdraw
            </Button>
          </div>
        )}

        {/* Update form */}
        {showUpdate && (
          <div className="mt-3 flex gap-2 items-end">
            <Input
              label="New bid price"
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter new price"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              aria-label="New bid price per unit"
            />
            <Button
              size="sm"
              onClick={() => handleAction('update')}
              loading={loading === 'update'}
              disabled={!newPrice || Number(newPrice) <= 0}
            >
              Update
            </Button>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={confirmWithdraw}
        title="Withdraw Bid"
        message="Are you sure you want to withdraw this bid? This action cannot be undone."
        confirmLabel="Withdraw"
        variant="warning"
        loading={loading === 'withdraw'}
        onConfirm={() => handleAction('withdraw')}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </>
  );
}
