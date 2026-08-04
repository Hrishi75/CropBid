// =============================================================================
// Voice Controller — HTTP Layer
// =============================================================================
// Thin, per the house convention: parse the request, call the service, set the
// status. No business logic here.
// =============================================================================

import { Request, Response, NextFunction } from 'express';

import * as voiceService from '../services/voice.service';
import { isSarvamConfigured, MAX_AUDIO_SECONDS } from '../services/sarvam.service';
import type { VerifiedAudio } from '../middleware/uploadVoice';
import { ApiError } from '../utils/ApiError';

// GET /api/voice/status — can this account use voice input right now?
//
// WHY AN ENDPOINT FOR ONE BOOLEAN:
// It is how the feature disappears cleanly instead of breaking. The client asks
// first and simply does not render the microphone when the answer is false, so
// a farmer never taps a control that then errors. When the trial credits lapse,
// emptying SARVAM_API_KEY is the whole rollback — no deploy, no code change.
export async function getVoiceStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      enabled: isSarvamConfigured(),
      // The client enforces this as its recording ceiling. Sent from here so
      // the limit lives in one place (sarvam.service) rather than being
      // duplicated as a client constant that can drift.
      maxSeconds: MAX_AUDIO_SECONDS,
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/voice/listing-draft — voice note in, suggested form fields out.
//
// ⚠️ THIS CREATES NOTHING. It is a read-only transform: no listing, no row, no
// stored audio. Every field it returns is a SUGGESTION the farmer reviews and
// edits, and publishing still goes through POST /listings unchanged. Keep it
// that way — the moment this writes, a mis-transcription becomes a live listing
// instead of a field someone corrects.
export async function createListingDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const audio = (req as Request & { verifiedAudio?: VerifiedAudio }).verifiedAudio;
    if (!audio) {
      // assertRealAudio should have caught this. Belt and braces, because
      // reaching the service with no buffer would be a confusing 500.
      throw new ApiError(400, 'No recording was uploaded.');
    }

    const draft = await voiceService.draftListingFromAudio(
      req.user!.userId,
      audio.buffer,
      audio.mimeType,
    );

    res.json(draft);
  } catch (error) {
    next(error);
  }
}
