// =============================================================================
// Notification Helpers — Convenience functions to emit notifications
// =============================================================================
// These are called from bid, negotiation, and transaction services
// to send contextual notifications at key lifecycle events.
// =============================================================================

import { createNotification } from './notification.service';
import { prisma } from '../lib/prisma';

// --- Bid Events ---

export async function notifyNewBid(farmerId: string, bidderName: string, cropName: string, price: number, currency: string, unit: string, listingId: string, bidId: string) {
  await createNotification({
    userId: farmerId,
    type: 'NEW_BID',
    title: `New bid on ${cropName}`,
    message: `${bidderName} offered ${currency} ${price}/${unit}`,
    data: { listingId, bidId },
  });
}

export async function notifyBidAccepted(buyerId: string, cropName: string, price: number, currency: string, unit: string, listingId: string, bidId: string) {
  await createNotification({
    userId: buyerId,
    type: 'BID_ACCEPTED',
    title: `Bid accepted!`,
    message: `Your bid on ${cropName} at ${currency} ${price}/${unit} was accepted`,
    data: { listingId, bidId },
  });
}

export async function notifyBidRejected(buyerId: string, cropName: string, listingId: string, bidId: string) {
  await createNotification({
    userId: buyerId,
    type: 'BID_REJECTED',
    title: `Bid rejected`,
    message: `Your bid on ${cropName} was rejected by the farmer`,
    data: { listingId, bidId },
  });
}

export async function notifyBidCountered(buyerId: string, cropName: string, counterPrice: number, currency: string, unit: string, listingId: string, bidId: string) {
  await createNotification({
    userId: buyerId,
    type: 'BID_COUNTERED',
    title: `Counter offer on ${cropName}`,
    message: `Farmer countered with ${currency} ${counterPrice}/${unit}`,
    data: { listingId, bidId },
  });
}

export async function notifyDirectPurchase(farmerId: string, buyerName: string, cropName: string, quantity: number, unit: string, listingId: string, bidId: string) {
  await createNotification({
    userId: farmerId,
    type: 'DIRECT_PURCHASE',
    title: `${cropName} sold directly`,
    message: `${buyerName} bought ${quantity} ${unit} of your ${cropName} at your listed retail price`,
    data: { listingId, bidId },
  });
}

// --- Buyer Requirement Events ---
// The reverse marketplace. Note which payloads carry `transactionId`: the
// notification dropdown checks for it BEFORE the listing/requirement branches,
// so the two "deal is done" events deep-link both parties straight to the deal.
// The others carry `requirementId` and land on the relevant inbox instead.

// The only requirement notification that goes to someone NOT already in the
// loop. The other four are replies within a conversation the recipient started;
// this one is how a farmer finds out a conversation is available at all.
// Routed to the farmer's feed rather than a detail page, so they land somewhere
// they can act on it — and on the rest of the open demand while they are there.
export async function notifyNewRequirement(
  farmerUserId: string,
  buyerName: string,
  cropName: string,
  quantity: number,
  unit: string,
  price: number,
  currency: string,
  deliveryLocation: string,
  requirementId: string,
) {
  await createNotification({
    userId: farmerUserId,
    type: 'NEW_REQUIREMENT',
    title: `${buyerName} wants ${quantity} ${unit} of ${cropName}`,
    message: `${currency} ${price}/${unit}, delivered to ${deliveryLocation}. Fill it at their price or counter with yours.`,
    data: { requirementId },
  });
}

export async function notifyRequirementOffer(buyerId: string, farmerName: string, cropName: string, price: number, currency: string, unit: string, requirementId: string, offerId: string) {
  await createNotification({
    userId: buyerId,
    type: 'REQUIREMENT_OFFER',
    title: `New offer on your ${cropName} requirement`,
    message: `${farmerName} offered ${currency} ${price}/${unit}`,
    data: { requirementId, offerId },
  });
}

export async function notifyRequirementFilled(buyerId: string, farmerName: string, cropName: string, quantity: number, unit: string, requirementId: string, offerId: string, transactionId: string) {
  await createNotification({
    userId: buyerId,
    type: 'REQUIREMENT_FILLED',
    title: `${cropName} requirement filled`,
    message: `${farmerName} supplied ${quantity} ${unit} at your posted price`,
    data: { requirementId, offerId, transactionId },
  });
}

export async function notifyRequirementOfferAccepted(farmerId: string, cropName: string, price: number, currency: string, unit: string, requirementId: string, offerId: string, transactionId: string) {
  await createNotification({
    userId: farmerId,
    type: 'REQUIREMENT_OFFER_ACCEPTED',
    title: 'Offer accepted!',
    message: `Your offer on ${cropName} at ${currency} ${price}/${unit} was accepted`,
    data: { requirementId, offerId, transactionId },
  });
}

