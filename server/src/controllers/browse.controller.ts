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
      location: req.query.location as string,
      country: req.query.country as string,
      priceMin: req.query.priceMin ? Number(req.query.priceMin) : undefined,
      priceMax: req.query.priceMax ? Number(req.query.priceMax) : undefined,
      quality: req.query.quality as string,
      organic: req.query.organic === 'true' ? true : req.query.organic === 'false' ? false : undefined,
      search: req.query.search as string,
      directSale: req.query.directSale === 'true',
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

// GET /api/browse/cities — cities with live retail stock (consumer city picker)
export async function getRetailCities(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await browseService.getRetailCities());
  } catch (error) {
    next(error);
  }
}

// GET /api/browse/shops?city=Nashik — the shops holding retail stock in a city
export async function getRetailShops(req: Request, res: Response, next: NextFunction) {
  try {
    const city = (req.query.city as string ?? '').trim();
    // Without a city this would return every shop in the country, which is not
    // a storefront — retail is a local channel by construction.
    if (!city) {
      res.status(400).json({ error: true, message: 'Pick a city first', statusCode: 400 });
      return;
    }
    // Where the shopper is, when they have shared it. Both or neither: half a
    // coordinate is not a position, and treating a lone latitude as one would
    // put every shop on the same meridian as the shopper.
    //
    // Silently ignored when malformed rather than rejected. A bad reading from
    // a phone's GPS should widen the results to the whole city, not refuse to
    // show a storefront.
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasPosition =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    res.json({
      shops: await browseService.listRetailShops({
        city,
        ...(hasPosition ? { latitude: lat, longitude: lng } : {}),
      }),
      /**
       * Whether the list was narrowed to shops that can actually reach them.
       * The app needs to tell "no shop delivers to you" apart from "no shop has
       * stock in this city", and those are different sentences.
       */
      locatedBy: hasPosition ? 'coordinates' : 'city',
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/browse/shops/:id?city=Nashik — one shop and what is on its shelf
export async function getRetailShop(req: Request, res: Response, next: NextFunction) {
  try {
    const city = (req.query.city as string ?? '').trim();
    const result = await browseService.getRetailShop(req.params.id as string, city);
    // Same answer for "no such shop" and "that shop is in another city": a
    // shared link must not become a way to order across cities, and the
    // distinction is of no use to the shopper either way.
    if (!result) {
      res.status(404).json({ error: true, message: 'Shop not found', statusCode: 404 });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}


// GET /api/browse/serviceability?lat=&lng= — can we reach this point, and how
//
// Public and unauthenticated: this is the question a stranger asks before they
// have any reason to make an account.
export async function getServiceability(req: Request, res: Response, next: NextFunction) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    // Rejected rather than ignored here, unlike on the shop list. There the
    // fallback is a wider search; here the coordinates ARE the question, and
    // answering "not serviceable" to a malformed one would be a lie.
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      res.status(400).json({ error: true, message: 'Send a valid lat and lng', statusCode: 400 });
      return;
    }

    res.json(await browseService.checkServiceability({ latitude: lat, longitude: lng }));
  } catch (error) {
    next(error);
  }
}

// POST /api/browse/coverage-request — "come to my area"
//
// Public: a shopper outside the delivery area has no account and no reason to
// make one, and putting a sign-up in front of this would lose the signal it
// exists to capture.
export async function postCoverageRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { latitude, longitude, areaLabel, phone } = req.body ?? {};
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      res.status(400).json({ error: true, message: 'Send a valid latitude and longitude', statusCode: 400 });
      return;
    }

    const request = await browseService.recordCoverageRequest({
      latitude: lat,
      longitude: lng,
      areaLabel: typeof areaLabel === 'string' ? areaLabel.slice(0, 200) : null,
      phone: typeof phone === 'string' ? phone.slice(0, 20) : null,
      // Attached when a signed-in shopper asks, absent otherwise. This route is
      // not behind `authenticate`, so req.user is only set when an upstream
      // optional-auth middleware has run; either way the row is valid.
      userId: req.user?.userId ?? null,
    });

    res.status(201).json({ id: request.id });
  } catch (error) {
    next(error);
  }
}
