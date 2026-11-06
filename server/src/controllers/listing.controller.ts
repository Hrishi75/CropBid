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
import { queueListingTranslation } from '../services/translation.service';
import { FREIGHT_PAYERS } from '../utils/freight';

// Express 5 types params as string | string[]. Our routes use single :id params.
function paramId(req: Request): string {
  return req.params.id as string;
}

// -----------------------------------------------------------------------------
// What a listing may contain, on create and on edit alike
// -----------------------------------------------------------------------------
// Create used to have no schema at all: it parseFloat'd the numbers and passed
// the rest through, so "-5", "abc" and "Infinity" were stored as a negative
// quantity, NaN and Infinity (Postgres floats accept all three, so nothing
// refused them), and a bad unit, grade, currency or date reached Prisma and
// came back as a 500. Both routes now share one set of rules.
//
// `status` is absent on purpose: it is driven by the bid, auction and expiry
// flows, never set by the client. Unknown keys (a smuggled `status`,
// `isRequirementFill`, `farmerId`) are stripped by zod before the service.
// `images` is absent too: photos are only ever files through the upload
// middleware, so an edit cannot point a lot's pictures at any URL it likes.

// Prices and quantities: finite, above zero, and below a ceiling no real lot
// reaches, so a slipped key cannot list a lot at a billion rupees a kilo.
export const LISTING_NUMBER_MAX = 1_000_000_000;

function positiveNumber(label: string) {
  return z.coerce
    .number({ error: `${label} must be a number` })
    .refine(Number.isFinite, `${label} must be a number`)
    .refine((n) => n > 0, `${label} must be more than zero`)
    .refine((n) => n <= LISTING_NUMBER_MAX, `${label} is too large`);
}

// Multipart sends every field as text, and z.coerce.boolean() reads the string
// "false" as true. So read the words, and refuse anything else.
const formBoolean = z.preprocess((v) => {
  if (v === true || v === 'true' || v === '1' || v === 'on') return true;
  if (v === false || v === 'false' || v === '0' || v === '') return false;
  return v;
}, z.boolean({ error: 'Expected true or false' }));

// An enum typed in any case ("quintal" or "QUINTAL").
function upperEnum<T extends readonly [string, ...string[]]>(values: T, label: string) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.enum(values, { error: `${label} must be one of ${values.join(', ')}` }),
  );
}

// A date, or blank for none. Trimmed, so "  " is blank rather than an
// invalid date reaching the service. A calendar date must exist: Date.parse
// rolls 2026-02-31 over to 3 March, so the day is checked against its month.
export function isRealDate(s: string): boolean {
  if (Number.isNaN(Date.parse(s))) return false;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!ymd) return true;
  const [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

const optionalDate = z
  .string()
  .trim()
  .max(40)
  .refine((s) => s === '' || isRealDate(s), 'Enter a valid date');

// A blank number field from a form means "not given".
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// The lab report is a link a buyer would open, so only https.
const labReportUrl = z
  .string()
  .trim()
  .max(500)
  .refine((s) => {
    if (s === '') return true;
    try {
      return new URL(s).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'The lab report must be an https link');

export const createListingSchema = z.object({
  cropName: z.string().trim().min(1, 'Enter the crop name').max(200),
  cropVariety: z.string().trim().max(200).optional(),
  quantity: positiveNumber('Quantity'),
  unit: upperEnum(['KG', 'QUINTAL', 'TONNE'] as const, 'Unit').optional(),
  qualityGrade: upperEnum(['A', 'B', 'C'] as const, 'Quality grade'),
  pricePerUnitMin: positiveNumber('The lowest price'),
  pricePerUnitMax: positiveNumber('The highest price'),
  currency: upperEnum(['INR', 'USD', 'EUR', 'GBP'] as const, 'Currency').optional(),
  harvestDate: optionalDate.optional(),
  expiryDate: optionalDate.optional(),
  description: z.string().max(2000).optional(),
  labReportUrl: labReportUrl.optional(),
  organic: formBoolean.optional(),
  location: z.string().trim().min(1, 'Enter the town').max(200),
  country: z.string().trim().max(100).optional(),
  state: z.string().trim().min(1, 'Enter the state').max(100),
  directSaleEnabled: formBoolean.optional(),
  retailPricePerUnit: z.preprocess(blankToUndefined, positiveNumber('The retail price').optional()),
  freightPaidBy: z.enum(FREIGHT_PAYERS).optional(),
});

export const updateListingSchema = createListingSchema.partial();

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid input';
}

// POST /api/listings — Create a new listing
export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    // Images may have been processed by the upload middleware
    const images = (req as any).processedImages || [];

    // Multer sends form fields as strings; the schema coerces them.
    const parsed = createListingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: firstIssue(parsed.error) });
    }
    const listing = await listingService.createListing(req.user!.userId, {
      ...parsed.data,
      images,
    });

    res.status(201).json(listing);

    // Translate the description in the background, AFTER the farmer has their
    // response. Deliberately not awaited and deliberately after res.json():
    // publishing a listing must never wait on, or fail because of, a
    // translation API. Returns void — see services/translation.service.ts.
    queueListingTranslation(listing.id);
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
      return res.status(400).json({ message: firstIssue(parsed.error) });
    }
    const listing = await listingService.updateListing(
      paramId(req),
      req.user!.userId,
      parsed.data
    );
    res.json(listing);

    // Only when the text actually changed. The service has already cleared the
    // stale translations in the same write, so the listing reads as the new
    // original until these land.
    if (parsed.data.description !== undefined) {
      queueListingTranslation(listing.id);
    }
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
