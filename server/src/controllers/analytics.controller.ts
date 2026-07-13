// =============================================================================
// Analytics Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analytics.service';

export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, userId } = req.user!;

    // Dispatch by role EXPLICITLY. The admin branch must be gated on
    // role === 'ADMIN' — a bare `else` let any other authenticated role
    // (notably CONSUMER, a self-service signup role) fall through to the
    // platform-wide financials in getAdminAnalytics(). Unknown/other roles
    // get 403, never admin data.
    let data;
    if (role === 'FARMER') {
      data = await analyticsService.getFarmerAnalytics(userId);
    } else if (role === 'BUYER') {
      data = await analyticsService.getBuyerAnalytics(userId);
    } else if (role === 'ADMIN') {
      data = await analyticsService.getAdminAnalytics();
    } else {
      return res.status(403).json({ message: 'Analytics are not available for this account type' });
    }

    if (!data) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
}
