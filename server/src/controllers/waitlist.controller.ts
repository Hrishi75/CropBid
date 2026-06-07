// =============================================================================
// Waitlist Controller — HTTP Layer
// =============================================================================
// Single public endpoint to join the email waitlist. Validates the email,
// dedupes against existing entries, and inserts via Prisma. Simple enough that
// it talks to the DB directly rather than through a dedicated service.
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

export async function joinWaitlist(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      throw new ApiError(400, 'Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ApiError(400, 'Invalid email format');
    }

    // Check if already on the waitlist
    const existing = await prisma.waitlist.findUnique({ where: { email } });
    if (existing) {
      return res.json({ message: 'You are already on the waitlist!' });
    }

    await prisma.waitlist.create({ data: { email } });

    res.json({ message: 'Successfully joined the waitlist' });
  } catch (error) {
    next(error);
  }
}
