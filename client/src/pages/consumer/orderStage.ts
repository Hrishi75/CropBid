// =============================================================================
// orderStage — one order's state, in shopper language
// =============================================================================
// A Transaction carries TWO independent status columns (paymentStatus and
// deliveryStatus) because the B2B side genuinely needs to see both. A shopper
// wants one answer to "where is my order?", so this folds the pair into a
// single stage, and names the one thing they can act on right now.
//
// Payment is checked BEFORE delivery on purpose: an unpaid order is stuck no
// matter what its delivery column says, so "Pay now" has to win.
//
// Shared by MyOrders (the card) and OrderDetail (the header), so the list and
// the page can never disagree about what state an order is in.
// =============================================================================

import type { Transaction } from '../../types';

export interface OrderStage {
  label: string;
  color: string;
  // What the shopper can do next, if anything. Null means "wait" — the ball is
  // with the grower or with CropBid.
  action: string | null;
}

export function ORDER_STAGE(order: Transaction): OrderStage {
  if (order.paymentStatus === 'REFUNDED') {
    return { label: 'Refunded', color: 'var(--cb-ink-3)', action: null };
  }
  if (order.paymentStatus === 'AWAITING_PAYMENT') {
    return { label: 'Payment due', color: 'var(--cb-ember)', action: 'Pay now' };
  }

  switch (order.deliveryStatus) {
    case 'PENDING':
      return { label: 'Preparing your order', color: 'var(--cb-wheat)', action: null };
    case 'IN_TRANSIT':
      return { label: 'On the way', color: 'var(--cb-wheat)', action: null };
    case 'DELIVERED':
      // The only step that releases the grower's money, so it is worth nudging.
      return { label: 'Delivered — tell us it arrived', color: 'var(--cb-ember)', action: 'Confirm' };
    case 'CONFIRMED':
      return { label: 'Completed', color: 'var(--cb-forest)', action: null };
    default:
      return { label: order.deliveryStatus, color: 'var(--cb-ink-3)', action: null };
  }
}
