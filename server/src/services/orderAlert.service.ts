// =============================================================================
// Order Alert Service — one ops email per order placed
// =============================================================================
// Every order on CropBid, whichever door it comes in through, ends up as a
// Transaction created by transaction.service.createTransaction(). This module
// turns that record into an email to config.orderAlertEmail so the platform
// sees the order flow without watching the admin panel.
//
// WHY IT TAKES A BID ID, NOT A TRANSACTION
// createTransaction runs INSIDE the caller's prisma.$transaction, so the row it
// returns isn't committed yet. Alerting from there would email orders that then
// rolled back. Instead each call site fires this AFTER its transaction commits,
// and this module re-reads through the top-level client: if the sale rolled
// back there is no row, and no email goes out. Every call site already holds
// the bid id, and Transaction.bidId is unique, so it's the natural key.
//
// NEVER THROWS. A failed alert must not fail an order that is already real, so
// errors are logged and swallowed here rather than at each call site.
// =============================================================================

import { prisma } from '../lib/prisma';
import { config } from '../config';
import { sendNewOrderEmail } from './email.service';

// How the order was struck — the platform reads these very differently, so the
// email says which one it was rather than making them all look the same.
export type OrderChannel =
  | 'DIRECT_PURCHASE'
  | 'BID_ACCEPTED'
  | 'AGENT_DEAL'
  | 'AUCTION_WIN'
  | 'REQUIREMENT_FILL';

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  DIRECT_PURCHASE: 'Consumer direct buy (fixed retail price)',
  BID_ACCEPTED: 'Farmer accepted a buyer bid',
  AGENT_DEAL: 'AI agents closed the negotiation',
  AUCTION_WIN: 'Won in a live auction',
  REQUIREMENT_FILL: 'Farmer filled a buyer requirement',
};

export async function alertNewOrder(bidId: string, channel: OrderChannel): Promise<void> {
  try {
    const order = await prisma.transaction.findUnique({
      where: { bidId },
      include: {
        listing: { select: { cropName: true, cropVariety: true, unit: true } },
        bid: { select: { quantity: true, deliveryAddress: true, contactPhone: true } },
        buyer: { select: { name: true, email: true, phone: true } },
        farmer: { select: { name: true, phone: true, location: true } },
      },
    });

    // No row — the sale rolled back after this was queued. Nothing was ordered.
    if (!order) return;

    await sendNewOrderEmail(config.orderAlertEmail, {
      // Last 6 characters of the uuid, upper-cased — the same short form the
      // requirement descriptions already quote at people.
      reference: order.id.slice(-6).toUpperCase(),
      channel: CHANNEL_LABEL[channel],
      placedAt: order.createdAt,
      cropName: order.listing.cropName,
      cropVariety: order.listing.cropVariety,
      quantity: order.bid.quantity,
      unit: order.listing.unit,
      pricePerUnit: order.finalPricePerUnit,
      totalAmount: order.totalAmount,
      platformFeeAmount: order.platformFeeAmount,
      currency: order.currency,
      buyerName: order.buyer.name,
      buyerEmail: order.buyer.email || '—',
      // The bid snapshots contact details at order time; the profile is the
      // fallback for paths that never collected them.
      buyerPhone: order.bid.contactPhone || order.buyer.phone,
      deliveryAddress: order.bid.deliveryAddress,
      farmerName: order.farmer.name,
      farmerPhone: order.farmer.phone,
      farmerLocation: order.farmer.location,
      adminUrl: `${config.clientUrl}/admin/transactions`,
    });
  } catch (err) {
    console.error(`Failed to email the new-order alert for bid ${bidId}:`, err);
  }
}
