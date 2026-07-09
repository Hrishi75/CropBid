// =============================================================================
// File Upload Middleware (Multer + Sharp)
// =============================================================================
// WHY MULTER?
// Express doesn't parse multipart/form-data (file uploads) by default.
// Multer is the standard middleware for handling file uploads in Express.
//
// WHY DISK STORAGE (NOT MEMORY)?
// Memory storage loads the entire file into RAM as a Buffer. With multiple
// concurrent uploads of 5MB images, you'd quickly exhaust server memory.
// Disk storage writes the file to a temp directory, then Sharp processes it.
//
// WHY SHARP?
// Raw phone photos are 3-8MB each. Sharp compresses + resizes them to ~50-200KB
// WebP format. That's 80-95% smaller — faster page loads, less storage.
//
// FLOW: Client → Multer (save raw to disk) → Sharp (resize/compress) → WebP
// =============================================================================

import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

// Ensure upload directories exist
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const LISTINGS_DIR = path.join(UPLOAD_DIR, 'listings');
const AVATARS_DIR = path.join(UPLOAD_DIR, 'avatars');

if (!fs.existsSync(LISTINGS_DIR)) {
  fs.mkdirSync(LISTINGS_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, LISTINGS_DIR);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename: timestamp-random.ext
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter — only allow images
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only JPEG, PNG, WebP, and AVIF images are allowed'));
  }
}

// Multer instance — max 5 files, 5MB each
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5,                   // Max 5 images per request
  },
});

// =============================================================================
// Sharp Post-Processing Middleware
// =============================================================================
// After Multer saves raw files to disk, this middleware:
// 1. Reads each uploaded file
// 2. Resizes to max 1200px wide (maintains aspect ratio)
// 3. Converts to WebP format (80% quality — best size/quality ratio)
// 4. Deletes the original raw file
// 5. Updates req.files with the new .webp paths
//
// WHY WebP?
// WebP is 25-35% smaller than JPEG at the same visual quality.
// All modern browsers support it (Chrome, Firefox, Safari, Edge).
// =============================================================================

export async function processImages(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return next();
    }

    const processedPaths: string[] = [];

    for (const file of req.files) {
      const webpFilename = file.filename.replace(/\.\w+$/, '.webp');
      const outputPath = path.join(LISTINGS_DIR, webpFilename);

      // Resize + convert to WebP
      await sharp(file.path)
        .resize(1200, 1200, {
          fit: 'inside',           // Don't crop, just fit within bounds
          withoutEnlargement: true, // Don't upscale small images
        })
        .webp({ quality: 80 })
        .toFile(outputPath);

      // Delete the original raw file (we only keep the WebP)
      fs.unlinkSync(file.path);

      // Store the URL path (not filesystem path) for the database
      processedPaths.push(`/uploads/listings/${webpFilename}`);
    }

    // Attach processed paths to request for the controller to use
    (req as any).processedImages = processedPaths;
    next();
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Avatar upload — single square profile photo
// =============================================================================
// Same Multer + Sharp pipeline as listings, but one file into its own folder,
// square-cropped small (avatars render as little circles everywhere).

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
});

export async function processAvatar(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.file) return next();

    const webpFilename = req.file.filename.replace(/\.\w+$/, '.webp');
    const outputPath = path.join(AVATARS_DIR, webpFilename);

    await sharp(req.file.path)
      .resize(512, 512, { fit: 'cover' }) // center-crop to a square
      .webp({ quality: 82 })
      .toFile(outputPath);

    fs.unlinkSync(req.file.path);

    (req as any).processedAvatar = `/uploads/avatars/${webpFilename}`;
    next();
  } catch (error) {
    next(error);
  }
}
