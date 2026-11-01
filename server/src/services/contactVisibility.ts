// =============================================================================
// Contact visibility: what the two sides of a deal may see of each other
// =============================================================================
// THE RULE (2026-11-02, the user's call): each side sees the other's NAME and
// nothing else. No phone, no email, no delivery address, no company or firm
// name, before payment or after. CropBid is the point of contact for both
// sides (call or WhatsApp CROPBID_CONTACT_PHONE, utils/contactDetails.ts) and
// CropBid does the delivery, household orders included, so neither side needs
// the other's details to finish a deal.
//
// It used to release the buyer's phone and delivery address to the seller once
// the money reached escrow, because the seller then arranged delivery. Since
// CropBid books every truck (CLAUDE.md §2a) that release only served one
// purpose, taking the next deal off-platform.
//
// Deliberately NOT covered here: admin endpoints (ops must see both parties
// to deliver, run support and settle disputes) and orderAlert.service (which
// mails the ops inbox, i.e. the platform itself, not a counterparty).
// A viewer reading their OWN row sees their own details as always.

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

// Kept for callers that ask whether a deal is paid; it no longer decides
// whether contact details reach the other side. Nothing does: they never do.
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
// Bid.contactPhone / Bid.deliveryAddress are snapshotted off the buyer's
// profile at bid time (see orderContactDefaults in bid.service). That snapshot
// is the real leak: stripping buyer.phone from the Prisma select alone would
// have changed nothing, because BidCard falls back to bid.contactPhone.
//
// Every caller is the seller reading bids on their own lots, so both are
// always withheld. `contactReleased: false` tells the UI to point at CropBid
// rather than render an empty block that looks like a bug.
export function redactBidContact<T extends BidContactFields>(bid: T) {
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

// The buyer reading their own deal, or an admin, sees everything. The seller
// never sees the buyer's phone, and the bid's snapshotted address and phone
// are stripped by the caller on `contactReleased: false` (transaction.service).
// Email is never selected for a counterparty at all.
export function redactTransactionContact<T extends TransactionBuyerShape>(
  transaction: T,
  viewer: { userId: string; role: string },
) {
  const isOwnRow = transaction.buyerId === viewer.userId;
  if (viewer.role === 'ADMIN' || isOwnRow) {
    return { ...transaction, contactReleased: true as const };
  }
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
