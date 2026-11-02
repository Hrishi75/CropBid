// =============================================================================
// DealMadeModal: "Deal made", shown once to each side of a trade deal
// =============================================================================
// The seller has just accepted, so both sides need the same three facts: the
// price, who pays for delivery, and what happens next. What happens next
// depends on those delivery terms (utils/freight): on a seller-pays deal the
// buyer can pay straight away; otherwise CropBid quotes the delivery first and
// the buyer pays the goods and their share together.
//
// Shown the first time each person opens the deal while it awaits payment,
// remembered per deal and per account in localStorage. Not a gate: the deal
// page below says all of it again, so a blocked or cleared storage only means
// the popup appears once more.
// =============================================================================

import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../utils/currency';
import { freightLabel } from '../../utils/freight';
import { markDealPopupSeen as markSeen } from '../../utils/dealPopup';
import type { Transaction } from '../../types';

interface Props {
  transaction: Transaction;
  side: 'BUYER' | 'SELLER';
  userId: string;
  /** Present when the buyer can pay now. */
  onPay?: () => void;
  onClose: () => void;
}

export function DealMadeModal({ transaction, side, userId, onPay, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = transaction;
  const f = t.freight;
  const paidBy = f?.paidBy ?? t.freightPaidBy ?? 'FARMER';
  const money = (n: number) => formatCurrency(n, t.currency);
  const unit = t.listing?.unit?.toLowerCase() ?? '';

  function close() {
    markSeen(t.id, userId);
    onClose();
  }

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The steps from here, in the reader's own terms.
  const steps: string[] = side === 'BUYER'
    ? paidBy === 'FARMER'
      ? [
          `Pay ${money(t.totalAmount)} into escrow. The seller pays the delivery.`,
          'CropBid books the truck and you can follow it on this page.',
          'Confirm when it arrives. That is what marks the seller due their money.',
        ]
      : [
          f?.awaitingQuote
            ? `CropBid prices the delivery. We will notify you when the quote is in.`
            : `Delivery is priced at ${money(f?.amount ?? 0)}; your ${paidBy === 'SPLIT' ? 'half' : 'share'} is ${money(f?.buyerShare ?? 0)}.`,
          f?.buyerPays != null
            ? `Pay ${money(f.buyerPays)}: the goods and your share of delivery, in one payment into escrow.`
            : `Then pay the goods (${money(t.totalAmount)}) and your ${paidBy === 'SPLIT' ? 'half of the delivery' : 'delivery charge'} in one payment into escrow.`,
          'CropBid books the truck. Confirm when it arrives.',
        ]
    : [
        paidBy === 'FARMER'
          ? 'The buyer pays the goods into escrow. You pay the delivery, taken from your payout once the truck is booked.'
          : paidBy === 'SPLIT'
            ? 'CropBid prices the delivery. You and the buyer pay half each: yours comes out of your payout.'
            : 'CropBid prices the delivery and the buyer pays all of it, with the goods.',
        'CropBid books the truck and tells you the pickup date. Pack the lot for it.',
        'You are due your money once the buyer confirms delivery.',
      ];

  return (
    <div
      className="cb-app"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-made-title"
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,15,0.55)' }} />
      <div className="cb-card" style={{ position: 'relative', width: '100%', maxWidth: 460, padding: 0, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--cb-line)' }}>
          <div className="cb-eyebrow" style={{ color: 'var(--cb-forest)', marginBottom: 8 }}>● Deal made</div>
          <h3 id="deal-made-title" className="cb-h3" style={{ fontSize: 20 }}>
            {side === 'BUYER' ? 'The seller accepted your bid' : 'You accepted the bid'}
          </h3>
          <p className="cb-small" style={{ marginTop: 8 }}>
            {t.listing?.cropName}: {t.bid?.quantity} {unit} at {money(t.finalPricePerUnit)}/{unit}, {money(t.totalAmount)} in all.
          </p>
          <div style={{ marginTop: 12, padding: 12, background: 'var(--cb-paper-2)', borderRadius: 8 }}>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>DELIVERY</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{freightLabel(paidBy)}</div>
            <div className="cb-tiny" style={{ marginTop: 2, color: 'var(--cb-ink-3)' }}>
              Agreed with the bid. CropBid books the truck.
            </div>
          </div>
          <ol className="cb-small" style={{ marginTop: 12, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', background: 'var(--cb-paper-2)' }}>
          <Button ref={closeRef} variant="ghost" onClick={close}>
            {onPay ? 'Later' : 'Got it'}
          </Button>
          {onPay && f?.buyerPays !== null && (
            <Button onClick={() => { close(); onPay(); }}>
              Pay {money(f?.buyerPays ?? t.totalAmount)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
