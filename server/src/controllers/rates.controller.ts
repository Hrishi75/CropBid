// =============================================================================
// Rates Controller — HTTP Layer
// =============================================================================
// Public (no auth) live mandi rates for the storefront:
//   GET /api/rates/board        → today's rates for the curated crop board
//   GET /api/rates?crop=&state=&market=  → single-crop anchor (fallback chain)
// Sets a short public cache header — rates change at most once a day and are
// non-sensitive, so the CDN/browser can cache them.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as ratesService from '../services/rates.service';

// GET /api/rates/board — whole board of today's rates
export async function getBoard(req: Request, res: Response, next: NextFunction) {
  try {
    const state = (req.query.state as string) || undefined;
    const data = await ratesService.getBoard(state);
    res.set('Cache-Control', 'public, max-age=1800'); // 30 min
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// GET /api/rates?crop=Tomato&state=Maharashtra&market=Nashik — one crop's anchor
export async function getRate(req: Request, res: Response, next: NextFunction) {
  try {
    const crop = req.query.crop as string;
    if (!crop) {
      return res.status(400).json({ error: 'crop query param is required' });
    }
    const rate = await ratesService.getRateForCrop(crop, {
      state: (req.query.state as string) || undefined,
      market: (req.query.market as string) || undefined,
    });
    if (!rate) {
      return res.status(404).json({ error: 'No rate available for this crop' });
    }
    res.set('Cache-Control', 'public, max-age=1800');
    res.json(rate);
  } catch (error) {
    next(error);
  }
}
