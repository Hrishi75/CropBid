// =============================================================================
// Listing Routes
// =============================================================================
// ROUTE DESIGN:
//   POST   /api/listings            → Create listing (FARMER only, with images)
//   GET    /api/listings            → Browse all active listings (public)
//   GET    /api/listings/my         → Farmer's own listings (FARMER only)
//   GET    /api/listings/:id        → Single listing detail (public)
//   PUT    /api/listings/:id        → Edit listing (owner FARMER only)
//   DELETE /api/listings/:id        → Delete listing (owner FARMER only)
//   POST   /api/listings/:id/images → Upload images (owner FARMER only)
//
// WHY IS /my BEFORE /:id?
// Express matches routes top-to-bottom. If /:id came first, the string "my"
// would be treated as an id parameter. By placing /my first, Express matches
// it as a literal path before falling through to the dynamic :id route.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requireApprovedPartner } from '../middleware/roleGuard';
import { upload, processImages } from '../middleware/upload';
import * as listingController from '../controllers/listing.controller';

const router = Router();

// Create listing — with optional image upload in the same request
// upload.array('images', 5) tells Multer to accept up to 5 files
// from a form field named "images"
router.post(
  '/',
  authenticate,
  requireRole('FARMER'), requireApprovedPartner,
  upload.array('images', 5),
  processImages,
  listingController.createListing
);

// Farmer's own listings (must come BEFORE /:id)
router.get(
  '/my',
  authenticate,
  requireRole('FARMER'), requireApprovedPartner,
  listingController.getMyListings
);

// Browse all listings — public, no auth needed
// Buyers, visitors, even unauthenticated users can browse
router.get('/', listingController.getListings);

// Single listing detail — public
router.get('/:id', listingController.getListingById);

// Edit listing — only the owning farmer
router.put(
  '/:id',
  authenticate,
  requireRole('FARMER'), requireApprovedPartner,
  listingController.updateListing
);

// Delete listing — only the owning farmer
router.delete(
  '/:id',
  authenticate,
  requireRole('FARMER'), requireApprovedPartner,
  listingController.deleteListing
);

// Upload additional images to an existing listing
router.post(
  '/:id/images',
  authenticate,
  requireRole('FARMER'), requireApprovedPartner,
  upload.array('images', 5),
  processImages,
  listingController.uploadImages
);

export default router;
