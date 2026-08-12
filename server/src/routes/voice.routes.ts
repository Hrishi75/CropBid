// =============================================================================
// Voice Routes — /api/voice
// =============================================================================
// Two dictation targets, one per side of the trade, each locked to the role
// whose form it fills: farmers draft listings, buyers draft requirements. The
// role guards sit on the individual routes rather than on the router, because
// /status has to answer for both — it is what decides whether either form
// renders a microphone at all.
// =============================================================================

import { Router } from 'express';

import * as voiceController from '../controllers/voice.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { uploadVoice, assertRealAudio } from '../middleware/uploadVoice';
import { voiceLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// /status is a bare boolean and is polled on page load, so it stays outside the
// limiter — it costs nothing and rate-limiting it would hide the mic button on
// a busy tab.
router.get('/status', requireRole('FARMER', 'BUYER'), voiceController.getVoiceStatus);

// Everything below spends money. The limiter goes here, AFTER authenticate, so
// its key can include the user id — mounted at the app level it would only ever
// see an unauthenticated request and silently degrade to IP-only, which on
// Indian mobile CGNAT means one user throttling a whole town.
router.use(voiceLimiter);

// Order matters: the role guard rejects before multer buffers a body, then
// multer parses the multipart body, then assertRealAudio checks the BYTES are
// really audio — all before the controller spends a metered API call on them.
router.post(
  '/listing-draft',
  requireRole('FARMER'),
  uploadVoice.single('audio'),
  assertRealAudio,
  voiceController.createListingDraft,
);

router.post(
  '/requirement-draft',
  requireRole('BUYER'),
  uploadVoice.single('audio'),
  assertRealAudio,
  voiceController.createRequirementDraft,
);

export default router;
