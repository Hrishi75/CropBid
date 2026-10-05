// =============================================================================
// RequirementOfferCard — One farmer offer with inline actions
// =============================================================================
// Renders a single offer on a buyer requirement and the actions available to
// the current viewer:
//   - viewAs="buyer":  Accept / Counter / Reject a pending offer
//   - viewAs="farmer": answer a buyer's counter (accept their price, or send a
//     new one), or withdraw
//
// COUNTERING is how a restaurant buys (it negotiates every order), and any
// buyer can do it: PENDING waits on the buyer, COUNTERED on the seller.
//
// Mirrors BidCard's contract exactly ({ offer, viewAs, onUpdate }), including
// its STATUS_META colour map, so the two inboxes read as one system.
//
// INSTANT offers never appear as PENDING — they're born ACCEPTED with the deal
// already closed — so neither role ever sees an action button on one.
// =============================================================================

import { useState } from 'react';
import { Input } from '../ui/Input';
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
  // Whole words: "CNTR" and "PEND" read as codes, not states.
  PENDING: { label: 'PENDING', color: 'var(--cb-ember)' },
  COUNTERED: { label: 'COUNTERED', color: 'var(--cb-wheat)' },
  ACCEPTED: { label: 'ACCEPTED', color: 'var(--cb-sage)' },
  REJECTED: { label: 'DECLINED', color: 'var(--cb-ink-3)' },
  WITHDRAWN: { label: 'WITHDRAWN', color: 'var(--cb-ink-3)' },
  EXPIRED: { label: 'EXPIRED', color: 'var(--cb-ink-3)' },
};

export function RequirementOfferCard({ offer, viewAs, onUpdate }: RequirementOfferCardProps) {
  const [loading, setLoading] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  // The price field for a buyer's counter or a seller's new price.
  const [pricing, setPricing] = useState(false);
  const [price, setPrice] = useState('');

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
      } else if (action === 'counter') {
        await api.put(`/requirements/offers/${offer.id}/counter`, { pricePerUnit: Number(price) });
        toast.success('Counter sent. The seller can accept it or send a new price.');
        setPricing(false);
      } else if (action === 'revise') {
        await api.put(`/requirements/offers/${offer.id}/revise`, { pricePerUnit: Number(price) });
        toast.success('New price sent to the buyer');
        setPricing(false);
      } else if (action === 'acceptCounter') {
        await api.put(`/requirements/offers/${offer.id}/accept-counter`);
        toast.success('Deal made at their price. It is in your Transactions.');
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

        <div className="cb-metrics" style={{ gap: 16, marginBottom: 12 }}>
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

        {offer.status === 'COUNTERED' && offer.buyerCounterPrice != null && (
          <div className="cb-small" style={{ padding: 10, background: 'rgba(183,121,31,0.1)', borderRadius: 6, marginBottom: 12 }}>
            {viewAs === 'buyer'
              ? <>You offered <strong>{formatCurrency(offer.buyerCounterPrice, currency)}/{unit}</strong>. Waiting for the seller to accept it or send a new price.</>
              : <>The buyer would pay <strong>{formatCurrency(offer.buyerCounterPrice, currency)}/{unit}</strong>, {formatCurrency(offer.buyerCounterPrice * offer.quantity, currency)} in all.</>}
          </div>
        )}

        {/* One price field serves the buyer's counter and the seller's new price,
            held to the server's rule: a counter below the seller's price, a
            new price strictly between the two. */}
        {pricing && (() => {
          const p = Number(price);
          const low = viewAs === 'buyer' ? 0 : offer.buyerCounterPrice ?? 0;
          const ok = p > low && p < offer.pricePerUnit;
          const why = price && !ok
            ? viewAs === 'buyer'
              ? `Offer less than their ${formatCurrency(offer.pricePerUnit, currency)}`
              : `Between ${formatCurrency(low, currency)} and ${formatCurrency(offer.pricePerUnit, currency)}, not either one`
            : undefined;
          const label = viewAs === 'buyer' ? `Your price per ${unit}` : `New price per ${unit}`;
          // The label sits above the row and the message below it, so the box
          // and both buttons share one line whatever the message says; inside
          // the field they pushed the buttons down to the error's last line.
          return (
          <div className="cb-rq-price">
            <label className="cb-label" htmlFor={`price-${offer.id}`}>{label}</label>
            <div className="cb-rq-price-row">
              <Input
                id={`price-${offer.id}`}
                aria-invalid={Boolean(why)}
                className={why ? 'error' : ''}
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={viewAs === 'buyer'
                  ? `Below ${formatCurrency(offer.pricePerUnit, currency)}`
                  : `${formatCurrency(offer.buyerCounterPrice ?? 0, currency)} to ${formatCurrency(offer.pricePerUnit, currency)}`}
                autoFocus
              />
              <Button disabled={!ok} onClick={() => handleAction(viewAs === 'buyer' ? 'counter' : 'revise')} loading={loading === 'counter' || loading === 'revise'}>
                Send
              </Button>
              <Button variant="link" onClick={() => setPricing(false)}>Cancel</Button>
            </div>
            {why && <p className="cb-field-error" style={{ margin: 0 }}>{why}</p>}
          </div>
          );
        })()}

        {viewAs === 'buyer' && offer.status === 'PENDING' && !pricing && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => handleAction('accept')} loading={loading === 'accept'}>
              Accept {formatCurrency(offer.totalAmount, currency)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPrice(''); setPricing(true); }}>
              Counter
            </Button>
            <Button size="sm" variant="link" onClick={() => handleAction('reject')} loading={loading === 'reject'}>
              ✕ Reject
            </Button>
          </div>
        )}

        {viewAs === 'buyer' && offer.status === 'COUNTERED' && (
          <Button size="sm" variant="link" onClick={() => handleAction('reject')} loading={loading === 'reject'}>
            ✕ Decline instead
          </Button>
        )}

        {viewAs === 'farmer' && offer.status === 'COUNTERED' && offer.buyerCounterPrice != null && !pricing && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => handleAction('acceptCounter')} loading={loading === 'acceptCounter'}>
              Accept {formatCurrency(offer.buyerCounterPrice, currency)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPrice(''); setPricing(true); }}>
              New price
            </Button>
            <Button size="sm" variant="link" onClick={() => setConfirmWithdraw(true)}>
              Withdraw
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
