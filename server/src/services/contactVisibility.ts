// =============================================================================
// Contact visibility — when the two sides of a deal are allowed to see each other
// =============================================================================
// CropBid stands between a farmer and a buyer and takes a fee for it. The whole
// position collapses if either side can read the other's phone number before
// money has moved: a farmer looking at ten PENDING bids would be looking at ten
// buyers' direct numbers, and the obvious next step is to call them and settle
// off-platform. That isn't a hypothetical — it is the normal failure mode of
// every agri marketplace, and it is why the buyer-side comparables (see
// madoverbuildings.com) never name the supplier at all.
//
// The rule, in one line: identity is public, contact is not, and contact is
// released only once the platform has actually been paid.
//
// The farmer side was already protected — PUBLIC_FARMER_SELECT in the listing,
// browse, bid and negotiation services never carries phone or email, and
// transaction.service says so in as many words. This module is the missing
// mirror for the BUYER side, plus the payment gate that both sides now sit
// behind.
//
// Deliberately NOT covered here: admin endpoints (the platform must be able to
// see both parties to run support and settle disputes) and orderAlert.service
// (which mails the ops inbox, i.e. the platform itself, not a counterparty).

import type { PaymentStatus } from '../generated/prisma/client';

// Counterparty-safe shape for the buyer on a bid or a deal: enough to judge who
// you are dealing with, nothing to reach them with. The User-rooted twin of
// PUBLIC_FARMER_SELECT.
//
// `location` is excluded along with phone/email. It reads like harmless city
// metadata, but it is free text on User and in practice holds whatever the
// buyer typed at signup — often a full address, which is exactly the thing this
// module exists to withhold.
export const PUBLIC_BUYER_USER_SELECT = {
  id: true,
  name: true,
  trustScore: true,
  avatar: true,
} as const;

// Money is captured (ESCROW) or already paid out (RELEASED). At that point the
// platform has its fee and the deal cannot be quietly taken off-platform, so
// the seller gets what they need in order to actually deliver.
//
// AWAITING_PAYMENT is NOT enough. A transaction row exists from the moment a
// bid is accepted, before the buyer has paid a rupee — releasing contact there
// would just move the leak one click later.
//
// REFUNDED is not enough either: the deal unwound, and there is no delivery
// left to arrange.
export function isContactReleased(paymentStatus?: PaymentStatus | null): boolean {
  return paymentStatus === 'ESCROW' || paymentStatus === 'RELEASED';
}

/** The contact fields snapshotted onto a Bid when the order was placed. */
export interface BidContactFields {
  deliveryAddress: string | null;
  contactPhone: string | null;
  transaction?: { paymentStatus: PaymentStatus } | null;
}

// Bid.contactPhone / Bid.deliveryAddress are snapshotted off the buyer's
// profile at bid time (see orderContactDefaults in bid.service). That snapshot
// is the real leak: stripping buyer.phone from the Prisma select alone would
// have changed nothing, because BidCard falls back to bid.contactPhone.
//
// `contactReleased` is returned so the UI can say "shared once payment clears"
// instead of silently rendering an empty block that looks like a bug.
export function redactBidContact<T extends BidContactFields>(bid: T) {
  const released = isContactReleased(bid.transaction?.paymentStatus);
  if (released) return { ...bid, contactReleased: true as const };
  return {
    ...bid,
    deliveryAddress: null,
    contactPhone: null,
    contactReleased: false as const,
  };
}

export function redactBidContacts<T extends BidContactFields>(bids: T[]) {
  return bids.map(redactBidContact);
}

/** The buyer as selected onto a Transaction, before redaction. */
export interface TransactionBuyerShape {
  buyerId: string;
  paymentStatus: PaymentStatus;
  buyer: { id: string; name: string; trustScore: number; phone?: string | null };
}

// A farmer reading their own deal sees the buyer's phone only after payment.
// Everyone else reading this row is either the buyer themselves (their own
// number) or an admin, and neither needs redacting.
//
// Email is never released to a counterparty at all, in either direction: a
// phone number is what a delivery actually needs, an email address is what a
// direct-sourcing relationship starts with.
export function redactTransactionContact<T extends TransactionBuyerShape>(
  transaction: T,
  viewer: { userId: string; role: string },
) {
  const isOwnRow = transaction.buyerId === viewer.userId;
  if (viewer.role === 'ADMIN' || isOwnRow) {
    return { ...transaction, contactReleased: true as const };
  }

  const released = isContactReleased(transaction.paymentStatus);
  if (released) return { ...transaction, contactReleased: true as const };

  return {
    ...transaction,
    buyer: { ...transaction.buyer, phone: null },
    contactReleased: false as const,
  };
}

export function redactTransactionContacts<T extends TransactionBuyerShape>(
  transactions: T[],
  viewer: { userId: string; role: string },
) {
  return transactions.map((t) => redactTransactionContact(t, viewer));
}
