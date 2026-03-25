import { Request, Response, NextFunction } from 'express';
import * as logisticsService from '../services/logistics.service';

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// =============================================================================
// Partner discovery & quoting
// =============================================================================

// GET /api/logistics/partners/:transactionId
export async function getMatchingPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await logisticsService.getMatchingPartners(
      paramStr(req.params.transactionId),
      req.user!.userId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/logistics/quote
export async function getTransportQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { partnerId, distanceKm, weightKg } = req.body;
    const quote = await logisticsService.getTransportQuote(
      partnerId,
      Number(distanceKm),
      Number(weightKg)
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
    const shipment = await logisticsService.bookShipment(req.body, req.user!.userId);
    res.status(201).json(shipment);
  } catch (error) {
    next(error);
  }
}

// GET /api/logistics/shipment/:id
export async function getShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await logisticsService.getShipment(paramStr(req.params.id), req.user!.userId);
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// GET /api/logistics/transaction/:transactionId
export async function getShipmentByTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await logisticsService.getShipmentByTransaction(
      paramStr(req.params.transactionId),
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
    const { status, location, note } = req.body;
    const shipment = await logisticsService.updateShipmentStatus(
      paramStr(req.params.id),
      status,
      { location, note },
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
    const shipment = await logisticsService.updateDriverInfo(
      paramStr(req.params.id),
      req.body,
      req.user!.userId
    );
    res.json(shipment);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/shipment/:id/proof
export async function uploadProofOfDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await logisticsService.uploadProofOfDelivery(
      paramStr(req.params.id),
      req.body.imageUrl,
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
    const partner = await logisticsService.createPartner(req.body);
    res.status(201).json(partner);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/admin/partners/:id
export async function updatePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const partner = await logisticsService.updatePartner(paramStr(req.params.id), req.body);
    res.json(partner);
  } catch (error) {
    next(error);
  }
}

// PUT /api/logistics/admin/partners/:id/toggle
export async function togglePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const partner = await logisticsService.togglePartner(paramStr(req.params.id));
    res.json(partner);
  } catch (error) {
    next(error);
  }
}
