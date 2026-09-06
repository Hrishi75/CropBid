// =============================================================================
// Logistics Service — Business Logic
// =============================================================================
// All shipping logic: matching logistics partners to a transaction, computing
// transport quotes, booking shipments, and advancing shipment status along the
// allowed state machine (VALID_TRANSITIONS below). Converts crop units to kg
// for weight-based pricing and emits socket/notification events on changes.
//
// WHO DOES WHAT (changed: CropBid now arranges the freight itself)
//   Choosing a carrier, booking it, and driving the status are ops functions,
//   gated to ADMIN at the route. We book it because we inspect the goods on the
//   way through, and an inspection we do not control is not an inspection.
//   The farmer and buyer read the status and nothing else.
//
// THE SELLER PAYS. `paidBy` is no longer an input: bookShipment writes FARMER
// unconditionally, so no request can shift freight onto the buyer. Callers that
// used to send BUYER or SPLIT are ignored rather than rejected, because the
// field is gone from the request schema entirely.
//
// CARRIER IDENTITY IS STRIPPED ON READ for anyone who is not an admin, by
// forShipmentViewer() below. Hiding it in the client would not be enough: the
// endpoint is the boundary, the UI is a courtesy.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { getIO } from '../socket';
import { notifyShipmentBooked, notifyShipmentUpdate } from './notification.helpers';

// =============================================================================
// Helpers
// =============================================================================

// Who is asking. Every function below takes this instead of a bare userId,
// because "is this my shipment" and "am I ops" are two different questions and
// the old signature could only ask the first one.
export interface Actor {
  userId: string;
  role: string;
}

function isAdmin(actor: Actor): boolean {
  return actor.role === 'ADMIN';
}

// A role guard proves what KIND of user this is, never WHOSE data it is, so
// ownership is still checked here even on the admin-only routes.
function assertParty(tx: { farmerId: string; buyerId: string }, actor: Actor): void {
  if (isAdmin(actor)) return;
  if (tx.farmerId !== actor.userId && tx.buyerId !== actor.userId) {
    throw new ApiError(403, 'Not authorized');
  }
}

// What a trader is allowed to see about a shipment: where their goods are, and
// enough to recognise the truck at their own gate. Not who we hired, not what
// we are paying them, and not a phone number that routes around us.
//
// `logisticsPartner` is dropped whole rather than trimmed field by field: a
// trimmed object grows a field back the next time someone adds one to the
// include, and it would ship silently.
function forShipmentViewer<T extends Record<string, any> | null>(shipment: T, actor: Actor): T {
  if (!shipment || isAdmin(actor)) return shipment;
  const {
    logisticsPartner,
    // The foreign key goes too. It is a carrier identity in the same way the
    // name is, just one lookup away, and it would become a live leak the day
    // any partner-read endpoint opens to non-admins.
    logisticsPartnerId,
    driverPhone,
    platformCommission,
    ...visible
  } = shipment as any;
  return visible as T;
}

function convertToKg(quantity: number, unit: string): number {
  switch (unit) {
    case 'QUINTAL': return quantity * 100;
    case 'TONNE': return quantity * 1000;
    default: return quantity; // KG
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_PICKUP: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
};

// Map ShipmentStatus → Transaction DeliveryStatus
function mapToDeliveryStatus(shipmentStatus: string): string | null {
  switch (shipmentStatus) {
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'IN_TRANSIT';
    case 'DELIVERED':
      return 'DELIVERED';
    default:
      return null;
  }
}

// =============================================================================
// Get matching logistics partners for a transaction
// =============================================================================

export async function getMatchingPartners(transactionId: string, actor: Actor) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      listing: { include: { farmer: true } },
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  assertParty(transaction, actor);

  const listing = transaction.listing;
  const weightKg = convertToKg(listing.quantity, listing.unit);
  const isPerishable = ['tomato', 'banana', 'grape', 'onion', 'potato'].some(
    (crop) => listing.cropName.toLowerCase().includes(crop)
  );

  const partners = await prisma.logisticsPartner.findMany({
    where: {
      active: true,
      minQuantityKg: { lte: weightKg },
      maxQuantityKg: { gte: weightKg },
      OR: [
        { coverageRegions: { has: listing.state } },
        { coverageCountries: { has: listing.country } },
      ],
    },
    orderBy: { costPerKmPerKg: 'asc' },
  });

  return {
    partners,
    transactionInfo: {
      cropName: listing.cropName,
      quantity: listing.quantity,
      unit: listing.unit,
      weightKg,
      isPerishable,
      origin: `${listing.location}, ${listing.state}`,
      country: listing.country,
    },
  };
}

