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

// AVIF needs more than its major brand: the ftyp box is
//   [4 size][4 "ftyp"][4 major brand][4 minor version][4 compatible brand]...
// and a valid AVIF may declare a generic major brand (mif1/msf1) while listing
// "avif" among the COMPATIBLE brands. Reading only bytes 8-11 would 400 files
// that sharp decodes perfectly well, so read enough to walk that list.
// 64 bytes covers a dozen brands, far more than any real file uses.
const HEADER_BYTES = 64;

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

  // AVIF is ISO-BMFF:
  //   [4 size][4 "ftyp"][4 major brand][4 minor version][4 compatible brand]...
  //
  // The major brand alone is not enough. Encoders legitimately emit a generic
  // major brand (mif1, msf1) and declare "avif" only in the compatible-brands
  // list, so checking bytes 8-11 in isolation rejects valid files that sharp
  // decodes fine. Walk the major brand AND every compatible brand.
  //
  // Sibling brands in the same container family (heic, heif, mp42, isom) are
  // still rejected: the MIME allowlist does not include them, and the two
  // checks have to agree.
  if (header.subarray(4, 8).toString('latin1') === 'ftyp') {
    // Trust the box size only as far as the bytes we actually read — a bogus
    // size field must not push us past the end of the buffer.
    const declaredSize = header.readUInt32BE(0);
    const limit = Math.min(declaredSize || header.length, header.length);

    // Major brand at 8, minor version at 12 (skipped), compatible brands from 16.
    for (let offset = 8; offset + 4 <= limit; offset += 4) {
      if (offset === 12) continue; // minor version, not a brand
      const brand = header.subarray(offset, offset + 4).toString('latin1');
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
  }

  return null;
}

// Convenience wrapper for the upload middleware.
export function detectImageFormatAtPath(filePath: string): ImageFormat | null {
  return detectImageFormat(readHeader(filePath));
}
