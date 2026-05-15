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
