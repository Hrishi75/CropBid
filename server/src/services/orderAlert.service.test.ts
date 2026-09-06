// =============================================================================
// orderAlert.service tests — the ops "an order came in" email
// =============================================================================
// Three things have to hold for this alert to be trustworthy: it goes out with
// the order's real numbers and both sides' contact details, it stays SILENT
// when the sale rolled back (the caller fires it optimistically after commit),
// and it never throws — an unreachable mail server must not surface as a failed
// order to the buyer.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    transaction: { findUnique: vi.fn() },
  },
}));

vi.mock('../config', () => ({
  config: {
    orderAlertEmail: 'info@cropbid.in',
    clientUrl: 'https://cropbid.in',
  },
}));

vi.mock('./email.service', () => ({
  sendNewOrderEmail: vi.fn(),
}));

// The ops in-app ping rides along with this email. Mocked rather than exercised
// because it reaches the socket layer, and this file is about the alert; what
// matters here is only WHEN it is called, which the last two cases pin down.
vi.mock('./notification.helpers', () => ({
  notifyAdminsDealClosed: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import { sendNewOrderEmail } from './email.service';
import { notifyAdminsDealClosed } from './notification.helpers';
import { alertNewOrder } from './orderAlert.service';

const findUnique = prisma.transaction.findUnique as unknown as ReturnType<typeof vi.fn>;
const sendMock = sendNewOrderEmail as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyAdminsDealClosed as unknown as ReturnType<typeof vi.fn>;

const ORDER = {
  id: 'ffffffff-0000-0000-0000-0000000abc123',
  createdAt: new Date('2026-08-08T06:30:00.000Z'),
  finalPricePerUnit: 25,
  totalAmount: 1250,
  platformFeeAmount: 25,
  currency: 'INR',
  listing: { cropName: 'Onion', cropVariety: 'Nashik Red', unit: 'KG' },
  bid: { quantity: 50, deliveryAddress: '12 MG Road, Pune', contactPhone: '9876543210' },
  buyer: { name: 'Anita Desai', email: 'anita@example.com', phone: '9000000001' },
  farmer: { name: 'Rajesh Patil', phone: '9000000002', location: 'Nashik' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('alertNewOrder', () => {
  it('emails the ops inbox with the order details', async () => {
    findUnique.mockResolvedValue(ORDER);

    await alertNewOrder('bid-1', 'DIRECT_PURCHASE');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bidId: 'bid-1' } }),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);

    const [to, payload] = sendMock.mock.calls[0];
    expect(to).toBe('info@cropbid.in');
    expect(payload).toMatchObject({
      reference: 'ABC123',
      channel: 'Consumer direct buy (fixed retail price)',
      cropName: 'Onion',
      quantity: 50,
      unit: 'KG',
      totalAmount: 1250,
      buyerName: 'Anita Desai',
      buyerEmail: 'anita@example.com',
      deliveryAddress: '12 MG Road, Pune',
      farmerName: 'Rajesh Patil',
      adminUrl: 'https://cropbid.in/admin/transactions',
    });
  });

  it('prefers the phone snapshotted on the bid over the buyer profile', async () => {
    findUnique.mockResolvedValue({
      ...ORDER,
      bid: { ...ORDER.bid, contactPhone: null },
    });

    await alertNewOrder('bid-1', 'BID_ACCEPTED');

    expect(sendMock.mock.calls[0][1]).toMatchObject({ buyerPhone: '9000000001' });
  });

  it('sends nothing when the sale rolled back and no transaction exists', async () => {
    findUnique.mockResolvedValue(null);

    await alertNewOrder('bid-gone', 'AUCTION_WIN');

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('swallows send failures so the order still succeeds', async () => {
    findUnique.mockResolvedValue(ORDER);
    sendMock.mockRejectedValue(new Error('SMTP down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(alertNewOrder('bid-1', 'AGENT_DEAL')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// The ops ping. It lives here, not in createTransaction, because that runs
// inside the caller's interactive transaction and the row is not committed
// yet — paging ops from there could announce a deal that then rolled back and
// hand them a booking link to nothing. These two cases are that rule.
// ---------------------------------------------------------------------------
describe('alertNewOrder — ops deal notification', () => {
  it('pages ops once the order is confirmed committed', async () => {
    findUnique.mockResolvedValue(ORDER);

    await alertNewOrder('bid-1', 'BID_ACCEPTED');

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      'Onion',
      'Rajesh Patil',
      'Anita Desai',
      1250,
      'INR',
      ORDER.id,
    );
  });

  it('stays silent when the sale rolled back', async () => {
    findUnique.mockResolvedValue(null);

    await alertNewOrder('bid-1', 'BID_ACCEPTED');

    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('still emails when the ops ping fails', async () => {
    findUnique.mockResolvedValue(ORDER);
    notifyMock.mockRejectedValueOnce(new Error('socket down'));

    await expect(alertNewOrder('bid-1', 'BID_ACCEPTED')).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
