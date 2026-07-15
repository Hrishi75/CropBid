// =============================================================================
// Schemes Controller — HTTP Layer
// =============================================================================
// Public (no auth) Sarkari Yojana catalogue:
//   GET /api/schemes            → full catalogue + category labels
//   GET /api/schemes?q=&cat=    → filtered server-side (clients may also
//                                 filter locally — the catalogue is small)
// Long public cache — the catalogue changes only when we curate it.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { searchSchemes, CATEGORY_LABEL } from '../services/schemes.service';

export async function getSchemes(req: Request, res: Response, next: NextFunction) {
  try {
    const q = (req.query.q as string) || undefined;
    const cat = (req.query.cat as string) || undefined;
    const schemes = searchSchemes(q, cat);
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day
    res.json({ count: schemes.length, categories: CATEGORY_LABEL, schemes });
  } catch (error) {
    next(error);
  }
}
