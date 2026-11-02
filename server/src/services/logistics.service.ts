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
//   gated to ADMIN at the route. The farmer and buyer read the status and
//   nothing else.
//
//   We took the booking because an inspection carried out by a truck the seller
//   hired is not an inspection, so owning it is what would let us check the
//   goods at pickup and settle on what we find. That is the INTENT and it is
//   unbuilt: VALID_TRANSITIONS below has no inspection step, there is no field
//   for a result, and nothing here can move an amount off the agreed price.
//   Building it touches escrow, the fee basis and both sides' numbers, so it is
//   a design job. Until then no user-facing string may claim we check goods.
//
// WHO PAYS IS A TERM OF THE DEAL, not of the booking. The seller sets it on
// the listing and a bid can propose otherwise (utils/freight.ts); accepting
// the bid fixes it on the Transaction. `paidBy` is still not a booking input:
// bookShipment copies the deal's terms, so ops cannot bill a side for freight
// it never agreed to. When the buyer has a share, ops quote the delivery first
// (setFreightQuote) and the shipment costs exactly that quote.
//
// CARRIER IDENTITY IS STRIPPED ON READ for anyone who is not an admin, by
// forShipmentViewer() below. Hiding it in the client would not be enough: the
// endpoint is the boundary, the UI is a courtesy.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { getIO } from '../socket';
import { notifyFreightQuoted, notifyShipmentBooked, notifyShipmentUpdate } from './notification.helpers';
import { buyerPayable, buyerPaysFreight, freightShares, MAX_FREIGHT_QUOTE } from '../utils/freight';

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
  // Names only between the two sides (contactVisibility.ts): each keeps their
  // own end of the route and loses the other's, which is the other party's
  // address. The event log's locations go too, since the first of them is the
  // pickup point. Without the deal to say who is reading, both ends go.
  const tx = (shipment as any).transaction as { farmerId?: string; buyerId?: string } | undefined;
  const isSeller = tx?.farmerId === actor.userId;
  const isBuyer = tx?.buyerId === actor.userId;
  if (!isSeller) visible.pickupLocation = null;
  if (!isBuyer) visible.deliveryLocation = null;
  if (Array.isArray(visible.trackingUpdates)) {
    visible.trackingUpdates = visible.trackingUpdates.map((u: Record<string, unknown>) => ({ ...u, location: null }));
  }
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
      // The deal's delivery terms, so ops know whether to quote the buyer
      // first, and whether that quote can still be changed.
      freightPaidBy: transaction.retailOrderId ? 'FARMER' : transaction.freightPaidBy,
      freightQuote: transaction.freightQuote,
      buyerPaysFreight: !transaction.retailOrderId && buyerPaysFreight(transaction.freightPaidBy),
      quoteLocked: transaction.paymentStatus !== 'AWAITING_PAYMENT' || transaction.razorpayOrderId != null,
      paymentStatus: transaction.paymentStatus,
      currency: transaction.currency,
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
  const partner = await prisma.logisticsPartner.findUnique({
    where: { id: input.logisticsPartnerId },
  });
  if (!partner || !partner.active) {
    throw new ApiError(400, 'Invalid or inactive logistics partner');
  }

  const shipment = await prisma.$transaction(async (tx) => {
    // Locked so a quote being set at the same moment waits for this booking
    // (and then finds a shipment and refuses), rather than repricing a deal
    // whose carrier is already booked at the old figure.
    await tx.$queryRaw`SELECT 1 FROM "Transaction" WHERE "id" = ${input.transactionId} FOR UPDATE`;
    const transaction = await tx.transaction.findUnique({
      where: { id: input.transactionId },
      include: { listing: true, shipment: true },
    });

    if (!transaction) throw new ApiError(404, 'Transaction not found');
    assertParty(transaction, actor);
    if (transaction.shipment) {
      throw new ApiError(409, 'Shipment already booked for this transaction');
    }

    // A buyer with a share agreed to pay a quoted figure, so the booking costs
    // that figure. Booking without one would charge them an amount nobody
    // showed them.
    const buyerShare = !transaction.retailOrderId && buyerPaysFreight(transaction.freightPaidBy);
    if (buyerShare && transaction.freightQuote == null) {
      throw new ApiError(409, 'The buyer pays towards delivery on this deal. Send them a delivery quote before booking.', 'FREIGHT_QUOTE_REQUIRED');
    }
    const transportCost = transaction.freightQuote != null
      ? transaction.freightQuote
      : Math.round(partner.costPerKmPerKg * input.distanceKm * input.totalWeightKg * 100) / 100;
    const platformCommission = Math.round(transportCost * partner.commissionPercent / 100 * 100) / 100;

    const estimatedDeliveryDate = new Date(input.pickupDate);
    estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + partner.avgDeliveryDays);

    const created = await tx.shipment.create({
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
        // From the deal, never the request: the terms both sides agreed.
        paidBy: transaction.retailOrderId ? 'FARMER' : transaction.freightPaidBy,
        splitPercentBuyer: !transaction.retailOrderId && transaction.freightPaidBy === 'SPLIT' ? 50 : null,
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
    return { created, transaction };
  });

  // Notify both parties. Deliberately not by carrier name: the notification
  // reaches the same two people the read endpoints strip the carrier for, and
  // a push that names the haulier would undo that on the lock screen.
  const { created, transaction } = shipment;
  const cropName = transaction.listing.cropName;
  notifyShipmentBooked(transaction.farmerId, cropName, input.pickupDate, transaction.id, created.id).catch(() => {});
  notifyShipmentBooked(transaction.buyerId, cropName, input.pickupDate, transaction.id, created.id).catch(() => {});

  return created;
}

