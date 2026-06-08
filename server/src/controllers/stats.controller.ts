// =============================================================================
// Stats Controller — HTTP Layer
// =============================================================================
// HTTP wrapper for the public landing-page stats endpoint. Delegates to
// stats.service and sets a 60s public cache header (data is non-sensitive and
// changes slowly, so the CDN/browser can cache it).
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as statsService from '../services/stats.service';

export async function getLandingStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await statsService.getLandingStats();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data);
  } catch (error) {
    next(error);
  }
}
