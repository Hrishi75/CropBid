// =============================================================================
// Analytics Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analytics.service';

export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, userId } = req.user!;

    let data;
    if (role === 'FARMER') {
      data = await analyticsService.getFarmerAnalytics(userId);
    } else if (role === 'BUYER') {
      data = await analyticsService.getBuyerAnalytics(userId);
    } else {
      data = await analyticsService.getAdminAnalytics();
    }

    if (!data) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
}
