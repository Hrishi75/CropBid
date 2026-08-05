// =============================================================================
// audioSignature tests — the content check that multer's MIME filter cannot do
// =============================================================================
// Real byte sequences rather than fixtures on disk, so the assertions state the
// actual signatures and a wrong constant cannot quietly pass. Same approach as
// imageSignature.test.ts.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { detectAudioFormat, AUDIO_MIME } from './audioSignature';

// Helpers that build headers exactly as each format specifies.
const webm = () =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);

const ogg = () => Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(12)]);

const wav = () =>
  Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]), // little-endian size, value irrelevant
    Buffer.from('WAVE', 'latin1'),
    Buffer.alloc(4),
  ]);

// major brand at 8, minor version at 12, compatible brands from 16 onwards.
const mp4 = (major = 'M4A ', compatible: string[] = []) => {
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

const mp3Id3 = () => Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(13)]);
// A real MPEG-1 Layer III frame header: sync, version 11, layer 01, then a
// 128 kbps / 44.1 kHz byte. The sync word alone is not enough — see
// isMp3FrameHeader.
const mp3Sync = () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(12)]);

describe('detectAudioFormat — accepts the formats browsers actually produce', () => {
  // Chrome, Firefox and Edge MediaRecorder default.
  it('detects WebM', () => expect(detectAudioFormat(webm())).toBe('webm'));
  it('detects Ogg', () => expect(detectAudioFormat(ogg())).toBe('ogg'));
  it('detects WAV', () => expect(detectAudioFormat(wav())).toBe('wav'));
  // Safari MediaRecorder default — miss this and iPhone users cannot record.
  it('detects MP4/M4A', () => expect(detectAudioFormat(mp4())).toBe('mp4'));
  it('detects MP3 with an ID3 tag', () => expect(detectAudioFormat(mp3Id3())).toBe('mp3'));
  it('detects MP3 from a bare frame sync', () => expect(detectAudioFormat(mp3Sync())).toBe('mp3'));

  it('accepts an mp4 whose major brand is generic but lists M4A as compatible', () => {
    expect(detectAudioFormat(mp4('isom', ['M4A ']))).toBe('mp4');
  });

  it('every detected format has a MIME mapping', () => {
    for (const format of ['webm', 'ogg', 'wav', 'mp4', 'mp3'] as const) {
      expect(AUDIO_MIME[format]).toMatch(/^audio\//);
    }
  });
});

describe('detectAudioFormat — rejects everything else', () => {
  it('rejects RIFF without WAVE', () => {
    // A WebP image is also a RIFF container. Accepting "RIFF" alone would let
    // one through and we would pay Sarvam to transcribe a picture.
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'latin1'),
      Buffer.alloc(4),
    ]);
    expect(detectAudioFormat(webp)).toBeNull();
  });

  it('rejects an ftyp box with no audio brand', () => {
    expect(detectAudioFormat(mp4('avif', ['mif1']))).toBeNull();
  });

  it('rejects an HTML file', () => {
    expect(detectAudioFormat(Buffer.from('<!doctype html><html><body>hi</body></html>'))).toBeNull();
  });

  it('rejects a JPEG', () => {
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]))).toBeNull();
  });

  it('rejects a PNG', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]);
    expect(detectAudioFormat(png)).toBeNull();
  });

  it('rejects a bare sync word with an otherwise invalid frame header', () => {
    // 11 set bits is a weak signature; the reserved encodings must be checked
    // too or arbitrary binary reads as MP3.
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.alloc(12)]))).toBeNull();
    // Reserved MPEG version.
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xeb, 0x90, 0x00]), Buffer.alloc(12)]))).toBeNull();
    // Reserved layer.
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xf9, 0x90, 0x00]), Buffer.alloc(12)]))).toBeNull();
    // "bad" bitrate index.
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xfb, 0xf0, 0x00]), Buffer.alloc(12)]))).toBeNull();
    // Reserved sample rate.
    expect(detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xfb, 0x9c, 0x00]), Buffer.alloc(12)]))).toBeNull();
  });

  it('rejects a buffer too short to identify', () => {
    expect(detectAudioFormat(Buffer.from([0x1a, 0x45, 0xdf]))).toBeNull();
    expect(detectAudioFormat(Buffer.alloc(0))).toBeNull();
  });

  it('does not read past the buffer on a hostile ftyp size field', () => {
    // Claims a 4 GB box while carrying 20 bytes. The walk must be bounded by
    // what we actually hold, not by what the file says.
    const head = Buffer.alloc(4);
    head.writeUInt32BE(0xffffffff, 0);
    const hostile = Buffer.concat([
      head,
      Buffer.from('ftyp', 'latin1'),
      Buffer.from('junk', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('junk', 'latin1'),
    ]);

    expect(() => detectAudioFormat(hostile)).not.toThrow();
    expect(detectAudioFormat(hostile)).toBeNull();
  });
});
