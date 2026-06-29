// =============================================================================
// Browse Controller — HTTP Layer
// =============================================================================
// HTTP wrappers for the buyer marketplace: browse listings with filters
// (crop/state/price/quality/organic/search + pagination/sort) and smart-match.
// Parses query params, delegates to browse.service, returns JSON.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as browseService from '../services/browse.service';

// GET /api/browse — Browse listings with filters
export async function browseListings(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await browseService.browseListings({
      crop: req.query.crop as string,
      crops: req.query.crops
        ? (Array.isArray(req.query.crops)
            ? (req.query.crops as string[])
            : (req.query.crops as string).split(','))
            .filter(Boolean)
        : undefined,
      state: req.query.state as string,
      country: req.query.country as string,
      priceMin: req.query.priceMin ? Number(req.query.priceMin) : undefined,
      priceMax: req.query.priceMax ? Number(req.query.priceMax) : undefined,
      quality: req.query.quality as string,
      organic: req.query.organic === 'true' ? true : req.query.organic === 'false' ? false : undefined,
      search: req.query.search as string,
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/browse/smart-match — AI-free smart matching
export async function smartMatch(req: Request, res: Response, next: NextFunction) {
  try {
    // Build context from the buyer's profile or query params
    const preferredCrops = req.query.crops
      ? (req.query.crops as string).split(',')
      : [];

    const results = await browseService.smartMatch({
      preferredCrops,
      buyerState: req.query.state as string,
      buyerCountry: req.query.country as string,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    }, Number(req.query.limit) || 10);

    res.json(results);
  } catch (error) {
    next(error);
  }
}

// GET /api/browse/filters — Available filter options
export async function getFilters(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = await browseService.getAvailableFilters();
    res.json(filters);
  } catch (error) {
    next(error);
  }
}
