// =============================================================================
// contactVisibility tests — the disintermediation gate
// =============================================================================
// This module is the only thing standing between a farmer and the direct phone
// number of every buyer who bids on their listing. The properties that have to
// hold are narrow but absolute:
//
//   1. Nothing is released while the deal is unpaid — AWAITING_PAYMENT is the
//      state a transaction is BORN in, so treating it as "deal done" would make
//      the gate decorative.
//   2. The snapshot on the Bid is redacted too, not just the buyer relation —
//      the UI reads bid.contactPhone FIRST, so missing it leaks everything.
//   3. The gate never fires against the buyer's own data or against admins,
//      who must be able to run support.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  isContactReleased,
  redactBidContact,
  redactBidContacts,
  redactTransactionContact,
  PUBLIC_BUYER_USER_SELECT,
} from './contactVisibility';

const BID = {
  id: 'bid-1',
  deliveryAddress: '12 MG Road, Pune',
  contactPhone: '9876543210',
};

const TXN = {
  buyerId: 'buyer-1',
  buyer: { id: 'buyer-1', name: 'California Burrito', trustScore: 70, phone: '9876543210' },
};

const FARMER = { userId: 'farmer-1', role: 'FARMER' };

describe('isContactReleased', () => {
  it('releases only once money is captured or paid out', () => {
    expect(isContactReleased('ESCROW')).toBe(true);
    expect(isContactReleased('RELEASED')).toBe(true);
  });

  // The whole point of the gate. A Transaction row exists from bid-acceptance
  // onward, so if AWAITING_PAYMENT counted, the farmer would get the number
  // before a single rupee moved and could simply not pay through the platform.
  it('withholds while the buyer has not paid', () => {
    expect(isContactReleased('AWAITING_PAYMENT')).toBe(false);
  });

  // A refunded deal has no delivery left to arrange, so the reason for
  // releasing contact has evaporated along with the sale.
  it('withholds on a refunded deal', () => {
    expect(isContactReleased('REFUNDED')).toBe(false);
  });

  it('withholds when there is no transaction at all (a PENDING bid)', () => {
    expect(isContactReleased(undefined)).toBe(false);
    expect(isContactReleased(null)).toBe(false);
  });
});

describe('redactBidContact', () => {
  it('strips the snapshotted address and phone off an unpaid bid', () => {
    const out = redactBidContact({ ...BID, transaction: null });
    expect(out.contactPhone).toBeNull();
    expect(out.deliveryAddress).toBeNull();
    expect(out.contactReleased).toBe(false);
  });

  it('keeps everything else on the bid intact', () => {
    const out = redactBidContact({ ...BID, transaction: null });
    expect(out.id).toBe('bid-1');
  });

  it('releases both fields once the money is in escrow', () => {
    const out = redactBidContact({ ...BID, transaction: { paymentStatus: 'ESCROW' as const } });
    expect(out.contactPhone).toBe('9876543210');
    expect(out.deliveryAddress).toBe('12 MG Road, Pune');
    expect(out.contactReleased).toBe(true);
  });

  it('redacts every bid in a list independently of the others', () => {
    const out = redactBidContacts([
      { ...BID, transaction: null },
      { ...BID, transaction: { paymentStatus: 'ESCROW' as const } },
    ]);
    expect(out[0].contactPhone).toBeNull();
    expect(out[1].contactPhone).toBe('9876543210');
  });
});

describe('redactTransactionContact', () => {
  it('hides the buyer phone from the farmer until payment clears', () => {
    const out = redactTransactionContact(
      { ...TXN, paymentStatus: 'AWAITING_PAYMENT' as const },
      FARMER,
    );
    expect(out.buyer.phone).toBeNull();
    expect(out.contactReleased).toBe(false);
  });

  it('gives the farmer the phone once payment is in escrow', () => {
    const out = redactTransactionContact({ ...TXN, paymentStatus: 'ESCROW' as const }, FARMER);
    expect(out.buyer.phone).toBe('9876543210');
    expect(out.contactReleased).toBe(true);
  });

  // Redacting a buyer's own contact details back at them would be a bug, not
  // extra safety — they'd see their own delivery address blanked on their
  // own order.
  it('never redacts the buyer against their own row', () => {
    const out = redactTransactionContact(
      { ...TXN, paymentStatus: 'AWAITING_PAYMENT' as const },
      { userId: 'buyer-1', role: 'BUYER' },
    );
    expect(out.buyer.phone).toBe('9876543210');
    expect(out.contactReleased).toBe(true);
  });

  // The platform has to see both sides to run support and settle disputes.
  it('never redacts for an admin', () => {
    const out = redactTransactionContact(
      { ...TXN, paymentStatus: 'AWAITING_PAYMENT' as const },
      { userId: 'admin-1', role: 'ADMIN' },
    );
    expect(out.buyer.phone).toBe('9876543210');
    expect(out.contactReleased).toBe(true);
  });

  it('keeps the buyer identity readable while withholding contact', () => {
    const out = redactTransactionContact(
      { ...TXN, paymentStatus: 'AWAITING_PAYMENT' as const },
      FARMER,
    );
    expect(out.buyer.name).toBe('California Burrito');
    expect(out.buyer.trustScore).toBe(70);
  });
});

describe('PUBLIC_BUYER_USER_SELECT', () => {
  // A regression guard rather than a behaviour test: this select is what the
  // bid queries hand to Prisma, so anything added here ships straight to the
  // farmer. phone/email/location must never appear.
  it('carries identity and nothing reachable', () => {
    expect(Object.keys(PUBLIC_BUYER_USER_SELECT).sort()).toEqual([
      'avatar',
      'id',
      'name',
      'trustScore',
    ]);
  });
});