// =============================================================================
// Get transport quote
// =============================================================================

export async function getTransportQuote(
  partnerId: string,
  distanceKm: number,
  weightKg: number
) {
  const partner = await prisma.logisticsPartner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) throw new ApiError(404, 'Logistics partner not found');
  if (!partner.active) throw new ApiError(400, 'This partner is not active');

  const transportCost = Math.round(partner.costPerKmPerKg * distanceKm * weightKg * 100) / 100;
  const platformCommission = Math.round(transportCost * partner.commissionPercent / 100 * 100) / 100;

  return {
    partner,
    transportCost,
    platformCommission,
    totalCost: transportCost + platformCommission,
    estimatedDays: partner.avgDeliveryDays,
  };
}

// =============================================================================
// Book shipment
// =============================================================================

interface BookShipmentInput {
  transactionId: string;
  logisticsPartnerId: string;
  pickupLocation: string;
  deliveryLocation: string;
  pickupDate: string;
  distanceKm: number;
  totalWeightKg: number;
  vehicleType: string;
}

export async function bookShipment(input: BookShipmentInput, actor: Actor) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: {
      listing: true,
      shipment: true,
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  assertParty(transaction, actor);
  if (transaction.shipment) {
    throw new ApiError(409, 'Shipment already booked for this transaction');
  }

  const partner = await prisma.logisticsPartner.findUnique({
    where: { id: input.logisticsPartnerId },
  });
  if (!partner || !partner.active) {
    throw new ApiError(400, 'Invalid or inactive logistics partner');
  }

  const transportCost = Math.round(partner.costPerKmPerKg * input.distanceKm * input.totalWeightKg * 100) / 100;
  const platformCommission = Math.round(transportCost * partner.commissionPercent / 100 * 100) / 100;

  const estimatedDeliveryDate = new Date(input.pickupDate);
  estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + partner.avgDeliveryDays);

  const shipment = await prisma.shipment.create({
    data: {
      transactionId: input.transactionId,
      logisticsPartnerId: input.logisticsPartnerId,
      pickupLocation: input.pickupLocation,
      deliveryLocation: input.deliveryLocation,
      pickupDate: new Date(input.pickupDate),
      estimatedDeliveryDate,
      vehicleType: input.vehicleType,
      distanceKm: input.distanceKm,
      totalWeightKg: input.totalWeightKg,
      transportCost,
      platformCommission,
      currency: transaction.currency as any,
      // Not from the request. The seller carries the freight cost, always, so
      // there is no caller-supplied value here that could say otherwise.
      // SPLIT stays in the enum for the rows booked before this rule existed.
      paidBy: 'FARMER',
      splitPercentBuyer: null,
      trackingUpdates: [
        {
          timestamp: new Date().toISOString(),
          location: input.pickupLocation,
          status: 'PENDING_PICKUP',
          note: 'Shipment booked. Awaiting pickup.',
        },
      ],
    },
    include: { logisticsPartner: true },
  });

  // Notify both parties. Deliberately not by carrier name: the notification
  // reaches the same two people the read endpoints strip the carrier for, and
  // a push that names the haulier would undo that on the lock screen.
  const cropName = transaction.listing.cropName;
  notifyShipmentBooked(transaction.farmerId, cropName, input.pickupDate, transaction.id, shipment.id).catch(() => {});
  notifyShipmentBooked(transaction.buyerId, cropName, input.pickupDate, transaction.id, shipment.id).catch(() => {});

  return shipment;
}

// =============================================================================
// Update shipment status
// =============================================================================

interface TrackingUpdate {
  location: string;
  note: string;
}

