// =============================================================================
// Notification Helpers — Convenience functions to emit notifications
// =============================================================================
// These are called from bid, negotiation, and transaction services
// to send contextual notifications at key lifecycle events.
// =============================================================================

import { createNotification } from './notification.service';

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

export async function notifyShipmentBooked(userId: string, cropName: string, partnerName: string, pickupDate: string, transactionId: string, shipmentId: string) {
  await createNotification({
    userId,
    type: 'SHIPMENT_BOOKED',
    title: `Shipment booked for ${cropName}`,
    message: `${partnerName} will pick up on ${new Date(pickupDate).toLocaleDateString('en-IN')}`,
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
