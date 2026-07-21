// =============================================================================
// Equipment Controller — HTTP Layer
// =============================================================================
// Parses and validates the request, delegates to equipment.service, sends JSON.
// No business logic here — the contact-disclosure rule that governs this
// surface lives in the service, so every caller is bound by it.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as equipmentService from '../services/equipment.service';

function paramId(req: Request): string {
  return req.params.id as string;
}

const enquirySchema = z.object({
  intent: z.enum(['SALE', 'RENT']),
  message: z.string().max(1000).optional(),
  rentFrom: z.string().optional(),
  rentTo: z.string().optional(),
});

// GET /api/equipment — Browse the catalogue (public)
export async function getEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await equipmentService.browseEquipment({
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      category: req.query.category as string,
      mode: req.query.mode as string,
      state: req.query.state as string,
      q: req.query.q as string,
      maxPrice: Number(req.query.maxPrice) || undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/equipment/meta — Categories with live counts + states in stock
export async function getMeta(req: Request, res: Response, next: NextFunction) {
  try {
    const meta = await equipmentService.getEquipmentMeta();
    // Short cache: counts shift as dealers add stock, but not by the second.
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.json(meta);
  } catch (error) {
    next(error);
  }
}

// GET /api/equipment/enquiries/my — The caller's own leads (auth)
export async function getMyEnquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await equipmentService.getMyEnquiries(req.user!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/equipment/:id — One machine (public, no dealer phone)
export async function getEquipmentById(req: Request, res: Response, next: NextFunction) {
  try {
    const equipment = await equipmentService.getEquipmentById(paramId(req));
    res.json(equipment);
  } catch (error) {
    next(error);
  }
}

// POST /api/equipment/:id/enquiry — Raise a lead; response carries the dealer's number
export async function createEnquiry(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = enquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const result = await equipmentService.createEnquiry(
      paramId(req),
      req.user!.userId,
      parsed.data
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