export async function notifyRequirementOfferRejected(farmerId: string, cropName: string, requirementId: string, offerId: string) {
  await createNotification({
    userId: farmerId,
    type: 'REQUIREMENT_OFFER_REJECTED',
    title: 'Offer rejected',
    message: `Your offer on the ${cropName} requirement was rejected by the buyer`,
    data: { requirementId, offerId },
  });
}

export async function notifyRequirementClosed(farmerId: string, cropName: string, requirementId: string, offerId: string) {
  await createNotification({
    userId: farmerId,
    type: 'REQUIREMENT_CLOSED',
    title: `${cropName} requirement closed`,
    message: `The ${cropName} requirement you offered on is no longer open, so your offer has expired`,
    data: { requirementId, offerId },
  });
}

// --- Negotiation Events ---

export async function notifyNegotiationResult(userId: string, cropName: string, outcome: string, finalPrice: number | null, currency: string, unit: string, negotiationId: string) {
  const isDeal = outcome === 'DEAL';
  await createNotification({
    userId,
    type: 'NEGOTIATION_DONE',
    title: isDeal ? `Deal reached on ${cropName}!` : `No deal on ${cropName}`,
    message: isDeal
      ? `AI agents agreed on ${currency} ${finalPrice}/${unit}`
      : `AI agents could not reach an agreement on ${cropName}`,
    data: { negotiationId },
  });
}

// --- Transaction Events ---

export async function notifyDeliveryUpdate(userId: string, cropName: string, status: string, transactionId: string) {
  const labels: Record<string, string> = {
    IN_TRANSIT: 'has been shipped',
    DELIVERED: 'has been delivered',
    CONFIRMED: 'delivery confirmed — payment released',
  };

  await createNotification({
    userId,
    type: 'DELIVERY_UPDATE',
    title: `${cropName} ${labels[status] || status}`,
    message: `Delivery status updated to ${status.replace('_', ' ').toLowerCase()}`,
    data: { transactionId },
  });
}

export async function notifyPaymentReleased(farmerId: string, amount: number, currency: string, transactionId: string) {
  await createNotification({
    userId: farmerId,
    type: 'PAYMENT_RELEASED',
    title: 'Payment released!',
    message: `${currency} ${amount.toLocaleString('en-IN')} has been released to your account`,
    data: { transactionId },
  });
}

// --- Shipment Events ---

// No carrier name in the message. CropBid arranges the freight and the read
// endpoints strip the haulier's identity for both sides of the deal, so naming
// it here would leak it straight to a lock screen.
export async function notifyShipmentBooked(userId: string, cropName: string, pickupDate: string, transactionId: string, shipmentId: string) {
  await createNotification({
    userId,
    type: 'SHIPMENT_BOOKED',
    title: `Transport arranged for ${cropName}`,
    message: `Pickup is scheduled for ${new Date(pickupDate).toLocaleDateString('en-IN')}`,
    data: { transactionId, shipmentId },
  });
}

export async function notifyShipmentUpdate(userId: string, cropName: string, status: string, location: string, shipmentId: string) {
  const labels: Record<string, string> = {
    PICKED_UP: 'picked up',
    IN_TRANSIT: 'in transit',
    OUT_FOR_DELIVERY: 'out for delivery',
    DELIVERED: 'delivered',
    FAILED: 'delivery failed',
  };

  await createNotification({
    userId,
    type: 'SHIPMENT_UPDATE',
    title: `${cropName} — ${labels[status] || status}`,
    message: `Shipment ${labels[status] || status} at ${location}`,
    data: { shipmentId, status },
  });
}

// --- Ops (admin) events ---
// CropBid arranges the freight on every deal (CLAUDE.md §2a), so a closed deal
// is work landing on our desk, not just news for the two sides. These fan out
// to every ADMIN account rather than a shared inbox, because notifications hang
// off User and there is no ops-team row to hang one off instead.
//
// Best-effort by design: the caller must not fail a settled deal because a
// notification insert did. The durable queue is the deal itself, surfaced by
// /admin/attention, which reads transactions with no shipment rather than
// reading these rows. So a lost notification costs a ping, never the job.
export async function notifyAdminsDealClosed(
  cropName: string,
  sellerName: string,
  buyerName: string,
  amount: number,
  currency: string,
  transactionId: string,
) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: 'DEAL_NEEDS_TRANSPORT',
        title: `Deal closed — ${cropName} needs transport`,
        message: `${sellerName} → ${buyerName}, ${currency} ${amount.toLocaleString('en-IN')}. Book a carrier.`,
        data: { transactionId },
      }).catch(() => {}),
    ),
  );
}
