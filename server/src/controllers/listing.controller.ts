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
import * as listingService from '../services/listing.service';

// Express 5 types params as string | string[]. Our routes use single :id params.
function paramId(req: Request): string {
  return req.params.id as string;
}

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
    const listing = await listingService.updateListing(
      paramId(req),
      req.user!.userId,
      req.body
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
