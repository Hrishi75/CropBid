// =============================================================================
// Audio signature ("magic byte") validation
// =============================================================================
// The audio twin of imageSignature.ts, and it exists for the same reason:
// multer's fileFilter only sees `file.mimetype`, which is a claim the client
// makes in a header, not a fact about the bytes. An attacker sends
// `audio/webm` and any payload they like.
//
// WHY IT MATTERS HERE EVEN THOUGH WE NEVER DECODE THE AUDIO:
// We don't parse these bytes — we forward them to Sarvam. So the risk isn't a
// local decoder CVE, it's paying a metered API to transcribe whatever someone
// felt like uploading, and handing a third party bytes from our users that
// were never audio in the first place. Rejecting non-audio here is the cheap
// guard on both.
//
// WORKS ON A BUFFER, NOT A PATH — unlike imageSignature, which reads from
// disk. Voice notes are held in memory and never written to a file (see
// middleware/uploadVoice.ts for why), so there is nothing to open.
// =============================================================================

export type AudioFormat = 'webm' | 'ogg' | 'wav' | 'mp4' | 'mp3';

// Enough to cover an ftyp box's brand list without reading a whole clip. Same
// reasoning as imageSignature's HEADER_BYTES: one page, and the box's own
// declared size bounds the scan within it.
const HEADER_BYTES = 4096;

// The MIME each format maps to when we hand it on to Sarvam. Derived from the
// BYTES, never from what the client claimed, so a mislabelled-but-valid file
// is forwarded correctly rather than rejected.
export const AUDIO_MIME: Record<AudioFormat, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
};

/**
 * The format the BYTES say this is, or null when it is not audio we accept.
 *
 * The five formats here are exactly what browser MediaRecorder produces across
 * the browsers we support — webm/opus on Chrome, Firefox and Edge, mp4 on
 * Safari — plus ogg, wav and mp3 for anything hand-uploaded.
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat | null {
  const header = buffer.subarray(0, HEADER_BYTES);

  // Every branch below reads at least 12 bytes, so anything shorter cannot be
  // a container we recognise.
  if (header.length < 12) return null;

  // WebM / Matroska: EBML header 1A 45 DF A3.
  if (
    header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
  ) {
    return 'webm';
  }

  // Ogg (Opus/Vorbis): "OggS".
  if (header.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';

  // WAV is a RIFF container: "RIFF" <4-byte size> "WAVE". Both markers are
  // required — "RIFF" alone is also WebP, AVI and others, exactly the
  // ambiguity imageSignature.ts calls out for WebP.
  if (
    header.subarray(0, 4).toString('latin1') === 'RIFF' &&
    header.subarray(8, 12).toString('latin1') === 'WAVE'
  ) {
    return 'wav';
  }

  // MP4 / M4A is ISO-BMFF, same layout as AVIF:
  //   [4 size][4 "ftyp"][4 major brand][4 minor version][4 compatible brand]...
  //
  // Safari's MediaRecorder emits audio/mp4, and the major brand it uses is not
  // guaranteed to be M4A — walk the compatible brands too, as the image
  // detector does, rather than trusting bytes 8-11 alone.
  if (header.subarray(4, 8).toString('latin1') === 'ftyp') {
    // Bound the walk by the bytes we actually hold: a hostile size field must
    // not push the scan past the end of the buffer.
    const declaredSize = header.readUInt32BE(0);
    const limit = Math.min(declaredSize || header.length, header.length);

    for (let offset = 8; offset + 4 <= limit; offset += 4) {
      if (offset === 12) continue; // minor version, not a brand
      const brand = header.subarray(offset, offset + 4).toString('latin1');
      if (brand === 'M4A ' || brand === 'mp42' || brand === 'mp41' || brand === 'isom' || brand === 'iso5') {
        return 'mp4';
      }
    }
  }

  // MP3, two legal openings:
  //   - an ID3v2 tag ("ID3"), which is what most encoders write
  //   - a bare frame header, which needs more than its sync word (see below)
  if (header.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (isMp3FrameHeader(header)) return 'mp3';

  return null;
}

// An MP3 frame sync is only 11 set bits, which is a far weaker signature than
// the other formats here — roughly 1 in 2048 random byte pairs matches. Testing
// the sync alone would classify all sorts of non-audio as MP3, including the
// 0xFFFFFFFF size field of a malformed ISO-BMFF box.
//
// So validate the rest of the frame header too. The four reserved encodings
// below are illegal in every MPEG audio frame, and checking them takes the
// false-positive rate down by ~3 orders of magnitude for the cost of four
// comparisons:
//
//   byte 0 : 11111111                    sync
//   byte 1 : 111 VV LL P                 version, layer, protection
//   byte 2 : BBBB SS p e                 bitrate index, sample rate, padding, private
function isMp3FrameHeader(header: Buffer): boolean {
  if (header.length < 4) return false;
  if (header[0] !== 0xff || (header[1]! & 0xe0) !== 0xe0) return false;

  const version = (header[1]! >> 3) & 0x03;
  const layer = (header[1]! >> 1) & 0x03;
  const bitrateIndex = (header[2]! >> 4) & 0x0f;
  const sampleRate = (header[2]! >> 2) & 0x03;

  if (version === 0b01) return false;      // reserved MPEG version
  if (layer === 0b00) return false;        // reserved layer
  if (bitrateIndex === 0b1111) return false; // "bad" bitrate, never valid
  if (bitrateIndex === 0b0000) return false; // "free" bitrate — legal but no encoder we accept emits it
  if (sampleRate === 0b11) return false;   // reserved sample rate

  return true;
}
