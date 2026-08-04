// =============================================================================
// Voice note upload — memory only, never written to disk
// =============================================================================
// WHY THIS DIVERGES FROM upload.ts:
// The image middleware uses multer's DISK storage on purpose — five concurrent
// 5 MB uploads held in RAM would be a memory-exhaustion vector, so it writes
// them out and unlinks them in a `finally`.
//
// Voice notes take the opposite trade, for a reason worth stating plainly: the
// promise we make about a recording of a farmer's voice is that we do not keep
// it. With disk storage that promise is only as good as a `finally` block —
// one early return, one thrown error on an untested path, and a voice note is
// sitting in a directory that app.ts serves statically. With memory storage
// there is no file to leak. The guarantee is structural rather than
// procedural, and that is worth the RAM.
//
// The RAM is bounded and small: one file, 2 MB max, and voiceLimiter caps how
// often a user can even try. A 25-second Opus clip is 50-200 KB, so 2 MB is
// ~10x headroom and doubles as a backstop against Sarvam's 30-second ceiling
// for any client that ignores the recording timer.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

import { detectAudioFormat, AUDIO_MIME, type AudioFormat } from '../utils/audioSignature';
import { ApiError } from '../utils/ApiError';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const REJECTION_MESSAGE = 'That does not look like an audio recording.';

// First, cheap gate only — `file.mimetype` is the client's claim, not a fact
// about the bytes (same reasoning as upload.ts). The check that matters is the
// magic-byte one in assertRealAudio below.
//
// The list has to cover what every browser's MediaRecorder actually emits:
// Chrome/Firefox/Edge produce `audio/webm;codecs=opus` (hence the prefix match
// rather than equality — the codecs parameter is part of the string), and
// SAFARI PRODUCES audio/mp4. Dropping the mp4 entry would silently lock out
// every iPhone user, which is most farmers.
const ALLOWED_MIME_PREFIXES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/x-wav',
];

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  const mime = (file.mimetype || '').toLowerCase();
  if (ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    cb(null, true);
  } else {
    cb(new ApiError(400, REJECTION_MESSAGE));
  }
}

export const uploadVoice = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_AUDIO_BYTES,
    files: 1,
  },
});

// What assertRealAudio hands to the controller. The MIME here is derived from
// the BYTES, not from the client's header, so a correctly-encoded file with a
// sloppy Content-Type is still forwarded to Sarvam under the right type.
export interface VerifiedAudio {
  buffer: Buffer;
  format: AudioFormat;
  mimeType: string;
}

/**
 * Rejects anything whose bytes are not audio, before we spend a paid API call
 * on it. Attaches the verified buffer to the request.
 *
 * Mounted after uploadVoice.single('audio') — see routes/voice.routes.ts.
 */
export function assertRealAudio(req: Request, _res: Response, next: NextFunction) {
  const file = req.file;
  if (!file?.buffer?.length) {
    return next(new ApiError(400, 'No recording was uploaded.'));
  }

  const format = detectAudioFormat(file.buffer);
  if (!format) {
    return next(new ApiError(400, REJECTION_MESSAGE));
  }

  (req as Request & { verifiedAudio?: VerifiedAudio }).verifiedAudio = {
    buffer: file.buffer,
    format,
    mimeType: AUDIO_MIME[format],
  };

  next();
}
