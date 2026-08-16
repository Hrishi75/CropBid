// =============================================================================
// BidCard — One bid row with inline actions
// =============================================================================
// Renders a single bid and the actions available to the current viewer:
//   - viewAs="farmer": Accept / Counter / Reject a pending bid
//   - viewAs="buyer":  Update price / Revise (after counter) / Withdraw
//
// All actions call the /bids API directly, toast the result, then notify the
// parent via onUpdate() so the list can refetch. STATUS_META maps each bid
// status to its short label + accent color.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Bid, Listing, User } from '../../types';

interface BidCardProps {
  bid: Bid & { listing?: Listing; buyer?: Partial<User> };
  viewAs: 'farmer' | 'buyer';
  onUpdate?: () => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'PEND', color: 'var(--cb-ember)' },
  ACCEPTED: { label: 'ACPT', color: 'var(--cb-sage)' },
  REJECTED: { label: 'REJD', color: 'var(--cb-ink-3)' },
  COUNTERED: { label: 'CNTR', color: 'var(--cb-wheat)' },
  EXPIRED: { label: 'EXPR', color: 'var(--cb-ink-3)' },
  OUTBID: { label: 'OUTB', color: 'var(--cb-ember)' },
};

export function BidCard({ bid, viewAs, onUpdate }: BidCardProps) {
  const [showCounter, setShowCounter] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [showUpdate, setShowUpdate] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const currency = bid.currency || bid.listing?.currency || 'INR';
  const status = STATUS_META[bid.status] || { label: bid.status.slice(0, 4).toUpperCase(), color: 'var(--cb-ink-3)' };

  async function handleAction(action: string) {
    setLoading(action);
    try {
      if (action === 'accept') {
        await api.put(`/bids/${bid.id}/accept`);
        toast.success('Bid accepted');
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
        toast.success('Counter sent');
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
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--cb-line)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
              #{bid.id.slice(-6).toUpperCase()}
            </span>
            {viewAs === 'buyer' && bid.listing && (
              <Link to={`/listings/${bid.listing.id}`} style={{ color: 'var(--cb-ink)', textDecoration: 'none', fontWeight: 500 }}>
                {bid.listing.cropName}{bid.listing.cropVariety ? ` · ${bid.listing.cropVariety}` : ''}
              </Link>
            )}
            {viewAs === 'farmer' && bid.buyer && (
              <span style={{ fontWeight: 500 }}>{bid.buyer.name}</span>
            )}
          </div>
          <span className="cb-mono cb-tiny" style={{ color: status.color }}>● {status.label}</span>
        </div>

        <div className="cb-small" style={{ marginBottom: 12 }}>
          {viewAs === 'farmer' && bid.buyer?.trustScore !== undefined && (
            <span>Trust {Math.round(bid.buyer.trustScore)} · </span>
          )}
          {bid.quantity} {bid.listing?.unit?.toLowerCase() || ''} · {new Date(bid.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {bid.isAgentBid && ' · agent'}
        </div>

        <div className="cb-metrics" style={{ gap: 16, marginBottom: 12 }}>
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>BID</div>
            <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {formatCurrency(bid.bidPricePerUnit, currency)}
            </div>
          </div>
          {bid.counterPrice && (
            <div>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>COUNTER</div>
              <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500, color: 'var(--cb-ember)' }}>
                {formatCurrency(bid.counterPrice, currency)}
              </div>
            </div>
          )}
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL</div>
            <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {formatCurrency(bid.totalAmount, currency)}
            </div>
          </div>
        </div>

        {viewAs === 'farmer' && (bid.deliveryAddress || bid.contactPhone || bid.buyer?.phone || bid.paymentTerms || bid.deliveryTerms) && (
          <div className="cb-small" style={{ padding: 10, background: 'var(--cb-paper-2)', borderRadius: 6, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bid.deliveryAddress && (
              <div>
                <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 6 }}>DELIVER TO</span>
                {bid.deliveryAddress}
              </div>
            )}
            {(bid.contactPhone || bid.buyer?.phone) && (
              <div>
                <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 6 }}>CONTACT</span>
                <a href={`tel:${bid.contactPhone || bid.buyer?.phone}`} style={{ color: 'var(--cb-ink)' }}>
                  {bid.contactPhone || bid.buyer?.phone}
                </a>
              </div>
            )}
            {(bid.paymentTerms || bid.deliveryTerms) && (
              <div>
                <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 6 }}>TERMS</span>
                {[bid.paymentTerms, bid.deliveryTerms].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        )}

        {bid.message && (
          <div className="cb-small" style={{ padding: 10, background: 'var(--cb-paper-2)', borderRadius: 6, marginBottom: 12, fontStyle: 'italic' }}>
            "{bid.message}"
          </div>
        )}

        {viewAs === 'farmer' && bid.status === 'PENDING' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => handleAction('accept')} loading={loading === 'accept'}>
              Accept {formatCurrency(bid.bidPricePerUnit, currency)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCounter(!showCounter)}>
              Counter
            </Button>
            <Button size="sm" variant="link" onClick={() => handleAction('reject')} loading={loading === 'reject'}>
              ✕ Reject
            </Button>
          </div>
        )}

        {showCounter && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
            <Input
              label="Counter price"
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter price"
              value={counterPrice}
              onChange={(e) => setCounterPrice(e.target.value)}
            />
            <Button
              size="md"
              onClick={() => handleAction('counter')}
              loading={loading === 'counter'}
              disabled={!counterPrice || Number(counterPrice) <= 0}
            >
              Send
            </Button>
          </div>
        )}

        {viewAs === 'buyer' && (bid.status === 'PENDING' || bid.status === 'COUNTERED') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <Button size="sm" variant="ghost" onClick={() => setShowUpdate(!showUpdate)}>
              {bid.status === 'COUNTERED' ? 'Revise bid' : 'Update price'}
            </Button>
            <Button size="sm" variant="link" onClick={() => setConfirmWithdraw(true)}>
              Withdraw
            </Button>
          </div>
        )}

        {showUpdate && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
            <Input
              label="New bid price"
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter new price"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <Button
              size="md"
              onClick={() => handleAction('update')}
              loading={loading === 'update'}
              disabled={!newPrice || Number(newPrice) <= 0}
            >
              Update
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmWithdraw}
        title="Withdraw bid"
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
