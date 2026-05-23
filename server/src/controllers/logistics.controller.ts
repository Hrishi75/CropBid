import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as logisticsService from '../services/logistics.service';

const uuid = z.string().uuid();

const quoteSchema = z.object({
  partnerId: uuid,
  distanceKm: z.number().positive().max(50000),
  weightKg: z.number().positive().max(1_000_000),
});

const bookSchema = z.object({
  transactionId: uuid,
  logisticsPartnerId: uuid,
  pickupLocation: z.string().min(1).max(500),
  deliveryLocation: z.string().min(1).max(500),
  pickupDate: z.string().datetime(),
  distanceKm: z.number().positive().max(50000),
  totalWeightKg: z.number().positive().max(1_000_000),
  vehicleType: z.string().min(1).max(100),
  paidBy: z.enum(['BUYER', 'FARMER', 'SPLIT']),
  splitPercentBuyer: z.number().min(0).max(100).optional(),
});

const shipmentStatusSchema = z.object({
  status: z.enum([
    'PENDING_PICKUP',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
  ]),
  location: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
});

const driverInfoSchema = z.object({
  driverName: z.string().min(1).max(200).optional(),
  driverPhone: z.string().min(1).max(50).optional(),
  vehicleNumber: z.string().min(1).max(50).optional(),
}).refine((d) => d.driverName || d.driverPhone || d.vehicleNumber, {
  message: 'At least one driver field is required',
});

const proofSchema = z.object({
  imageUrl: z.string().url().max(2000),
});

const partnerSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['TRUCKING', 'COLD_CHAIN', 'LOCAL', 'FREIGHT', 'EXPORT']),
  coverageRegions: z.array(z.string().min(1).max(100)).max(200),
  coverageCountries: z.array(z.string().min(1).max(100)).max(200),
  vehicleTypes: z.array(z.string().min(1).max(100)).max(50),
  minQuantityKg: z.number().nonnegative(),
  maxQuantityKg: z.number().positive(),
  costPerKmPerKg: z.number().nonnegative(),
  avgDeliveryDays: z.number().int().min(0).max(365),
  rating: z.number().min(0).max(5).optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1).max(50),
  apiEndpoint: z.string().url().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

const idParamSchema = z.object({ id: uuid });
const transactionIdParamSchema = z.object({ transactionId: uuid });

function bad(res: Response, msg: string) {
  return res.status(400).json({ message: msg });
}

function parseOr<T extends z.ZodTypeAny>(
  res: Response,
  schema: T,
  input: unknown
): z.infer<T> | null {
  const r = schema.safeParse(input);
  if (!r.success) {
    bad(res, r.error.issues[0]?.message || 'Invalid input');
    return null;
  }
  return r.data;
}

// =============================================================================
// Partner discovery & quoting
// =============================================================================

// GET /api/logistics/partners/:transactionId
export async function getMatchingPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, transactionIdParamSchema, req.params);
    if (!params) return;
    const result = await logisticsService.getMatchingPartners(params.transactionId, req.user!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/logistics/quote
export async function getTransportQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOr(res, quoteSchema, req.body);
    if (!body) return;
    const quote = await logisticsService.getTransportQuote(
      body.partnerId,
      body.distanceKm,
      body.weightKg
    );
    res.json(quote);
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Shipment lifecycle
// =============================================================================

// POST /api/logistics/book
export async function bookShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOr(res, bookSchema, req.body);
    if (!body) return;
    const shipment = await logisticsService.bookShipment(body, req.user!.userId);
    res.status(201).json(shipment);
  } catch (error) {
    next(error);
  }
}

// GET /api/logistics/shipment/:id
export async function getShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const shipment = await logisticsService.getShipment(params.id, req.user!.userId);
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// GET /api/logistics/transaction/:transactionId
export async function getShipmentByTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, transactionIdParamSchema, req.params);
    if (!params) return;
    const shipment = await logisticsService.getShipmentByTransaction(
      params.transactionId,
      req.user!.userId
    );
    res.json(shipment || { shipment: null });
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/shipment/:id/status
export async function updateShipmentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const body = parseOr(res, shipmentStatusSchema, req.body);
    if (!body) return;
    const shipment = await logisticsService.updateShipmentStatus(
      params.id,
      body.status,
      { location: body.location ?? '', note: body.note ?? '' },
      req.user!.userId
    );
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/shipment/:id/driver
export async function updateDriverInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const body = parseOr(res, driverInfoSchema, req.body);
    if (!body) return;
    const shipment = await logisticsService.updateDriverInfo(params.id, body, req.user!.userId);
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/shipment/:id/proof
export async function uploadProofOfDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const body = parseOr(res, proofSchema, req.body);
    if (!body) return;
    const shipment = await logisticsService.uploadProofOfDelivery(
      params.id,
      body.imageUrl,
      req.user!.userId
    );
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Admin: Partner management
// =============================================================================

// GET /api/logistics/admin/partners
export async function getAllPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const partners = await logisticsService.getAllPartners({
      type: req.query.type as string,
      active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
    });
    res.json(partners);
  } catch (error) {
    next(error);
  }
}

// POST /api/logistics/admin/partners
export async function createPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOr(res, partnerSchema, req.body);
    if (!body) return;
    const partner = await logisticsService.createPartner(body);
    res.status(201).json(partner);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/admin/partners/:id
export async function updatePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const body = parseOr(res, partnerSchema.partial(), req.body);
    if (!body) return;
    const partner = await logisticsService.updatePartner(params.id, body);
    res.json(partner);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/admin/partners/:id/toggle
export async function togglePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const params = parseOr(res, idParamSchema, req.params);
    if (!params) return;
    const partner = await logisticsService.togglePartner(params.id);
    res.json(partner);
  } catch (error) {
    next(error);
  }
}
