// =============================================================================
// getTransaction: who may open one deal
// =============================================================================
// The two sides of the deal, and admins. Admin → Transactions links every row
// to this page, and for as long as this function checked the two sides only,
// every one of those links was a 403.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: { transaction: { findUnique: vi.fn() } },
}));
vi.mock('./notification.helpers', () => ({
  notifyDeliveryUpdate: vi.fn(() => Promise.resolve()),
  notifyPaymentReleased: vi.fn(() => Promise.resolve()),
}));

import { prisma } from '../lib/prisma';
import { getTransaction } from './transaction.service';

const findUnique = prisma.transaction.findUnique as unknown as ReturnType<typeof vi.fn>;

const SELLER = 'seller-1';
const BUYER = 'buyer-1';

function deal(paymentStatus: string) {
  return {
    id: 'tx-1',
    farmerId: SELLER,
    buyerId: BUYER,
    paymentStatus,
    buyer: { id: BUYER, name: 'Anita', trustScore: 50, phone: '9822055667' },
    bid: { deliveryAddress: 'Near Shivaji Chowk', contactPhone: '9822055667' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTransaction', () => {
  it('lets an admin open a deal they are not part of', async () => {
    findUnique.mockResolvedValue(deal('ESCROW'));
    await expect(getTransaction('tx-1', 'admin-1', 'ADMIN')).resolves.toMatchObject({ id: 'tx-1' });
  });

  // Ops working a deal need to reach both sides, and every other admin read
  // already shows the buyer's contact.
  it('shows an admin the buyer contact before payment', async () => {
    findUnique.mockResolvedValue(deal('AWAITING_PAYMENT'));

    const viewed = await getTransaction('tx-1', 'admin-1', 'ADMIN');

    expect(viewed.contactReleased).toBe(true);
    expect(viewed.buyer.phone).toBe('9822055667');
    expect(viewed.bid.contactPhone).toBe('9822055667');
  });

  it('still refuses anyone else', async () => {
    findUnique.mockResolvedValue(deal('ESCROW'));
    await expect(getTransaction('tx-1', 'stranger', 'BUYER')).rejects.toMatchObject({ statusCode: 403 });
    await expect(getTransaction('tx-1', 'stranger', 'CONSUMER')).rejects.toMatchObject({ statusCode: 403 });
  });

  // The contact gate is unchanged for the seller.
  it('still hides the buyer contact from the seller until payment', async () => {
    findUnique.mockResolvedValue(deal('AWAITING_PAYMENT'));

    const viewed = await getTransaction('tx-1', SELLER, 'FARMER');

    expect(viewed.contactReleased).toBe(false);
    expect(viewed.buyer.phone).toBeNull();
    expect(viewed.bid.contactPhone).toBeNull();
    expect(viewed.bid.deliveryAddress).toBeNull();
  });
});
