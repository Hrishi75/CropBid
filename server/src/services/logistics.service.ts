// =============================================================================
// Logistics Service — Business Logic
// =============================================================================
// All shipping logic: matching logistics partners to a transaction, computing
// transport quotes, booking shipments, and advancing shipment status along the
// allowed state machine (VALID_TRANSITIONS below). Converts crop units to kg
// for weight-based pricing and emits socket/notification events on changes.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { getIO } from '../socket';
import { notifyShipmentBooked, notifyShipmentUpdate } from './notification.helpers';

// =============================================================================
// Helpers
// =============================================================================

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

export async function getMatchingPartners(transactionId: string, userId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      listing: { include: { farmer: true } },
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  if (transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'Not authorized');
  }

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
  paidBy: 'BUYER' | 'FARMER' | 'SPLIT';
  splitPercentBuyer?: number;
}

export async function bookShipment(input: BookShipmentInput, userId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: {
      listing: true,
      shipment: true,
    },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  if (transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'Not authorized');
  }
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
      paidBy: input.paidBy,
      splitPercentBuyer: input.paidBy === 'SPLIT' ? (input.splitPercentBuyer ?? 50) : null,
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

  // Notify both parties
  const cropName = transaction.listing.cropName;
  notifyShipmentBooked(transaction.farmerId, cropName, partner.name, input.pickupDate, transaction.id, shipment.id).catch(() => {});
  notifyShipmentBooked(transaction.buyerId, cropName, partner.name, input.pickupDate, transaction.id, shipment.id).catch(() => {});

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
  userId: string
) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: { include: { listing: true } } },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');

  const tx = shipment.transaction;
  if (tx.farmerId !== userId && tx.buyerId !== userId) {
    throw new ApiError(403, 'Not authorized');
  }

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
  userId: string
) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: true },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  if (shipment.transaction.farmerId !== userId) {
    throw new ApiError(403, 'Only the farmer can update driver info');
  }

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
    io.to(`user:${tx.farmerId}`).to(`user:${tx.buyerId}`).emit('shipment:driver_update', {
      shipmentId,
      driverName: updated.driverName,
      driverPhone: updated.driverPhone,
      vehicleNumber: updated.vehicleNumber,
    });
  }

  return updated;
}

// =============================================================================
// Get shipment
// =============================================================================

export async function getShipment(shipmentId: string, userId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      logisticsPartner: true,
      transaction: { include: { listing: true } },
    },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  const tx = shipment.transaction;
  if (tx.farmerId !== userId && tx.buyerId !== userId) {
    throw new ApiError(403, 'Not authorized');
  }

  return shipment;
}

export async function getShipmentByTransaction(transactionId: string, userId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new ApiError(404, 'Transaction not found');
  if (transaction.farmerId !== userId && transaction.buyerId !== userId) {
    throw new ApiError(403, 'Not authorized');
  }

  const shipment = await prisma.shipment.findUnique({
    where: { transactionId },
    include: { logisticsPartner: true },
  });

  return shipment; // null if no shipment yet
}

// =============================================================================
// Upload proof of delivery
// =============================================================================

export async function uploadProofOfDelivery(shipmentId: string, imageUrl: string, userId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { transaction: true },
  });

  if (!shipment) throw new ApiError(404, 'Shipment not found');
  if (shipment.transaction.farmerId !== userId) {
    throw new ApiError(403, 'Only the farmer can upload proof of delivery');
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
