// =============================================================================
// Negotiation Controller — HTTP Layer for AI Negotiations
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as negotiationService from '../services/negotiation.service';

// POST /api/negotiations/start — Start an AI negotiation on a bid
export async function startNegotiation(req: Request, res: Response, next: NextFunction) {
  try {
    const { bidId } = req.body;

    if (!bidId) {
      return res.status(400).json({ message: 'bidId is required' });
    }

    const negotiation = await negotiationService.startNegotiation(
      bidId,
      req.user!.userId
    );

    res.status(201).json(negotiation);
  } catch (error) {
    next(error);
  }
}

// GET /api/negotiations — List my negotiations
export async function getMyNegotiations(req: Request, res: Response, next: NextFunction) {
  try {
    const negotiations = await negotiationService.getMyNegotiations(
      req.user!.userId,
      req.user!.role
    );

    res.json(negotiations);
  } catch (error) {
    next(error);
  }
}

// GET /api/negotiations/:id — View a specific negotiation
export async function getNegotiation(req: Request, res: Response, next: NextFunction) {
  try {
    const negotiation = await negotiationService.getNegotiation(
      req.params.id as string,
      req.user!.userId
    );

    res.json(negotiation);
  } catch (error) {
    next(error);
  }
}

// GET /api/negotiations/bid/:bidId — Get negotiation for a specific bid
export async function getNegotiationByBid(req: Request, res: Response, next: NextFunction) {
  try {
    const negotiation = await negotiationService.getNegotiationByBid(
      req.params.bidId as string,
      req.user!.userId
    );

    res.json(negotiation);
  } catch (error) {
    next(error);
  }
}
