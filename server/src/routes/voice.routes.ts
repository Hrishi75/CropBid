// =============================================================================
// Voice Routes — /api/voice
// =============================================================================
// Farmers only: the one thing voice does today is fill in the listing form, and
// that form is farmer-only. Widen this when there is a second use, not before.
// =============================================================================

import { Router } from 'express';

import * as voiceController from '../controllers/voice.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { uploadVoice, assertRealAudio } from '../middleware/uploadVoice';
import { voiceLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate, requireRole('FARMER'));

// /status is a bare boolean and is polled on page load, so it stays outside the
// limiter — it costs nothing and rate-limiting it would hide the mic button on
// a busy tab.
router.get('/status', voiceController.getVoiceStatus);

// Everything below spends money. The limiter goes here, AFTER authenticate, so
// its key can include the user id — mounted at the app level it would only ever
// see an unauthenticated request and silently degrade to IP-only, which on
// Indian mobile CGNAT means one user throttling a whole town.
router.use(voiceLimiter);

// Order matters: multer parses the multipart body, then assertRealAudio checks
// the BYTES are really audio before the controller spends a metered API call
// on them.
router.post(
  '/listing-draft',
  uploadVoice.single('audio'),
  assertRealAudio,
  voiceController.createListingDraft,
);

export default router;
