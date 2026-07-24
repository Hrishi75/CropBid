// =============================================================================
// RequirementOfferCard — One farmer offer with inline actions
// =============================================================================
// Renders a single offer on a buyer requirement and the actions available to
// the current viewer:
//   - viewAs="buyer":  Accept / Reject a pending offer
//   - viewAs="farmer": Withdraw their own pending offer
//
// Mirrors BidCard's contract exactly ({ offer, viewAs, onUpdate }), including
// its STATUS_META colour map, so the two inboxes read as one system.
//
// INSTANT offers never appear as PENDING — they're born ACCEPTED with the deal
// already closed — so neither role ever sees an action button on one.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { RequirementOffer } from '../../types';

interface RequirementOfferCardProps {
  offer: RequirementOffer;
  viewAs: 'buyer' | 'farmer';
  onUpdate?: () => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'PEND', color: 'var(--cb-ember)' },
  ACCEPTED: { label: 'ACPT', color: 'var(--cb-sage)' },
  REJECTED: { label: 'REJD', color: 'var(--cb-ink-3)' },
  WITHDRAWN: { label: 'WDRN', color: 'var(--cb-ink-3)' },
  EXPIRED: { label: 'EXPR', color: 'var(--cb-ink-3)' },
};

export function RequirementOfferCard({ offer, viewAs, onUpdate }: RequirementOfferCardProps) {
  const [loading, setLoading] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const currency = offer.currency || 'INR';
  const unit = offer.requirement?.unit?.toLowerCase() || '';
  const status = STATUS_META[offer.status]
    || { label: offer.status.slice(0, 4).toUpperCase(), color: 'var(--cb-ink-3)' };
  const transactionId = offer.bid?.transaction?.id;

  async function handleAction(action: string) {
    setLoading(action);
    try {
      if (action === 'accept') {
        await api.put(`/requirements/offers/${offer.id}/accept`);
        toast.success('Offer accepted — the deal is in your Transactions');
      } else if (action === 'reject') {
        await api.put(`/requirements/offers/${offer.id}/reject`);
        toast.success('Offer rejected');
      } else if (action === 'withdraw') {
        await api.delete(`/requirements/offers/${offer.id}`);
        toast.success('Offer withdrawn');
        setConfirmWithdraw(false);
      }
      onUpdate?.();
    } catch (err: any) {
      // Surfaces the server's real message, which is how a 409 ("another fill
      // went through first") reaches the user instead of a generic failure.
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
              #{offer.id.slice(-6).toUpperCase()}
            </span>
            {viewAs === 'buyer' && offer.farmer && (
              <span style={{ fontWeight: 500 }}>{offer.farmer.name}</span>
            )}
            {viewAs === 'farmer' && offer.requirement && (
              <span style={{ fontWeight: 500 }}>
                {offer.requirement.cropName}
                {offer.requirement.cropVariety ? ` · ${offer.requirement.cropVariety}` : ''}
              </span>
            )}
          </div>
          <span className="cb-mono cb-tiny" style={{ color: status.color }}>● {status.label}</span>
        </div>

        <div className="cb-small" style={{ marginBottom: 12, color: 'var(--cb-ink-3)' }}>
          {viewAs === 'buyer' && offer.farmer?.farmerProfile?.state && (
            <span>{offer.farmer.farmerProfile.state} · </span>
          )}
          {viewAs === 'buyer' && offer.farmer?.trustScore !== undefined && (
            <span>Trust {Math.round(offer.farmer.trustScore)} · </span>
          )}
          {viewAs === 'buyer' && offer.farmer?.farmerProfile?.organicCertified && <span>organic · </span>}
          {viewAs === 'farmer' && offer.requirement?.buyer && (
            <span>{offer.requirement.buyer.buyerProfile?.companyName || offer.requirement.buyer.name} · </span>
          )}
          {offer.kind === 'INSTANT' ? 'filled at posted price' : 'counter-offer'}
          {' · '}
          {new Date(offer.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 12 }}>
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>PRICE</div>
            <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {formatCurrency(offer.pricePerUnit, currency)}
            </div>
          </div>
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>QUANTITY</div>
            <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {offer.quantity} {unit}
            </div>
          </div>
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL</div>
            <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {formatCurrency(offer.totalAmount, currency)}
            </div>
          </div>
        </div>

        {offer.message && (
          <div className="cb-small" style={{ padding: 10, background: 'var(--cb-paper-2)', borderRadius: 6, marginBottom: 12, fontStyle: 'italic' }}>
            "{offer.message}"
          </div>
        )}

        {viewAs === 'buyer' && offer.status === 'PENDING' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => handleAction('accept')} loading={loading === 'accept'}>
              Accept {formatCurrency(offer.totalAmount, currency)}
            </Button>
            <Button size="sm" variant="link" onClick={() => handleAction('reject')} loading={loading === 'reject'}>
              ✕ Reject
            </Button>
          </div>
        )}

        {viewAs === 'farmer' && offer.status === 'PENDING' && (
          <Button size="sm" variant="link" onClick={() => setConfirmWithdraw(true)}>
            Withdraw
          </Button>
        )}

        {transactionId && (
          <Link to={`/transactions/${transactionId}`} className="cb-btn cb-btn-link" style={{ padding: 0 }}>
            View deal →
          </Link>
        )}
      </div>

      <ConfirmModal
        open={confirmWithdraw}
        title="Withdraw offer"
        message="Are you sure you want to withdraw this offer? You can send a new one afterwards while the requirement is still open."
        confirmLabel="Withdraw"
        variant="warning"
        loading={loading === 'withdraw'}
        onConfirm={() => handleAction('withdraw')}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </>
  );
}