export async function updateShipmentStatus(
  shipmentId: string,
  newStatus: string,
  update: TrackingUpdate,
  actor: Actor
) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: { include: { listing: true } } },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');

  const tx = shipment.transaction;
  assertParty(tx, actor);

  const allowed = VALID_TRANSITIONS[shipment.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `Cannot transition from ${shipment.status} to ${newStatus}`);
  }

  const trackingUpdates = (shipment.trackingUpdates as any[]) || [];
  trackingUpdates.push({
    timestamp: new Date().toISOString(),
    location: update.location,
    status: newStatus,
    note: update.note,
  });

  const updateData: any = {
    status: newStatus,
    trackingUpdates,
  };

  if (newStatus === 'DELIVERED') {
    updateData.actualDeliveryDate = new Date();
  }

  const updated = await prisma.shipment.update({
    where: { id: shipmentId },
    data: updateData,
    include: { logisticsPartner: true },
  });

  // Sync Transaction delivery status
  const deliveryStatus = mapToDeliveryStatus(newStatus);
  if (deliveryStatus) {
    await prisma.transaction.update({
      where: { id: shipment.transactionId },
      data: { deliveryStatus: deliveryStatus as any },
    });
  }

  // Notify both parties
  const cropName = tx.listing.cropName;
  notifyShipmentUpdate(tx.farmerId, cropName, newStatus, update.location, shipmentId).catch(() => {});
  notifyShipmentUpdate(tx.buyerId, cropName, newStatus, update.location, shipmentId).catch(() => {});

  // Socket.io real-time push
  const io = getIO();
  if (io) {
    io.to(`user:${tx.farmerId}`).to(`user:${tx.buyerId}`).emit('shipment:status_update', {
      shipmentId,
      status: newStatus,
      trackingUpdate: trackingUpdates[trackingUpdates.length - 1],
    });
  }

  return updated;
}

// =============================================================================
// Update driver info
// =============================================================================

export async function updateDriverInfo(
  shipmentId: string,
  data: { driverName?: string; driverPhone?: string; vehicleNumber?: string },
  actor: Actor
) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: true },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  // Was the farmer's to fill in, back when the farmer booked the truck. We
  // hire the carrier now, so we are the only ones who know the driver.
  assertParty(shipment.transaction, actor);

  const updated = await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      driverName: data.driverName ?? shipment.driverName,
      driverPhone: data.driverPhone ?? shipment.driverPhone,
      vehicleNumber: data.vehicleNumber ?? shipment.vehicleNumber,
    },
  });

  // Real-time push
  const io = getIO();
  if (io) {
    const tx = shipment.transaction;
    // driverPhone is deliberately absent. This socket goes to the farmer and
    // the buyer, the same two people forShipmentViewer() strips it from, and a
    // push channel that carries what the REST read withholds is not a boundary.
    io.to(`user:${tx.farmerId}`).to(`user:${tx.buyerId}`).emit('shipment:driver_update', {
      shipmentId,
      driverName: updated.driverName,
      vehicleNumber: updated.vehicleNumber,
    });
  }

  return updated;
}

// =============================================================================
// Get shipment
// =============================================================================

export async function getShipment(shipmentId: string, actor: Actor) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      logisticsPartner: true,
      transaction: { include: { listing: true } },
    },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  assertParty(shipment.transaction, actor);

  return forShipmentViewer(shipment, actor);
}

export async function getShipmentByTransaction(transactionId: string, actor: Actor) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  assertParty(transaction, actor);

  const shipment = await prisma.shipment.findUnique({
    where: { transactionId },
    include: { logisticsPartner: true },
  });

  return forShipmentViewer(shipment, actor); // null if no shipment yet
}

// =============================================================================
// Upload proof of delivery
// =============================================================================

export async function uploadProofOfDelivery(shipmentId: string, imageUrl: string, actor: Actor) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: true },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  // Still the seller's, plus ops. They are the one standing at the loading bay.
  if (!isAdmin(actor) && shipment.transaction.farmerId !== actor.userId) {
    throw new ApiError(403, 'Only the seller can upload proof of delivery');
  }
  if (shipment.status !== 'DELIVERED') {
    throw new ApiError(400, 'Can only upload proof after delivery');
  }

  return prisma.shipment.update({
    where: { id: shipmentId },
    data: { proofOfDelivery: imageUrl },
  });
}

// =============================================================================
// Admin: Partner CRUD
// =============================================================================

export async function getAllPartners(filters?: { type?: string; active?: boolean }) {
  const where: any = {};
  if (filters?.type) where.type = filters.type;
  if (filters?.active !== undefined) where.active = filters.active;

  return prisma.logisticsPartner.findMany({
    where,
    orderBy: { name: 'asc' },
  });
}

export async function createPartner(data: any) {
  return prisma.logisticsPartner.create({ data });
}

export async function updatePartner(id: string, data: any) {
  return prisma.logisticsPartner.update({ where: { id }, data });
}

export async function togglePartner(id: string) {
  const partner = await prisma.logisticsPartner.findUnique({ where: { id } });
  if (!partner) throw new ApiError(404, 'Partner not found');

  return prisma.logisticsPartner.update({
    where: { id },
    data: { active: !partner.active },
  });
}