// =============================================================================
// Quote delivery to the buyer (ADMIN)
// =============================================================================
// On a deal where the buyer pays half or all of the delivery, the buyer cannot
// pay until this is set, because they pay goods and their share in one go.
// Ops may correct it until the buyer opens the payment or a carrier is booked;
// after that the amount is in a Razorpay order or on a shipment and is fixed.
export async function setFreightQuote(transactionId: string, amount: number, actor: Actor) {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only CropBid ops quote delivery');
  if (!(amount > 0) || amount > MAX_FREIGHT_QUOTE) {
    throw new ApiError(400, `A delivery quote must be more than 0 and at most ${MAX_FREIGHT_QUOTE}`);
  }
  const quote = Math.round(amount * 100) / 100;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Transaction" WHERE "id" = ${transactionId} FOR UPDATE`;
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: { listing: { select: { cropName: true } }, shipment: { select: { id: true } } },
    });
    if (!transaction) throw new ApiError(404, 'Transaction not found');
    if (transaction.retailOrderId || !buyerPaysFreight(transaction.freightPaidBy)) {
      throw new ApiError(400, 'The seller pays all the delivery on this deal, so there is nothing to quote the buyer. Book it directly.');
    }
    if (transaction.paymentStatus !== 'AWAITING_PAYMENT') {
      throw new ApiError(409, 'The buyer has already paid, so the delivery quote is fixed.', 'FREIGHT_QUOTE_LOCKED');
    }
    if (transaction.razorpayOrderId || transaction.shipment) {
      throw new ApiError(409, 'The buyer has opened the payment or a carrier is booked, so the delivery quote is fixed.', 'FREIGHT_QUOTE_LOCKED');
    }
    await tx.transaction.update({
      where: { id: transactionId },
      data: { freightQuote: quote, freightQuotedAt: new Date() },
    });
    return { ...transaction, freightQuote: quote, previousQuote: transaction.freightQuote };
  });

  const shares = freightShares(updated.freightPaidBy, quote);
  const cropName = updated.listing.cropName;
  notifyFreightQuoted(updated.buyerId, 'BUYER', cropName, shares.buyer, buyerPayable(updated), updated.currency, updated.id).catch(() => {});
  notifyFreightQuoted(updated.farmerId, 'SELLER', cropName, shares.seller, null, updated.currency, updated.id).catch(() => {});

  return {
    transactionId: updated.id,
    freightPaidBy: updated.freightPaidBy,
    freightQuote: quote,
    previousQuote: updated.previousQuote,
    buyerShare: shares.buyer,
    sellerShare: shares.seller,
  };
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
  // Neither the notification nor the live event carries the place ops typed:
  // it can be either party's address, and the two sides see names only
  // (contactVisibility.ts), the same rule forShipmentViewer applies to reads.
  notifyShipmentUpdate(tx.farmerId, cropName, newStatus, null, shipmentId).catch(() => {});
  notifyShipmentUpdate(tx.buyerId, cropName, newStatus, null, shipmentId).catch(() => {});

  // Socket.io real-time push
  const io = getIO();
  if (io) {
    io.to(`user:${tx.farmerId}`).to(`user:${tx.buyerId}`).emit('shipment:status_update', {
      shipmentId,
      status: newStatus,
      trackingUpdate: { ...trackingUpdates[trackingUpdates.length - 1], location: null },
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
