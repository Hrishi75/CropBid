// =============================================================================
// Agri-Input Controller — HTTP Layer
// =============================================================================
// Parses and validates the request, delegates to agriInput.service, sends JSON.
// No business logic here — both rules that govern this surface (the licence
// gate and the contact-disclosure rule) live in the service, so every caller is
// bound by them.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as agriInputService from '../services/agriInput.service';

function paramId(req: Request): string {
  return req.params.id as string;
}

// packQuantity and acres are both optional and both advisory — the shop
// confirms stock and sizing on the call. Bounded anyway so a typo can't write
// "50000 acres" into a lead the supplier then has to sanity-check by phone.
const enquirySchema = z.object({
  packQuantity: z.number().int().positive().max(10000).optional(),
  acres: z.number().positive().max(10000).optional(),
  message: z.string().max(1000).optional(),
});

// GET /api/agri-inputs — Browse the catalogue (public)
export async function getAgriInputs(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await agriInputService.browseAgriInputs({
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      category: req.query.category as string,
      crop: req.query.crop as string,
      state: req.query.state as string,
      q: req.query.q as string,
      maxPrice: Number(req.query.maxPrice) || undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/agri-inputs/meta — Categories with live counts, crops, states in stock
export async function getMeta(req: Request, res: Response, next: NextFunction) {
  try {
    const meta = await agriInputService.getAgriInputMeta();
    // Short cache: counts shift as suppliers add stock, but not by the second.
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.json(meta);
  } catch (error) {
    next(error);
  }
}

// GET /api/agri-inputs/enquiries/my — The caller's own leads (auth)
export async function getMyEnquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await agriInputService.getMyEnquiries(req.user!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/agri-inputs/:id — One product (public, no supplier phone)
export async function getAgriInputById(req: Request, res: Response, next: NextFunction) {
  try {
    const input = await agriInputService.getAgriInputById(paramId(req));
    res.json(input);
  } catch (error) {
    next(error);
  }
}

// POST /api/agri-inputs/:id/enquiry — Raise a lead; response carries the number
export async function createEnquiry(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = enquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const result = await agriInputService.createEnquiry(
      paramId(req),
      req.user!.userId,
      parsed.data
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
