// =============================================================================
// Image signature ("magic byte") validation
// =============================================================================
// WHY, WHEN MULTER ALREADY FILTERS BY MIME TYPE?
// Multer's fileFilter sees `file.mimetype`, which is whatever the client put in
// the multipart Content-Type header. It is a claim, not a fact — an attacker
// sends `image/jpeg` and any bytes they like.
//
// Every real image format starts with a fixed byte signature, and that is part
// of the file rather than the request, so it cannot be spoofed by editing a
// header. Checking it here means non-images are rejected BEFORE sharp (and
// therefore libvips) parses them.
//
// This is defence in depth, not a fix for a live hole: sharp is patched, and it
// rejects non-images on its own. The point is to keep untrusted bytes away from
// a large C image-parsing surface, so the NEXT libvips CVE is not immediately
// reachable from an open signup form.
// =============================================================================

import fs from 'fs';

// Longest signature we need to inspect: AVIF's brand sits at bytes 8-11, so 12
// bytes is enough. Read 16 for headroom.
const HEADER_BYTES = 16;

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

// Reads only the header, never the whole file — a 5 MB upload costs 16 bytes here.
export function readHeader(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEADER_BYTES);
    const read = fs.readSync(fd, buf, 0, HEADER_BYTES, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

// Returns the format the BYTES say it is, or null if it is not an image we accept.
export function detectImageFormat(header: Buffer): ImageFormat | null {
  if (header.length < 12) return null;

  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'jpeg';

  // PNG: 89 "PNG" CR LF 1A LF
  if (
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
    header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP". Both markers must be
  // present — "RIFF" alone is also WAV, AVI and others.
  if (header.subarray(0, 4).toString('latin1') === 'RIFF' &&
      header.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }

  // AVIF is ISO-BMFF: a 4-byte box size, then "ftyp", then the brand. Only the
  // AVIF brands are accepted — sibling brands in the same container family
  // (heic/heif) are deliberately NOT, because the MIME allowlist does not
  // include them either and the two must agree.
  if (header.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = header.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
}

// Convenience wrapper for the upload middleware.
export function detectImageFormatAtPath(filePath: string): ImageFormat | null {
  return detectImageFormat(readHeader(filePath));
}
