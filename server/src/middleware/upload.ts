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
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { detectImageFormatAtPath } from '../utils/imageSignature';
import { removeImage, storeImage } from '../services/imageStorage';

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
// Raw uploads land in a directory that IS publicly served (see app.ts:
// app.use('/uploads', express.static(...))). So the on-disk name must not carry
// a client-chosen extension: `path.extname(file.originalname)` would let someone
// upload "x.html", have it briefly exist at a fetchable URL, and be served as
// text/html. A fixed ".bin" resolves to application/octet-stream instead, which
// browsers download rather than execute. Sharp sniffs content and does not care
// about the extension, and these raw files are deleted either way.
const RAW_EXT = '.bin';

function rawFilename(): string {
  return `${Date.now()}-${randomUUID()}${RAW_EXT}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, LISTINGS_DIR);
  },
  filename: (_req, _file, cb) => {
    cb(null, rawFilename());
  },
});

// File filter — first, cheap gate only.
//
// `file.mimetype` is the client's claim from the multipart Content-Type header,
// not a fact about the bytes, so passing this proves nothing. It is kept because
// it rejects honest mistakes (a PDF picked by accident) before anything is
// written to disk — multer cannot see file content at filter time. The check
// that actually matters is the magic-byte one in the processing middleware.
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

// Best-effort removal of a raw upload. Used on every exit path, so it must never
// throw — a cleanup failure must not mask the real error being propagated.
function discardRaw(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone, or never written. Nothing to do.
  }
}

// Rejects anything whose bytes are not one of the four formats we accept, before
// sharp/libvips parses it. See utils/imageSignature.ts for why the MIME header
// is not sufficient.
function assertRealImage(filePath: string): void {
  if (detectImageFormatAtPath(filePath) === null) {
    throw new ApiError(400, 'Only JPEG, PNG, WebP, and AVIF images are allowed');
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
// 5. Hands the WebP to imageStorage (Cloudinary or local disk) and
//    updates req with the stored URLs/paths
//
// WHY WebP?
// WebP is 25-35% smaller than JPEG at the same visual quality.
// All modern browsers support it (Chrome, Firefox, Safari, Edge).
// =============================================================================

export async function processImages(req: Request, res: Response, next: NextFunction) {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return next();
  }

  const files = req.files;
  const processedPaths: string[] = [];

  try {
    for (const file of files) {
      const webpFilename = file.filename.replace(/\.\w+$/, '.webp');

      // Content check before libvips touches the bytes.
      assertRealImage(file.path);

      // Resize + convert to WebP
      const buffer = await sharp(file.path)
        .resize(1200, 1200, {
          fit: 'inside',           // Don't crop, just fit within bounds
          withoutEnlargement: true, // Don't upscale small images
        })
        .webp({ quality: 80 })
        .toBuffer();

      processedPaths.push(await storeImage(buffer, 'listings', webpFilename));
    }

    // Attach processed paths to request for the controller to use
    (req as any).processedImages = processedPaths;

    // Arm a rollback for failures DOWNSTREAM of here.
    //
    // Once next() is called this middleware is done, so its catch block can no
    // longer help: if the controller then rejects the request — unknown listing,
    // not the owner, already at the image cap — the images are stored but
    // nothing references them. Hooking 'finish' catches every such path at once
    // instead of duplicating cleanup in each controller error branch, and keys
    // the decision off the only thing that reliably says whether the request
    // succeeded: the status code actually sent.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        void Promise.allSettled(processedPaths.map((url) => removeImage(url)));
      }
    });

    next();
  } catch (error) {
    // Roll back images already stored for THIS request.
    //
    // storeImage persists as it goes, so in a five-file upload where the third
    // fails, the first two WebPs are already in Cloudinary (or on local disk).
    // The error skips the controller, so no listing is ever created to
    // reference them — they become orphans that nothing will ever clean up, and
    // repeating a [valid, invalid] pair leaks storage indefinitely.
    //
    // Failures here are swallowed deliberately: a rollback that throws must not
    // replace the real error the client needs to see.
    await Promise.allSettled(processedPaths.map((url) => removeImage(url)));
    next(error);
  } finally {
    // EVERY raw file goes, on success and on failure alike.
    //
    // Previously the unlink sat inside the loop after a successful sharp call,
    // so a throw on the first of five files left all five on disk — and these
    // land in a publicly served directory. Any logged-in user could repeat that
    // to consume 25 MB per request until the 20 GB disk filled, which is a
    // denial of service needing nothing but an account. A finally block cannot
    // be skipped by an early return or a throw, so the cleanup is now
    // structural rather than dependent on the happy path being taken.
    for (const file of files) discardRaw(file.path);
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
  filename: (_req, _file, cb) => {
    cb(null, rawFilename());
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
  if (!req.file) return next();

  const rawPath = req.file.path;

  try {
    const webpFilename = req.file.filename.replace(/\.\w+$/, '.webp');

    // Content check before libvips touches the bytes.
    assertRealImage(rawPath);

    const buffer = await sharp(rawPath)
      .resize(512, 512, { fit: 'cover' }) // center-crop to a square
      .webp({ quality: 82 })
      .toBuffer();

    (req as any).processedAvatar = await storeImage(buffer, 'avatars', webpFilename);
    next();
  } catch (error) {
    next(error);
  } finally {
    // Same guarantee as processImages: the raw file never survives this
    // middleware, whichever way it exits. This path already cleaned up on
    // error; moving it to `finally` means success and failure share one rule
    // instead of two that can drift apart.
    discardRaw(rawPath);
  }
}
