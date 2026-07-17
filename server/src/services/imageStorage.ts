// =============================================================================
// Image storage — Cloudinary in production, local disk in development
// =============================================================================
// The upload middleware (middleware/upload.ts) compresses every image to WebP
// and hands the buffer here. Where it lands depends on one env var:
//
//   CLOUDINARY_URL set   → uploaded to Cloudinary, absolute https URL stored
//   CLOUDINARY_URL unset → written under server/uploads/, relative path stored
//                          (served by express.static — fine for local dev)
//
// WHY CLOUDINARY?
// Render's free-tier filesystem is ephemeral: every deploy/restart wipes
// uploads/, so user images vanished. Cloudinary persists them and serves
// them from a CDN. Both clients already handle absolute URLs (mobile's
// mediaUrl() passes http(s) through; the web client uses the value as <img src>).
// =============================================================================

import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

export const cloudinaryEnabled = Boolean(config.cloudinaryUrl);

if (cloudinaryEnabled) {
  // The SDK reads CLOUDINARY_URL from the environment on its own; this call
  // just forces https URLs in upload results.
  cloudinary.config({ secure: true });
}

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

export type ImageKind = 'listings' | 'avatars';

// Store a processed WebP buffer. Returns the string to persist in the DB:
// an absolute Cloudinary URL, or a relative /uploads/... path on disk.
export async function storeImage(
  buffer: Buffer,
  kind: ImageKind,
  filename: string,
): Promise<string> {
  if (cloudinaryEnabled) {
    return new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `cropbid/${kind}`,
            public_id: filename.replace(/\.webp$/, ''),
            resource_type: 'image',
          },
          (err, result) => {
            if (err || !result) reject(err ?? new Error('Cloudinary upload failed'));
            else resolve(result.secure_url);
          },
        )
        .end(buffer);
    });
  }

  const dir = path.join(UPLOAD_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${kind}/${filename}`;
}

// Best-effort delete of a previously stored image (e.g. a replaced avatar).
// Accepts whatever storeImage returned; unknown/foreign URLs are ignored.
// Never throws — a leaked orphan image is not worth failing the request over.
export async function removeImage(url: string): Promise<void> {
  try {
    if (url.startsWith('/uploads/')) {
      // Local disk. basename() guards against a tampered DB value escaping
      // the uploads directory.
      const kind = url.split('/')[2];
      if (kind !== 'listings' && kind !== 'avatars') return;
      fs.unlink(path.join(UPLOAD_DIR, kind, path.basename(url)), () => {});
      return;
    }
    if (cloudinaryEnabled && url.includes('res.cloudinary.com')) {
      const publicId = cloudinaryPublicId(url);
      if (publicId) await cloudinary.uploader.destroy(publicId);
    }
  } catch {
    // swallow — see note above
  }
}

// https://res.cloudinary.com/<cloud>/image/upload/v123/cropbid/avatars/abc.webp
//   → "cropbid/avatars/abc"
function cloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  return match ? match[1] : null;
}
