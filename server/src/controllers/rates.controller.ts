// =============================================================================
// Rates Controller — HTTP Layer
// =============================================================================
// Public (no auth) live mandi rates for the storefront:
//   GET /api/rates/board        → today's rates for the curated crop board
//   GET /api/rates/all?state=   → every commodity the feed reported (/rates)
//   GET /api/rates?crop=&state=&market=  → single-crop anchor (fallback chain)
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as ratesService from '../services/rates.service';
import * as predictionService from '../services/prediction.service';

// How long a browser may keep an answer. Live rates are kept five minutes and
// then revalidated against the ETag, which costs a 304 when nothing moved.
// Reference prices are never kept: they are what a visitor gets while the
// server is still loading the day's feed (a restart, a deploy), and caching
// them for half an hour, as this used to, meant someone who opened the site
// at that moment kept seeing them long after live rates were back.
function cacheFor(res: Response, live: boolean) {
  res.set('Cache-Control', live ? 'public, max-age=300' : 'no-store');
}

// GET /api/rates/board — whole board of today's rates
export async function getBoard(req: Request, res: Response, next: NextFunction) {
  try {
    const state = (req.query.state as string) || undefined;
    const data = await ratesService.getBoard(state);
    cacheFor(res, data.live);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// GET /api/rates/all?state=Maharashtra: every commodity the mandi feed
// reported, grouped, for the full /rates page. The board stays 30 crops,
// because the storefront strip and the app are built around that many.
export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const state = (req.query.state as string) || undefined;
    const data = await ratesService.getAllRates(state);
    cacheFor(res, data.live);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// GET /api/rates/predictions — demand & supply forecast for every commodity on /rates.
// Deterministic model over today's feed + seasonality + platform activity;
// see prediction.service.ts for the model and its weights.
export async function getPredictions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await predictionService.getForecastBoard();
    cacheFor(res, data.live);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// GET /api/rates/markets?crop=Tomato&state=Maharashtra — every reporting mandi
// for one crop today: market, district, state, variety, grade, price band.
export async function getMarkets(req: Request, res: Response, next: NextFunction) {
  try {
    const crop = req.query.crop as string;
    if (!crop) {
      return res.status(400).json({ error: 'crop query param is required' });
    }
    const data = await ratesService.getMarketBreakdown(
      crop,
      (req.query.state as string) || undefined
    );
    if (!data) {
      return res.status(404).json({ error: 'No rate available for this crop' });
    }
    // No mandi rows means no copy of the feed yet, not a crop nobody sells.
    cacheFor(res, data.count > 0);
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
    cacheFor(res, rate.source !== 'reference');
    res.json(rate);
  } catch (error) {
    next(error);
  }
}
