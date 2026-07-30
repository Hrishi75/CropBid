// =============================================================================
// imageSignature tests — the content check that multer's MIME filter cannot do
// =============================================================================
// These use real byte sequences rather than fixtures on disk, so the assertions
// state the actual signatures and a wrong constant cannot quietly pass.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { detectImageFormat } from './imageSignature';

// Helpers that build headers exactly as each format specifies.
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]), // little-endian size, value irrelevant
    Buffer.from('WEBP', 'latin1'),
    Buffer.alloc(4),
  ]);
// major brand at 8, minor version at 12, compatible brands from 16 onwards.
const avif = (major = 'avif', compatible: string[] = []) => {
  const brands = Buffer.concat(compatible.map((b) => Buffer.from(b, 'latin1')));
  const size = 16 + brands.length;
  const head = Buffer.alloc(4);
  head.writeUInt32BE(size, 0);
  return Buffer.concat([
    head,
    Buffer.from('ftyp', 'latin1'),
    Buffer.from(major, 'latin1'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // minor version
    brands,
  ]);
};

describe('detectImageFormat — accepts the four real formats', () => {
  it('detects JPEG', () => expect(detectImageFormat(jpeg())).toBe('jpeg'));
  it('detects PNG', () => expect(detectImageFormat(png())).toBe('png'));
  it('detects WebP', () => expect(detectImageFormat(webp())).toBe('webp'));
  it('detects AVIF', () => expect(detectImageFormat(avif())).toBe('avif'));
  it('detects AVIF image sequences (avis brand)', () =>
    expect(detectImageFormat(avif('avis'))).toBe('avif'));

  // Encoders legitimately emit a GENERIC major brand and declare avif only among
  // the compatible brands. Checking bytes 8-11 alone would 400 these — real
  // files that sharp decodes perfectly well.
  it('detects AVIF declared as a compatible brand under a mif1 major brand', () =>
    expect(detectImageFormat(avif('mif1', ['avif', 'mia1']))).toBe('avif'));

  it('detects AVIF declared as a compatible brand under a msf1 major brand', () =>
    expect(detectImageFormat(avif('msf1', ['msf1', 'avis']))).toBe('avif'));

  it('finds avif late in a long compatible-brands list', () =>
    expect(detectImageFormat(avif('mif1', ['mia1', 'miaf', 'MA1B', 'avif']))).toBe('avif'));
});

describe('detectImageFormat — rejects what the MIME header would have let through', () => {
  it('rejects HTML, the stored-XSS payload shape', () => {
    // The exact case the old code allowed: Content-Type says image/jpeg, the
    // bytes are a script, and the file lands in a publicly served directory.
    expect(detectImageFormat(Buffer.from('<html><script>alert(1)</script>x'))).toBeNull();
  });

  it('rejects a PDF', () => {
    expect(detectImageFormat(Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'))).toBeNull();
  });

  it('rejects an ELF executable', () => {
    expect(
      detectImageFormat(Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(12)])),
    ).toBeNull();
  });

  it('rejects a ZIP (and therefore anything zip-based)', () => {
    expect(
      detectImageFormat(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(12)])),
    ).toBeNull();
  });

  it('rejects an SVG — text/xml, and a real XSS vector when served inline', () => {
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000'))).toBeNull();
  });
});

describe('detectImageFormat — container look-alikes must not pass', () => {
  it('rejects RIFF that is not WEBP (WAV shares the RIFF container)', () => {
    // "RIFF" alone is WAV/AVI too, so requiring only the first marker would
    // accept audio and video as images.
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'latin1'),
      Buffer.alloc(4),
    ]);
    expect(detectImageFormat(wav)).toBeNull();
  });

  it('rejects sibling ISO-BMFF brands we do not accept (heic, mp4)', () => {
    // Same container family as AVIF. Deliberately rejected: the MIME allowlist
    // does not include them, and the two checks must agree.
    expect(detectImageFormat(avif('heic'))).toBeNull();
    expect(detectImageFormat(avif('mp42'))).toBeNull();
    expect(detectImageFormat(avif('isom'))).toBeNull();
  });

  it('rejects heic even when it lists other compatible brands', () => {
    // Widening to compatible brands must not accidentally admit the whole
    // ISO-BMFF family — only avif/avis count, wherever they appear.
    expect(detectImageFormat(avif('heic', ['mif1', 'heic', 'hevc']))).toBeNull();
    expect(detectImageFormat(avif('mp42', ['isom', 'mp42', 'avc1']))).toBeNull();
  });

  it('does not read past the buffer when the box size field is absurd', () => {
    // A hostile file can claim any size. The scan must clamp to bytes actually
    // read rather than trusting the header.
    const bogus = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]), // claims 4 GB
      Buffer.from('ftyp', 'latin1'),
      Buffer.from('heic', 'latin1'),
      Buffer.alloc(4),
    ]);
    expect(() => detectImageFormat(bogus)).not.toThrow();
    expect(detectImageFormat(bogus)).toBeNull();
  });
});

describe('detectImageFormat — malformed input', () => {
  it('rejects a buffer too short to hold any signature', () => {
    expect(detectImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('rejects an empty buffer without throwing', () => {
    expect(() => detectImageFormat(Buffer.alloc(0))).not.toThrow();
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
  });

  it('rejects all-zero bytes', () => {
    expect(detectImageFormat(Buffer.alloc(16))).toBeNull();
  });

  it('rejects a JPEG signature that is truncated one byte short', () => {
    // FF D8 without the third FF is not a JPEG SOI marker.
    expect(
      detectImageFormat(Buffer.concat([Buffer.from([0xff, 0xd8, 0x00]), Buffer.alloc(13)])),
    ).toBeNull();
  });
});
