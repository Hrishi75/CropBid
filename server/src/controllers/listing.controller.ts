// =============================================================================
// Listing Controller — HTTP Layer
// =============================================================================
// Controllers handle HTTP-specific concerns:
//   - Extract data from req.body, req.params, req.query
//   - Call the appropriate service function
//   - Set the HTTP status code
//   - Send the JSON response
//
// They should NOT contain business logic. That lives in the service.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as listingService from '../services/listing.service';

// Express 5 types params as string | string[]. Our routes use single :id params.
function paramId(req: Request): string {
  return req.params.id as string;
}

// Whitelist of farmer-editable fields. NOTE: `status` is intentionally absent —
// listing status is driven by the bid/auction/expiry flows, never set directly
// by the client (that would let a farmer bypass the sale state machine). Unknown
// keys (including a smuggled `status`) are stripped by zod before reaching the
// service. Numbers are coerced so a JSON or multipart body both validate.
const updateListingSchema = z.object({
  cropName: z.string().min(1).max(200).optional(),
  cropVariety: z.string().max(200).optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().max(20).optional(),
  qualityGrade: z.string().max(50).optional(),
  pricePerUnitMin: z.coerce.number().positive().optional(),
  pricePerUnitMax: z.coerce.number().positive().optional(),
  currency: z.string().max(10).optional(),
  harvestDate: z.string().optional(),
  expiryDate: z.string().optional(),
  description: z.string().max(2000).optional(),
  images: z.array(z.string()).optional(),
  labReportUrl: z.string().optional(),
  organic: z.coerce.boolean().optional(),
  location: z.string().min(1).max(200).optional(),
  country: z.string().max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  directSaleEnabled: z.coerce.boolean().optional(),
  retailPricePerUnit: z.coerce.number().positive().optional(),
});

// POST /api/listings — Create a new listing
export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    // Images may have been processed by the upload middleware
    const images = (req as any).processedImages || [];

    // Multer sends form fields as strings — parse numeric fields
    const body = req.body;
    const listing = await listingService.createListing(req.user!.userId, {
      ...body,
      quantity: parseFloat(body.quantity),
      pricePerUnitMin: parseFloat(body.pricePerUnitMin),
      pricePerUnitMax: parseFloat(body.pricePerUnitMax),
      organic: body.organic === 'true',
      directSaleEnabled: body.directSaleEnabled === 'true' || body.directSaleEnabled === true,
      retailPricePerUnit: body.retailPricePerUnit ? parseFloat(body.retailPricePerUnit) : undefined,
      images,
    });

    res.status(201).json(listing);
  } catch (error) {
    next(error);
  }
}

// GET /api/listings — Get all listings (paginated)
export async function getListings(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listingService.getListings({
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
      status: req.query.status as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/listings/my — Get current farmer's listings
export async function getMyListings(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listingService.getMyListings(req.user!.userId, {
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
      status: req.query.status as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/listings/:id — Get a single listing
export async function getListingById(req: Request, res: Response, next: NextFunction) {
  try {
    const listing = await listingService.getListingById(paramId(req));
    res.json(listing);
  } catch (error) {
    next(error);
  }
}

// PUT /api/listings/:id — Update a listing
export async function updateListing(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateListingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const listing = await listingService.updateListing(
      paramId(req),
      req.user!.userId,
      parsed.data
    );
    res.json(listing);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/listings/:id — Delete a listing
export async function deleteListing(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listingService.deleteListing(paramId(req), req.user!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/listings/:id/images — Upload images to a listing
export async function uploadImages(req: Request, res: Response, next: NextFunction) {
  try {
    const images = (req as any).processedImages || [];

    if (images.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    const listing = await listingService.addImages(
      paramId(req),
      req.user!.userId,
      images
    );

    res.json({ images: listing.images });
  } catch (error) {
    next(error);
  }
}
